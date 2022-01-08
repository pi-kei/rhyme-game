const moduleName = 'rhyme-game_match_handler';

let InitModule: nkruntime.InitModule = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, initializer: nkruntime.Initializer) {
    initializer.registerRpc('create_match_server_authoritative', createMatchRpc);
    
    initializer.registerMatch(moduleName, {
        matchInit,
        matchJoinAttempt,
        matchJoin,
        matchLoop,
        matchLeave,
        matchTerminate,
        matchSignal
    });

    logger.info('JavaScript logic loaded.');
};

let createMatchRpc: nkruntime.RpcFunction = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string | void {
    const params = JSON.parse(payload);
    const matchId = nk.matchCreate(moduleName, {...params, creatorId: ctx.userId});

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
        lang: 'en' | 'ru',
        maxPlayers: number,
        showFullPreviousLine: boolean,
        revealLastWordInLines: boolean,
        revealAtMostPercent: number,
        stepDuration: number,
        turnOnTts: boolean
    },
    presences: {[userId: string]: nkruntime.Presence},
    host: string | undefined,
    playersJoinOrder: string[],
    waitPlayerReconnectUntil: {[userId: string]: number},
    kickedPlayerIds: {[userId: string]: true},
    gameResults: {[userId: string]: {
        author: string, // user id
        input: string // user input
    }[]},
    gameResultsOrder: string[],
    lastStep: number,
    currentStep: number,
    nextStepAt: number,
    playersReadyForNextStep: {[userId: string]: true},
    playerToResult: {[userId: string]: string[]},
    lastLinesByPlayer: {[userId: string]: string[]},
    lastRevealResultData: any,
    terminating: boolean
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

    gameState.gameResultsOrder = Object.keys(gameState.gameResults);
}

let matchInit: nkruntime.MatchInitFunction = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, params: {[key: string]: string}): {state: nkruntime.MatchState, tickRate: number, label: string} {
    logger.debug('matchInit called');

    const tickRate = 2;
    const label = '';

    if (params.restoreFrom) {
        const list = nk.storageRead([{
            collection: 'saved_matches',
            key: params.restoreFrom,
            userId: '00000000-0000-0000-0000-000000000000'
        }]);
        if (list.length !== 1) {
            throw new Error('Match cannot be restored');
        }
        nk.storageDelete([{
            collection: 'saved_matches',
            key: params.restoreFrom,
            userId: '00000000-0000-0000-0000-000000000000'
        }]);
        const savedMatch = list[0].value.state;
        const time = Date.now();
        const timeDiff = time - list[0].value.serverTime;
        const waitPlayerReconnectUntil: {[userId: string]: number} = {};
        for (const userId of Object.keys(savedMatch.waitPlayerReconnectUntil)) {
            waitPlayerReconnectUntil[userId] = savedMatch.waitPlayerReconnectUntil[userId] + timeDiff;
        }
        for (const userId of Object.keys(savedMatch.presences)) {
            waitPlayerReconnectUntil[userId] = time + 5000;
        }
        const restoredState: GameState = {
            stage: savedMatch.stage,
            settings: savedMatch.settings,
            presences: {},
            host: undefined,
            playersJoinOrder: savedMatch.playersJoinOrder,
            waitPlayerReconnectUntil,
            kickedPlayerIds: savedMatch.kickedPlayerIds,
            gameResults: savedMatch.gameResults,
            gameResultsOrder: savedMatch.gameResultsOrder,
            lastStep: savedMatch.lastStep,
            currentStep: savedMatch.currentStep,
            nextStepAt: savedMatch.nextStepAt >= 0 ? savedMatch.nextStepAt + timeDiff : savedMatch.nextStepAt,
            playersReadyForNextStep: savedMatch.playersReadyForNextStep,
            playerToResult: savedMatch.playerToResult,
            lastLinesByPlayer: savedMatch.lastLinesByPlayer,
            lastRevealResultData: savedMatch.lastRevealResultData,
            terminating: false
        };
        for (const userId of Object.keys(savedMatch.presences)) {
            if (userId !== params.creatorId) {
                nk.notificationSend(userId, 'match_restored', {matchId: ctx.matchId, oldMatchId: params.restoreFrom}, 1, undefined, true);
            }
        }
        return {
            state: restoredState,
            tickRate,
            label
        };
    }

    const initialState: GameState = {
        stage: 'gettingReady',
        settings: {
            lang: params.lang === 'ru' ? 'ru' : 'en',
            maxPlayers,
            showFullPreviousLine: true,
            revealLastWordInLines: true,
            revealAtMostPercent: 33,
            stepDuration: 180000,
            turnOnTts: true
        },
        presences: {},
        host: undefined,
        playersJoinOrder: [],
        waitPlayerReconnectUntil: {},
        kickedPlayerIds: {},
        gameResults: {},
        gameResultsOrder: [],
        lastStep: -1,
        currentStep: -1,
        nextStepAt: -1,
        playersReadyForNextStep: {},
        playerToResult: {},
        lastLinesByPlayer: {},
        lastRevealResultData: undefined,
        terminating: false
    };

    return {
        state: initialState,
        tickRate,
        label
    };
};

