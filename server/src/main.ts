const moduleName = 'rhyme-game_match_handler';

let InitModule: nkruntime.InitModule = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, initializer: nkruntime.Initializer) {
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

let createMatchRpc: nkruntime.RpcFunction = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string | void {
    const matchId = nk.matchCreate(moduleName);

    logger.debug('Created match with ID: %s', matchId);

    return JSON.stringify({
        match_id: matchId
    });
};

const minPlayers: number = 2;
const maxPlayers: number = 16;
const zeroStepDuration: number = 3000;
const minStepDuration: number = 30000;
const maxStepDuration: number = 300000;
const minRevealPercent: number = 10;
const maxRevealPercent: number = 50;

interface GameState {
    stage: Stage,
    settings: {
        showFullPreviousLine: boolean,
        revealLastWordInLines: boolean,
        revealAtMostPercent: number,
        stepDuration: number,
        turnOnTts: boolean
    },
    presences: {[userId: string]: nkruntime.Presence},
    host: string | undefined,
    playersJoinOrder: string[],
    kickedPlayerIds: {[userId: string]: true},
    gameResults: {[userId: string]: {
        author: string, // user id
        input: string // user input
    }[]},
    lastStep: number,
    currentStep: number,
    nextStepAt: number,
    playersReadyForNextStep: {[userId: string]: true},
    playerToResult: {[userId: string]: string[]}
}

function genRoundSteps(gameState: GameState) {
    const playersIds: string[] = Object.keys(gameState.presences);
    const playersCount: number = playersIds.length;
    const m = genRandomMatrix(playersCount);
    
    // another matrix
    const m2 = new Matrix(m.n);
    for (let i = 0; i < m2.n; ++i) {
        for (let j = 0; j < m2.n; ++j) {
            m2.setValueAt(i, m.getValueAt(i, j), j);
        }
    }

    gameState.playerToResult = {};
    gameState.gameResults = {};

    for (let i = 0; i < m2.n; ++i) {
        for (let j = 0; j < m2.n; ++j) {
            const playerId = playersIds[j];
            if (!gameState.playerToResult[playerId]) {
                gameState.playerToResult[playerId] = new Array(playersCount);
            }
            gameState.playerToResult[playerId][i] = playersIds[m2.getValueAt(i, j)];

            if (!gameState.gameResults[playerId]) {
                gameState.gameResults[playerId] = new Array(playersCount);
            }
            gameState.gameResults[playerId][i] = {author: playersIds[m.getValueAt(i, j)], input: ''};
        }
    }
}

let matchInit: nkruntime.MatchInitFunction = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, params: {[key: string]: string}): {state: nkruntime.MatchState, tickRate: number, label: string} {
    logger.debug('matchInit called');

    const initialState: GameState = {
        stage: 'gettingReady',
        settings: {
            showFullPreviousLine: true,
            revealLastWordInLines: true,
            revealAtMostPercent: 33,
            stepDuration: 180000,
            turnOnTts: true
        },
        presences: {},
        host: undefined,
        playersJoinOrder: [],
        kickedPlayerIds: {},
        gameResults: {},
        lastStep: NaN,
        currentStep: NaN,
        nextStepAt: NaN,
        playersReadyForNextStep: {},
        playerToResult: {}
    };

    return {
        state: initialState,
        tickRate: 2,
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
        dispatcher.broadcastMessage(OpCode.HOST_CHANGED, encodeMessageData({ userId: gameState.host } as HostChangedMessageData)/*, presences*/);
    }

    // NOTE: can't specify presences. See https://github.com/heroiclabs/nakama/issues/620
    dispatcher.broadcastMessage(OpCode.SETTINGS_UPDATE, encodeMessageData(gameState.settings));
    
    return {
        state: gameState
    };
};

