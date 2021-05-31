const moduleName = 'rhyme-game_match_handler';

let InitModule: nkruntime.InitModule = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, initializer: nkruntime.Initializer) {
    initializer.registerRtBefore('MatchCreate', beforeCreateMatch);

    initializer.registerRpc('create_match_server_authoritative', createMatchRpc);
    
    initializer.registerMatch(moduleName, {
        matchInit,
        matchJoinAttempt,
        matchJoin,
        matchLoop,
        matchLeave,
        matchTerminate
    });

    logger.info('JavaScript logic loaded.');
};

let beforeCreateMatch: nkruntime.RtBeforeHookFunction<nkruntime.Envelope> = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, envelope: nkruntime.Envelope): nkruntime.Envelope | void {
    logger.debug('beforeCreateMatch hook called');
    logger.debug('Context: %s', JSON.stringify(ctx));
    logger.debug('Envelope: %s', JSON.stringify(envelope));

    return envelope;
};

let createMatchRpc: nkruntime.RpcFunction = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string | void {
    const matchId = nk.matchCreate(moduleName);

    logger.debug('Created match with ID: %s', matchId);

    return JSON.stringify({
        match_id: matchId
    });
};

const minPlayers: number = 2;
const maxPlayers: number = 16;

type Stage = 'gettingReady' | 'inProgress' | 'results';
type Mode = 'sequential' | 'parallel';

interface GameState {
    stage: Stage,
    settings: {
        mode: Mode
    },
    presences: {[userId: string]: nkruntime.Presence},
    host: nkruntime.Presence | null,
    playersJoinOrder: string[],
    kickedPlayerIds: {[userId: string]: true}
}

function decodeMessageData<T>(data: string): T | undefined {
    try {
        return JSON.parse(data) as T;
    } catch (error) {
        return undefined;
    }
}

let matchInit: nkruntime.MatchInitFunction = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, params: {[key: string]: string}): {state: nkruntime.MatchState, tickRate: number, label: string} {
    logger.debug('matchInit called');

    const initialState: GameState = {
        stage: 'gettingReady',
        settings: {
            mode: 'parallel'
        },
        presences: {},
        host: null,
        playersJoinOrder: [],
        kickedPlayerIds: {}
    };

    return {
        state: initialState,
        tickRate: 1,
        label: ''
    };
};

let matchJoinAttempt: nkruntime.MatchJoinAttemptFunction = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, presence: nkruntime.Presence, metadata: {[key: string]: any}): {state: nkruntime.MatchState, accept: boolean, rejectMessage?: string} | null {
    logger.debug('matchJoinAttempt called');

    const gameState: GameState = state as GameState;
    const playersCount: number = Object.keys(gameState.presences).length;

    if (playersCount >= maxPlayers) {
        return {
            state: gameState,
            accept: false,
            rejectMessage: 'match full'
        };
    }

    if (gameState.stage !== 'gettingReady') {
        return {
            state: gameState,
            accept: false,
            rejectMessage: 'game is in progress'
        };
    }

    if (gameState.presences[presence.userId]) {
        return {
            state: gameState,
            accept: false,
            rejectMessage: 'already joined'
        };
    }

    if (gameState.kickedPlayerIds[presence.userId]) {
        return {
            state: gameState,
            accept: false,
            rejectMessage: 'kicked'
        };
    }

    return {
        state: gameState,
        accept: true,
        rejectMessage: undefined
    };
};

let matchJoin: nkruntime.MatchJoinFunction = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, presences: nkruntime.Presence[]): {state: nkruntime.MatchState} | null {
    logger.debug('matchJoin called');

    const gameState: GameState = state as GameState;

    for (const presence of presences) {
        gameState.presences[presence.userId] = presence;
        // NOTE: mutable ways to append an element DID'T work (bug in goja?)
        gameState.playersJoinOrder = gameState.playersJoinOrder.concat(presence.userId);
    }

    // TODO: send update to a new player

    if (gameState.host) {
        logger.debug('Sending HOST_CHANGED');
        // NOTE: can't specify presences. See https://github.com/heroiclabs/nakama/issues/620
        dispatcher.broadcastMessage(OpCode.HOST_CHANGED, JSON.stringify({ userId: gameState.host.userId } as HostChangedMessageData)/*, presences*/);
    }
    
    return {
        state: gameState
    };
};

let matchLoop: nkruntime.MatchLoopFunction = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, messages: nkruntime.MatchMessage[]): {state: nkruntime.MatchState} | null {
    if (messages.length) {
        logger.debug('matchLoop called with messages: %d', messages.length);
    }

    const gameState: GameState = state as GameState;

    if (!gameState.host) {
        for (const userId of gameState.playersJoinOrder) {
            if (gameState.presences[userId]) {
                gameState.host = gameState.presences[userId];
                break;
            }
        }
        if (gameState.host) {
            logger.debug('Sending HOST_CHANGED');
            dispatcher.broadcastMessage(OpCode.HOST_CHANGED, JSON.stringify({ userId: gameState.host.userId } as HostChangedMessageData));
        }
    }

    for (const message of messages) {
        if (message.opCode === OpCode.KICK_PLAYER) {
            if (!gameState.host || gameState.host.userId !== message.sender.userId) {
                // not a host player
                continue;
            }
            if (gameState.stage !== 'gettingReady') {
                // wrong stage
                continue;
            }
            const data = decodeMessageData<KickPlayerMessageData>(message.data);
            if (!data || !data.userId) {
                // broken message data
                continue;
            }
            if (data.userId === message.sender.userId) {
                // himself
                continue;
            }
            if (!gameState.presences[data.userId]) {
                // not in the list
                continue;
            }
            logger.debug('Kicking player');
            gameState.kickedPlayerIds[data.userId] = true;
            dispatcher.matchKick([gameState.presences[data.userId]]);
        } else if (message.opCode === OpCode.START_GAME) {
            if (!gameState.host || gameState.host.userId !== message.sender.userId) {
                // not a host player
                continue;
            }
            if (gameState.stage !== 'gettingReady') {
                // wrong stage
                continue;
            }
            logger.debug('Starting game');
            gameState.stage = 'inProgress';
            dispatcher.broadcastMessage(OpCode.STAGE_CHANGED, JSON.stringify({}));
        }
    }

    return {
        state: gameState
    };
};

let matchLeave: nkruntime.MatchLeaveFunction = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, presences: nkruntime.Presence[]): {state: nkruntime.MatchState} | null {
    logger.debug('matchLeave called');

    const gameState: GameState = state as GameState;

    for (const presence of presences) {
        if (gameState.host && gameState.host.userId === presence.userId) {
            gameState.host = null;
        }
        delete gameState.presences[presence.userId];
    }

    // TODO: clean gameState.playersJoinOrder
    // TODO: what if user left when game is in progress
    // TODO: what if host left

    return {
        state: gameState
    };
};

let matchTerminate: nkruntime.MatchTerminateFunction = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, graceSeconds: number): {state: nkruntime.MatchState} | null {
    logger.debug('matchTerminate called');
    return {
        state
    };
};