let matchJoinAttempt: nkruntime.MatchJoinAttemptFunction = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, presence: nkruntime.Presence, metadata: {[key: string]: any}): {state: nkruntime.MatchState, accept: boolean, rejectMessage?: string} | null {
    logger.debug('matchJoinAttempt called');

    const gameState: GameState = state as GameState;
    const playersCount: number = Object.keys(gameState.presences).length;

    if (gameState.terminating) {
        return {
            state: gameState,
            accept: false,
            rejectMessage: 'match terminating'
        };
    }

    if (playersCount >= gameState.settings.maxPlayers) {
        return {
            state: gameState,
            accept: false,
            rejectMessage: 'match full'
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

    if (gameState.terminating) {
        return null;
    }

    for (const presence of presences) {
        gameState.presences[presence.userId] = presence;
        const playerIndex = gameState.playersJoinOrder.indexOf(presence.userId);
        if (playerIndex < 0) {
            // NOTE: mutable ways to append an element DID'T work (bug in goja?)
            gameState.playersJoinOrder = gameState.playersJoinOrder.concat(presence.userId);
        }
    }

    if (gameState.host) {
        dispatcher.broadcastMessage(OpCode.HOST_CHANGED, encodeMessageData({ userId: gameState.host } as HostChangedMessageData), presences);
    }

    dispatcher.broadcastMessage(OpCode.SETTINGS_UPDATE, encodeMessageData(gameState.settings), presences);

    dispatcher.broadcastMessage(OpCode.STAGE_CHANGED, encodeMessageData({stage:gameState.stage} as StageChangedMessageData), presences);

    if (gameState.stage === 'inProgress') {
        const timeLeft = gameState.nextStepAt - Date.now();
        if (timeLeft > 1000) {
            for (const presence of presences) {
                if (gameState.playerToResult[presence.userId]) {
                    // active player
                    const input = gameState.currentStep > 0 ? gameState.gameResults[gameState.playerToResult[presence.userId][gameState.currentStep - 1]][gameState.currentStep - 1].input : undefined;
                    dispatcher.broadcastMessage(OpCode.NEXT_STEP, encodeMessageData({step:gameState.currentStep,last:gameState.lastStep,timeout:timeLeft,lines:gameState.lastLinesByPlayer[presence.userId],input,active:true}), [presence]);
                } else {
                    // spectator
                    dispatcher.broadcastMessage(OpCode.NEXT_STEP, encodeMessageData({step:gameState.currentStep,last:gameState.lastStep,timeout:timeLeft,active:false}), [presence]);
                }
            }
            dispatcher.broadcastMessage(OpCode.READY_UPDATE, encodeMessageData({ready:Object.keys(gameState.playersReadyForNextStep).length, total:Object.keys(gameState.gameResults).length}), presences);
        }
    } else if (gameState.stage === 'results') {
        dispatcher.broadcastMessage(OpCode.RESULTS, encodeMessageData({results:gameState.gameResults, order:gameState.gameResultsOrder}), presences);
        if (gameState.lastRevealResultData) {
            dispatcher.broadcastMessage(OpCode.REVEAL_RESULT, encodeMessageData(gameState.lastRevealResultData), presences);
        }
    }
    
    return {
        state: gameState
    };
};

let matchLoop: nkruntime.MatchLoopFunction = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, messages: nkruntime.MatchMessage[]): {state: nkruntime.MatchState} | null {
    const gameState: GameState = state as GameState;
    const time: number = Date.now();

    if (gameState.terminating) {
        return null;
    }

    if (!gameState.host) {
        for (const userId of gameState.playersJoinOrder) {
            if (gameState.presences[userId]) {
                gameState.host = userId;
                break;
            }
        }
        if (gameState.host) {
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
            const data = decodeMessageData<KickPlayerMessageData>(nk.binaryToString(message.data));
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
                maxPlayers: number,
                showFullPreviousLine: boolean,
                revealLastWordInLines: boolean,
                revealAtMostPercent: number,
                stepDuration: number,
                turnOnTts: boolean}>(nk.binaryToString(message.data));
            if (
                !data ||
                typeof data !== 'object' ||
                typeof data.maxPlayers !== 'number' ||
                typeof data.showFullPreviousLine !== 'boolean' ||
                typeof data.revealLastWordInLines !== 'boolean' ||
                typeof data.revealAtMostPercent !== 'number' ||
                typeof data.stepDuration !== 'number' ||
                typeof data.turnOnTts !== 'boolean'
            ) {
                // broken message data
                continue;
            }
            if (data.maxPlayers < minPlayers) {
                gameState.settings.maxPlayers = minPlayers;
            } else if (data.maxPlayers > maxPlayers) {
                gameState.settings.maxPlayers = maxPlayers;
            } else {
                gameState.settings.maxPlayers = data.maxPlayers;
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
                dispatcher.broadcastMessage(OpCode.NEXT_STEP, encodeMessageData({step:gameState.currentStep,last:gameState.lastStep,timeout:zeroStepDuration,active:Boolean(gameState.playerToResult[userId])}), [gameState.presences[userId]]);
            }
        } else if (message.opCode === OpCode.PLAYER_INPUT) {
            if (gameState.stage !== 'inProgress') {
                // wrong stage
                continue;
            }
            const data = decodeMessageData<{step: number, input: string, ready: boolean}>(nk.binaryToString(message.data));
            if (!data || typeof data !== 'object' || !data.input || typeof data.input !== 'string') {
                // broken message data
                continue;
            }
            if (gameState.currentStep === 0 || gameState.currentStep !== data.step) {
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
            gameState.lastRevealResultData = decodeMessageData(nk.binaryToString(message.data));
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
            gameState.gameResultsOrder = [];
            gameState.lastStep = -1;
            gameState.currentStep = -1;
            gameState.nextStepAt = -1;
            gameState.playersReadyForNextStep = {};
            gameState.playerToResult = {};
            gameState.lastLinesByPlayer = {};
            gameState.lastRevealResultData = undefined;
            gameState.waitPlayerReconnectUntil = {};
            gameState.stage = 'gettingReady';
            dispatcher.broadcastMessage(OpCode.STAGE_CHANGED, encodeMessageData({stage:gameState.stage} as StageChangedMessageData));
        }
    }

    if (gameState.stage === 'inProgress') {
        if (
            gameState.currentStep >= 0 &&
            gameState.nextStepAt >= 0 &&
            (time >= gameState.nextStepAt ||
                // don't wait for players that left the match
                Object.keys(gameState.playerToResult).every(userId => gameState.playersReadyForNextStep[userId] || (!gameState.presences[userId] && gameState.waitPlayerReconnectUntil[userId] < time)))
        ) {
            if (gameState.currentStep === gameState.lastStep) {
                logger.debug('Game results');
                gameState.stage = 'results';
                dispatcher.broadcastMessage(OpCode.STAGE_CHANGED, encodeMessageData({stage:gameState.stage} as StageChangedMessageData));
                dispatcher.broadcastMessage(OpCode.RESULTS, encodeMessageData({results:gameState.gameResults, order:gameState.gameResultsOrder}));
            } else {
                gameState.currentStep += 1;
                gameState.nextStepAt = time + gameState.settings.stepDuration;
                gameState.playersReadyForNextStep = {};
                sendReadyUpdate = true;

                for (const userId of Object.keys(gameState.presences)) {
                    if (!gameState.playerToResult[userId]) {
                        dispatcher.broadcastMessage(OpCode.NEXT_STEP, encodeMessageData({step:gameState.currentStep,last:gameState.lastStep,timeout:gameState.settings.stepDuration,active:false}), [gameState.presences[userId]]);
                        continue;
                    }
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
                    gameState.lastLinesByPlayer[userId] = lines;
                    dispatcher.broadcastMessage(OpCode.NEXT_STEP, encodeMessageData({step:gameState.currentStep,last:gameState.lastStep,timeout:gameState.settings.stepDuration,lines,active:true}), [gameState.presences[userId]]);
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
    const time: number = Date.now();

    if (gameState.terminating) {
        return null;
    }

    for (const presence of presences) {
        if (gameState.host && gameState.host === presence.userId) {
            gameState.host = undefined;
        }
        delete gameState.presences[presence.userId];
        gameState.waitPlayerReconnectUntil[presence.userId] = time + 5000;
    }

    return {
        state: gameState
    };
};

let matchTerminate: nkruntime.MatchTerminateFunction = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, graceSeconds: number): {state: nkruntime.MatchState} | null {
    logger.debug('matchTerminate called');

    const gameState: GameState = state as GameState;
    const players = Object.keys(gameState.presences);

    if (players.length === 0 || gameState.stage === 'gettingReady') {
        // restore is not needed
        return null;
    }
    
    try {
        nk.storageWrite([{
            collection: 'saved_matches',
            key: ctx.matchId,
            userId: '00000000-0000-0000-0000-000000000000', // system owned object
            permissionRead: 0, // clients can't read
            permissionWrite: 0, // clients can't write
            value: { state, serverTime: Date.now() }
        }]);
    } catch (error) {
        logger.error(`Error while storing state on matchTerminate: ${(error && typeof error === 'object' && (error as {message?: string}).message)}`);
        return null;
    }

    gameState.terminating = true;

    dispatcher.broadcastMessage(OpCode.TERMINATING, encodeMessageData({creatorId: gameState.host || players[0], graceSeconds}));
    
    return {
        state: gameState
    };
};

let matchSignal: nkruntime.MatchSignalFunction = function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, data: string): {state: nkruntime.MatchState, data?: string} | null {
    return null;
};