let matchLoop: nkruntime.MatchLoopFunction = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, messages: nkruntime.MatchMessage[]): {state: nkruntime.MatchState} | null {
    if (messages.length) {
        logger.debug('matchLoop called with messages: %d', messages.length);
    }

    const gameState: GameState = state as GameState;
    const time: number = Date.now();

    if (!gameState.host) {
        for (const userId of gameState.playersJoinOrder) {
            if (gameState.presences[userId]) {
                gameState.host = userId;
                break;
            }
        }
        if (gameState.host) {
            logger.debug('Sending HOST_CHANGED');
            dispatcher.broadcastMessage(OpCode.HOST_CHANGED, encodeMessageData({ userId: gameState.host } as HostChangedMessageData));
        }
    }

    let sendReadyUpdate = false;

    for (const message of messages) {
        if (message.opCode === OpCode.KICK_PLAYER) {
            if (!gameState.host || gameState.host !== message.sender.userId) {
                // not a host player
                continue;
            }
            if (gameState.stage !== 'gettingReady') {
                // wrong stage
                continue;
            }
            const data = decodeMessageData<KickPlayerMessageData>(message.data);
            if (!data || typeof data !== 'object' || !data.userId || typeof data.userId !== 'string') {
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
        } else if (message.opCode === OpCode.SETTINGS_UPDATE) {
            if (!gameState.host || gameState.host !== message.sender.userId) {
                // not a host player
                continue;
            }
            if (gameState.stage !== 'gettingReady') {
                // wrong stage
                continue;
            }
            const data = decodeMessageData<{
                showFullPreviousLine: boolean,
                revealLastWordInLines: boolean,
                revealAtMostPercent: number,
                stepDuration: number,
                turnOnTts: boolean}>(message.data);
            if (
                !data ||
                typeof data !== 'object' ||
                typeof data.showFullPreviousLine !== 'boolean' ||
                typeof data.revealLastWordInLines !== 'boolean' ||
                typeof data.revealAtMostPercent !== 'number' ||
                typeof data.stepDuration !== 'number' ||
                typeof data.turnOnTts !== 'boolean'
            ) {
                // broken message data
                continue;
            }
            gameState.settings.showFullPreviousLine = data.showFullPreviousLine;
            gameState.settings.revealLastWordInLines = data.revealLastWordInLines;
            if (data.revealAtMostPercent < minRevealPercent) {
                gameState.settings.revealAtMostPercent = minRevealPercent;
            } else if (data.revealAtMostPercent > maxRevealPercent) {
                gameState.settings.revealAtMostPercent = maxRevealPercent;
            } else {
                gameState.settings.revealAtMostPercent = data.revealAtMostPercent;
            }
            if (data.stepDuration < minStepDuration) {
                gameState.settings.stepDuration = minStepDuration;
            } else if (data.stepDuration > maxStepDuration) {
                gameState.settings.stepDuration = maxStepDuration;
            } else {
                gameState.settings.stepDuration = data.stepDuration;
            }
            gameState.settings.turnOnTts = data.turnOnTts;
            dispatcher.broadcastMessage(OpCode.SETTINGS_UPDATE, encodeMessageData(gameState.settings));
        } else if (message.opCode === OpCode.START_GAME) {
            if (!gameState.host || gameState.host !== message.sender.userId) {
                // not a host player
                continue;
            }
            if (gameState.stage !== 'gettingReady') {
                // wrong stage
                continue;
            }
            const playersCount: number = Object.keys(gameState.presences).length;
            if (playersCount < minPlayers) {
                // not enough players
                continue;
            }
            logger.debug('Starting game');
            gameState.stage = 'inProgress';
            dispatcher.broadcastMessage(OpCode.STAGE_CHANGED, encodeMessageData({stage:gameState.stage} as StageChangedMessageData));
            gameState.lastStep = playersCount;
            gameState.currentStep = 0;
            gameState.nextStepAt = time + zeroStepDuration;
            genRoundSteps(gameState);
            for (const userId of Object.keys(gameState.presences)) {
                dispatcher.broadcastMessage(OpCode.NEXT_STEP, encodeMessageData({step:gameState.currentStep,last:gameState.lastStep,timeout:zeroStepDuration}), [gameState.presences[userId]]);
            }
        } else if (message.opCode === OpCode.PLAYER_INPUT) {
            if (gameState.stage !== 'inProgress') {
                // wrong stage
                continue;
            }
            const data = decodeMessageData<{step: number, input: string, ready: boolean}>(message.data);
            if (!data || typeof data !== 'object' || !data.input || typeof data.input !== 'string') {
                // broken message data
                continue;
            }
            if (gameState.currentStep !== 0 && gameState.currentStep !== data.step) {
                // wrong step
                continue;
            }
            if (!gameState.playerToResult[message.sender.userId]) {
                // input from this sender is not expected
                continue;
            }
            // TODO: process input
            const resultId = gameState.playerToResult[message.sender.userId][gameState.currentStep - 1];
            gameState.gameResults[resultId][gameState.currentStep - 1].input = data.input;
            if (data.ready && !gameState.playersReadyForNextStep[message.sender.userId]) {
                gameState.playersReadyForNextStep[message.sender.userId] = true;
                sendReadyUpdate = true;
            } else if (!data.ready && gameState.playersReadyForNextStep[message.sender.userId]) {
                delete gameState.playersReadyForNextStep[message.sender.userId];
                sendReadyUpdate = true;
            }
        } else if (message.opCode === OpCode.REVEAL_RESULT) {
            if (!gameState.host || gameState.host !== message.sender.userId) {
                // not a host player
                continue;
            }
            if (gameState.stage !== 'results') {
                // wrong stage
                continue;
            }
            dispatcher.broadcastMessage(OpCode.REVEAL_RESULT, message.data);
        } else if (message.opCode === OpCode.NEW_ROUND) {
            if (!gameState.host || gameState.host !== message.sender.userId) {
                // not a host player
                continue;
            }
            if (gameState.stage !== 'results') {
                // wrong stage
                continue;
            }
            logger.debug('Starting new round');
            gameState.kickedPlayerIds = {};
            gameState.gameResults = {};
            gameState.lastStep = NaN;
            gameState.currentStep = NaN;
            gameState.nextStepAt = NaN;
            gameState.playersReadyForNextStep = {};
            gameState.playerToResult = {};
            gameState.stage = 'gettingReady';
            dispatcher.broadcastMessage(OpCode.STAGE_CHANGED, encodeMessageData({stage:gameState.stage} as StageChangedMessageData));
        }
    }

    if (gameState.stage === 'inProgress') {
        if (
            !isNaN(gameState.currentStep) &&
            !isNaN(gameState.nextStepAt) &&
            (time >= gameState.nextStepAt ||
                Object.keys(gameState.playersReadyForNextStep).length >= Object.keys(gameState.presences).length)
        ) {
            if (gameState.currentStep === gameState.lastStep) {
                logger.debug('Game results');
                gameState.stage = 'results';
                dispatcher.broadcastMessage(OpCode.STAGE_CHANGED, encodeMessageData({stage:gameState.stage} as StageChangedMessageData));
                dispatcher.broadcastMessage(OpCode.RESULTS, encodeMessageData({results:gameState.gameResults, order:Object.keys(gameState.gameResults)}));
            } else {
                gameState.currentStep += 1;
                gameState.nextStepAt = time + gameState.settings.stepDuration;
                gameState.playersReadyForNextStep = {};
                sendReadyUpdate = true;

                for (const userId of Object.keys(gameState.presences)) {
                    const resultId = gameState.playerToResult[userId][gameState.currentStep - 1];
                    const lines = gameState.gameResults[resultId]
                        .filter(line => !!line.input)
                        .map((line, i, inputs) => {
                            if (gameState.settings.showFullPreviousLine && i === inputs.length - 1) {
                                return line.input;
                            }

                            // NOTE: Unicode classes not working. Only ru and en letters supported.
                            const hiddenLetters = line.input.replace(/[a-zа-яё]/gui, '∗');

                            if (!gameState.settings.revealLastWordInLines) {
                                return hiddenLetters;
                            }

                            const letters = line.input.match(/[a-zа-яё]/gui);

                            if (!letters) {
                                return hiddenLetters;
                            }

                            const lastWordMatch = line.input.match(/.*(^|[^a-zа-яё])([a-zа-яё]+)/ui);

                            if (!lastWordMatch) {
                                return hiddenLetters;
                            }

                            const lastWord = lastWordMatch[2];
                            const maxLettersToReveal = Math.floor(gameState.settings.revealAtMostPercent / 100 * letters.length);
                            let position = line.input.lastIndexOf(lastWord);
                            
                            if (lastWord.length > maxLettersToReveal) {
                                position += lastWord.length - maxLettersToReveal;
                            }
                            
                            return hiddenLetters.slice(0, position) + line.input.slice(position);
                        });
                    dispatcher.broadcastMessage(OpCode.NEXT_STEP, encodeMessageData({step:gameState.currentStep,last:gameState.lastStep,timeout:gameState.settings.stepDuration,lines}), [gameState.presences[userId]]);
                }
            }
        }

        if (sendReadyUpdate) {
            dispatcher.broadcastMessage(OpCode.READY_UPDATE, encodeMessageData({ready:Object.keys(gameState.playersReadyForNextStep).length, total:Object.keys(gameState.gameResults).length}));
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
        if (gameState.host && gameState.host === presence.userId) {
            gameState.host = undefined;
        }
        delete gameState.presences[presence.userId];
        gameState.playersJoinOrder = gameState.playersJoinOrder.filter(userId => userId !== presence.userId);
    }

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