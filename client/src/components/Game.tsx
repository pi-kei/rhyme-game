import { Button, Confirm, Container, Divider, Grid, Icon, Image, Input, InputOnChangeData, List, Popup, Progress, Ref, Segment } from "semantic-ui-react";
import * as nakamajs from "@heroiclabs/nakama-js";
import { nanoid } from "nanoid";
import React, { useEffect, useReducer, useRef, useState } from "react";
import { uniqueNamesGenerator, Config as NamesConfig, adjectives, colors, animals } from 'unique-names-generator';
//import multiavatar from '@multiavatar/multiavatar';
import { useHistory, useParams } from "react-router";
import { OpCode, HostChangedMessageData, KickPlayerMessageData, StageChangedMessageData } from "../common";
import NakamaHelper from "../nakamaHelper";
import {useAlertContext} from "./Alert";
import './Game.css';
import { useTranslation } from "react-i18next";
import LangSelector from "./LangSelector";
import { useCountdownTimer, CountdownTimerState } from "./Timer";

const namesConfig: NamesConfig = {
    dictionaries: [adjectives, colors, animals],
    separator: '',
    style: 'capital'
};

interface PlayerInfo {
    id: string,
    name: string,
    avatar: string
}

function toPlayerInfo(users: nakamajs.User[]): PlayerInfo[] {
    return users.map((user: nakamajs.User) => ({
        id: user.id,
        name: user.display_name,
        avatar: user.avatar_url
    } as PlayerInfo));
}

function filterLeft(players: PlayerInfo[], leaves: nakamajs.Presence[]) {
    return players.filter(
        (player: PlayerInfo) => leaves.findIndex(
            (p: nakamajs.Presence) => p.user_id === player.id
        ) === -1
    );
}

const storage: Storage = process.env.NODE_ENV !== 'production' && process.env.REACT_APP_USE_SESSION_STORAGE === 'true' ? sessionStorage : localStorage;
const nakamaHelper: NakamaHelper = new NakamaHelper(
    process.env.REACT_APP_NAKAMA_SERVER_KEY,
    process.env.REACT_APP_NAKAMA_HOST,
    process.env.REACT_APP_NAKAMA_PORT,
    process.env.REACT_APP_NAKAMA_USE_SSL === "true"
);

function Game() {
    const { t } = useTranslation();
    const { id: gameId } = useParams<{id: string | undefined}>();
    const history = useHistory();
    const {appendMessage} = useAlertContext();
    const nakamaHelperRef = useRef(nakamaHelper);

    const [currentState, setCurrentState] = useState<'login'|'lobby'|'game'|'results'>('login');
    const [players, setPlayers] = useState<PlayerInfo[]>([]);
    const [hostId, setHostId] = useState<string>('');

    const [stepData, setStepData] = useState<any>();
    const [results, setResults] = useState<any>();
    const [currentPoetry, setCurrentPoetry] = useState<number>(-1);
    const [currentPoetryLine, setCurrentPoetryLine] = useState<number>(-1);

    const handleError = (error: any) => {
        if (error instanceof Error) {
            appendMessage(error.name, error.message, 'error');
            console.error(error);
        } else if (typeof error === 'object' && typeof error.code === 'number' && typeof error.message === 'string') {
            // nakama error
            if (error.code === 4) {
                // Match not found
            } else if (error.code === 5) {
                // Match join rejected
            }
            appendMessage('Error', error.message, 'error');
            console.error(error);
        } else {
            appendMessage('Error', 'Something went wrong', 'error');
            console.error(error);
        }
    };

    const onLogin = (customId: string, userName: string, avatar: string) => {
        nakamaHelperRef.current.auth(customId, storage.getItem('nakamaToken'))
            .then((jwt: string) => {
                storage.setItem('nakamaToken', jwt);
                return nakamaHelperRef.current.updateAccount(userName, avatar);
            })
            .then(() => nakamaHelperRef.current.joinOrCreateMatch(gameId))
            .then(onMatchJoined)
            .catch(handleError);
    };

    const onDisconnect = (event: Event) => {
        console.info("Disconnected from the server. Event:", event);

        setCurrentState('login');
    };

    const onError = (event: Event) => {
        console.info("Error from the server. Event:", event);
    };

    const onMatchPresence = (matchPresence: nakamajs.MatchPresenceEvent) => {
        console.info("Received match presence update:", matchPresence);

        const joins = matchPresence.joins;
        const leaves = matchPresence.leaves;

        if (leaves && leaves.length && !(joins && joins.length)) {
            setPlayers((prevPlayers: PlayerInfo[]) => filterLeft(prevPlayers, leaves));
        } else if (joins && joins.length) {
            nakamaHelperRef.current.getUsers(joins.map((p: nakamajs.Presence) => p.user_id))
                .then((users: nakamajs.User[]) => {
                    setPlayers((prevPlayers: PlayerInfo[]) => (leaves && leaves.length ? filterLeft(prevPlayers, leaves) : prevPlayers).concat(toPlayerInfo(users)));
                })
                .catch(handleError);
        }
    }

    const onMatchData = (matchData: nakamajs.MatchData) => {
        console.info("Received match data:", matchData);

        if (matchData.op_code === OpCode.HOST_CHANGED) {
            const messageData: HostChangedMessageData = matchData.data;
            setHostId(messageData.userId);
        } else if (matchData.op_code === OpCode.STAGE_CHANGED) {
            const messageData: StageChangedMessageData = matchData.data;
            if (messageData.stage === 'inProgress') {
                setCurrentState('game');
            } else if (messageData.stage === 'results') {
                setCurrentState('results');
            } else if (messageData.stage === 'gettingReady') {
                setCurrentState('lobby');
            }
        } else if (matchData.op_code === OpCode.NEXT_STEP) {
            setStepData(matchData.data);
        } else if (matchData.op_code === OpCode.RESULTS) {
            setCurrentPoetry(0);
            setCurrentPoetryLine(-1);
            setResults(matchData.data);
        } else if (matchData.op_code === OpCode.REVEAL_RESULT) {
            setCurrentPoetry(matchData.data.poetry);
            setCurrentPoetryLine(matchData.data.poetryLine);
        }
    };

    const onMatchJoined = (match: nakamajs.Match) => {
        console.log("onMatchJoined", match);
        setCurrentState('lobby');
        if (!gameId) {
            history.replace(`/game/${match.match_id}`);
        }

        const presences = match.presences;
        if (presences && presences.length) {
            nakamaHelperRef.current.getUsers(presences.map((p: nakamajs.Presence) => p.user_id))
                .then((users: nakamajs.User[]) => {
                    setPlayers(prevPlayers => prevPlayers.concat(toPlayerInfo(users)));
                })
                .catch(handleError);
        }
    };

    const onKick = (userId: string) => {
        nakamaHelperRef.current.sendMatchMessage(OpCode.KICK_PLAYER, {userId} as KickPlayerMessageData)
            .catch(handleError);
    };

    const onLeave = () => {
        setCurrentState('login');
        setPlayers([]);
        setHostId('');
        nakamaHelperRef.current.leaveCurrentMatch()
            .catch(handleError);
    };

    const onInvite = () => {
        navigator?.clipboard?.writeText(window.location.href).then(() => {
            appendMessage(t('linkCopiedHeader'), t('linkCopiedContent'), 'success', 3000);
        }).catch(handleError);
    };

    const onStart = () => {
        nakamaHelperRef.current.sendMatchMessage(OpCode.START_GAME, {});
    };

    const onInput = (step: number, input: string, ready: boolean) => {
        nakamaHelperRef.current.sendMatchMessage(OpCode.PLAYER_INPUT, {step, input: input.trim(), ready});
    };

    const onRevealResult = (poetry: number, poetryLine: number) => {
        nakamaHelperRef.current.sendMatchMessage(OpCode.REVEAL_RESULT, {poetry,poetryLine});
    };

    const onNewRound = () => {
        nakamaHelperRef.current.sendMatchMessage(OpCode.NEW_ROUND, {});
    };

    useEffect(() => {
        nakamaHelperRef.current.onDisconnect = onDisconnect;
        nakamaHelperRef.current.onError = onError;
        nakamaHelperRef.current.onMatchPresence = onMatchPresence;
        nakamaHelperRef.current.onMatchData = onMatchData;

        return () => {
            nakamaHelperRef.current.onDisconnect = undefined;
            nakamaHelperRef.current.onError = undefined;
            nakamaHelperRef.current.onMatchPresence = undefined;
            nakamaHelperRef.current.onMatchData = undefined;
        };
    }, []);

    return (
        <>
            {currentState === 'login' && (
                <Login onLogin={onLogin} />
            )}
            {currentState === 'lobby' && (
                <Lobby
                    players={players}
                    hostId={hostId}
                    selfId={nakamaHelperRef.current.selfId || ''}
                    onKick={onKick}
                    onBack={onLeave}
                    onInvite={onInvite}
                    onStart={onStart}
                />
            )}
            {currentState === 'game' && (
                <GameSteps stepData={stepData} onInput={onInput} />
            )}
            {currentState === 'results' && (
                <GameResults
                    results={results}
                    players={players}
                    hostId={hostId}
                    selfId={nakamaHelperRef.current.selfId || ''}
                    currentPoetry={currentPoetry}
                    currentPoetryLine={currentPoetryLine}
                    onRevealResult={onRevealResult}
                    onNewRound={onNewRound}
                />
            )}
        </>
    );
}

interface LoginProps {
    onLogin: (customId: string, userName: string, avatar: string) => void
}

function Login({
    onLogin
}: LoginProps) {
    const { t, ready } = useTranslation();
    const [defaultUserName, setDefaultUserName] = useState<string>(storage.getItem('username') || '');
    const [userName, setUserName] = useState<string>(defaultUserName);
    const [customId, setCustomId] = useState<string>(storage.getItem('uuid') || '');
    const [avatar, setAvatar] = useState<string>(storage.getItem('avatar') || '');

    const randomCustomId = () => {
        const newCustomId = nanoid();
        storage.setItem('uuid', newCustomId);
        setCustomId(newCustomId);
    };
    
    const randomUserName = () => {
        const newUserName = uniqueNamesGenerator(namesConfig);
        storage.setItem('username', newUserName);
        setDefaultUserName(newUserName);
    };

    const randomAvatar = () => {
        //const newAvatar = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(multiavatar(nanoid()))))}`;
        const newAvatar = process.env.NODE_ENV === 'production' && process.env.REACT_APP_GET_AVATARS_FROM === 'sameOrigin' ? `${window.location.origin}/avatar/${nanoid()}` : `https://api.multiavatar.com/${nanoid()}.svg`;
        storage.setItem('avatar', newAvatar);
        setAvatar(newAvatar);
    };

    const onUserNameChange = (event: React.ChangeEvent, data: InputOnChangeData) => {
        const newUserName = data.value.trim();
        storage.setItem('username', newUserName || defaultUserName);
        setUserName(newUserName);
    };

    useEffect(() => {
        if (!defaultUserName) {
            randomUserName();
        }

        if (!customId) {
            randomCustomId();
        }

        if (!avatar) {
            randomAvatar();
        }
    }, []);

    if (!ready) {
        return null;
    }

    return (
        <Container textAlign='center'>
            <Grid padded>
                <Grid.Row>
                    <Grid.Column>
                        <Button
                            as='a'
                            compact
                            onClick={randomAvatar}
                        >
                            <Image src={avatar} size='tiny' />
                        </Button>
                    </Grid.Column>
                </Grid.Row>
                <Grid.Row>
                    <Grid.Column>
                        <Input
                            placeholder={defaultUserName}
                            value={userName}
                            fluid
                            action={{icon:'undo', disabled: !!userName, onClick: randomUserName}}
                            onChange={onUserNameChange}
                            maxLength={50}
                        />
                    </Grid.Column>
                </Grid.Row>
                <Grid.Row>
                    <Grid.Column>
                        <LangSelector/>
                        <Button onClick={() => onLogin(customId, userName || defaultUserName, avatar)} primary>
                            {t('gameLoginButton')}
                            <Icon name='arrow right' />
                        </Button>
                    </Grid.Column>
                </Grid.Row>
            </Grid>
        </Container>
    );
}

interface LobbyProps {
    players: PlayerInfo[],
    hostId: string,
    selfId: string,
    onKick: (userId: string) => void,
    onBack: () => void,
    onInvite: () => void,
    onStart: () => void
}

function Lobby({players, hostId, selfId, onKick, onBack, onInvite, onStart}: LobbyProps) {
    const { t } = useTranslation();
    const [confirmKick, setConfirmKick] = useState<PlayerInfo | null>(null);
    const onCancelKick = () => {
        setConfirmKick(null);
    };
    const onConfirmKick = () => {
        setConfirmKick(null);
        onKick(confirmKick!.id);
    };
    return (
        <Container>
            <Grid padded>
                <Grid.Column>
                    <Button onClick={onBack} basic>
                        <Icon name='arrow left' />
                        {t('gameBackButton')}
                    </Button>
                </Grid.Column>
            </Grid>
            <Grid columns={2} divided padded stackable>
                <Grid.Column width={5}>
                        <div>{t('gamePlayersCountLabel')}: {players.length} / 16</div>
                        {players.map((p: PlayerInfo) => (
                            <div key={p.id} className='ui-player-list-item'>
                                <Image avatar src={p.avatar} />
                                <span className='ui-player-list-item-name'>{p.name}</span>
                                {(p.id === selfId || p.id === hostId) && (
                                    <Icon.Group size='big'>
                                        {p.id === hostId && (
                                            <Icon name="certificate" color='yellow' />
                                        )}
                                        {p.id === selfId && (
                                            <Icon name="check" color='green' />
                                        )}
                                    </Icon.Group>
                                )}
                                {(selfId && hostId && selfId === hostId && p.id !== selfId) && (
                                    <Button
                                        icon='ban'
                                        color='red'
                                        basic
                                        onClick={() => setConfirmKick(p)}
                                        compact
                                        circular
                                    />
                                )}
                            </div>
                        ))}
                </Grid.Column>
                <Grid.Column width={11}>
                    <Button onClick={onInvite}>
                        <Icon name='chain' />
                        {t('gameInviteButton')}
                    </Button>
                    <Button disabled={!(selfId && hostId && selfId === hostId)} primary onClick={onStart}>
                        {t('gameStartButton')}
                        <Icon name='arrow right' />
                    </Button>
                </Grid.Column>
            </Grid>
            <Confirm
                open={!!confirmKick}
                onCancel={onCancelKick}
                onConfirm={onConfirmKick}
                cancelButton={t('confirmKickNoButton')}
                confirmButton={t('confirmKickYesButton')}
                header={t('confirmKickHeader')}
                content={confirmKick &&  (
                    <Segment basic>
                        <Image avatar src={confirmKick.avatar} />
                        {confirmKick.name}
                    </Segment>
                )}
            />
        </Container>
    );
}

interface GameStepsProps {
    stepData: any,
    onInput: (step: number, input: string, ready: boolean) => void
}

function GameSteps({stepData, onInput}: GameStepsProps) {
    const { t } = useTranslation();
    const [timerState, timerReset] = useCountdownTimer(0, false);
    const [sent, setSent] = useState<boolean>(false);
    const [input, setInput] = useState<string>('');

    const onButtonClick = () => {
        const newSent = !sent;
        setSent(newSent);
        onInput(stepData.step, input, newSent);
    };

    const onInputChange = (event: React.ChangeEvent, data: InputOnChangeData) => {
        const newInput = data.value.replaceAll(/[^\p{L}\p{Zs}\p{P}\p{N}]/gu, '').replaceAll(/\s+/gu, ' ');
        setInput(newInput);
        onInput(stepData.step, newInput, sent);
    };

    useEffect(() => {
        setSent(false);
        setInput('');
        if (stepData) {
            timerReset(stepData.timeout);
        }
    }, [stepData?.step]);

    if (!stepData) {
        return null;
    }

    return (
        <Container>
            <Grid padded stackable>
                <Grid.Row>
                    <Grid.Column>
                        <span>{stepData.step} / {stepData.last}</span>
                    </Grid.Column>
                </Grid.Row>
                <Grid.Row>
                    <Grid.Column>
                        <Progress total={timerState.duration} value={timerState.passed} size='tiny' />
                    </Grid.Column>
                </Grid.Row>
                {stepData && stepData.lines && (
                    <Grid.Row>
                        <Grid.Column>
                            {stepData.lines.map((line: string) => (<>{line}<br/></>))}
                        </Grid.Column>
                    </Grid.Row>
                )}
                {stepData && stepData.step > 0 && (
                    <Grid.Row columns={2}>
                        <Grid.Column width={13} >
                            <Input
                                disabled={sent}
                                fluid
                                onChange={onInputChange}
                                value={input}
                                maxLength={100}
                                placeholder={t(stepData.step === 1 ? 'gameStepsFirstLine' : 'gameStepsContinue')}
                            />
                        </Grid.Column>
                        <Grid.Column width={3}>
                            <Button
                                fluid
                                icon={sent?'edit':'send'}
                                content={t(sent?'gameStepsEditButton':'gameStepsSendButton')}
                                onClick={onButtonClick}
                            />
                        </Grid.Column>
                    </Grid.Row>
                )}
            </Grid>
        </Container>
    );
}

interface GameResultsProps {
    results: any,
    players: PlayerInfo[],
    hostId: string,
    selfId: string,
    currentPoetry: number,
    currentPoetryLine: number,
    onRevealResult: (poetry: number, poetryLine: number) => void,
    onNewRound: () => void
}

function GameResults({results, players, hostId, selfId, currentPoetry, currentPoetryLine, onRevealResult, onNewRound}: GameResultsProps) {
    const { t } = useTranslation();
    const [poeties, setPoetries] = useState<any[]>([]);
    const poetryElementRef = useRef(null);

    const onRevealNextResult = () => {
        if (currentPoetry < 0 || (currentPoetryLine >= 0 && currentPoetryLine === poeties[currentPoetry].length - 1)) {
            onRevealResult(currentPoetry + 1, -1);
        } else {
            onRevealResult(currentPoetry, currentPoetryLine + 1);
        }
    };

    useEffect(() => {
        if (!results) {
            setPoetries([]);
            return;
        }
        setPoetries(players.map(p => {
            if (!results[p.id]) {
                return undefined;
            }
            return results[p.id].map((line: {author: string, input: string}) => {
                const author = players.find(p2 => p2.id === line.author);
                return {
                    playerId: line.author,
                    avatar: author?.avatar || '',
                    name: author?.name || '???',
                    text: line.input
                };
            });
        }).filter(poetry => poetry && poetry.length));
    }, [results, players]);

    return (
        <Container>
            <Grid padded>
                <Grid.Row>
                    <Grid.Column>
                        {currentPoetry >= 0 && (<>{currentPoetry+1} / {poeties.length}</>)}
                    </Grid.Column>
                </Grid.Row>
                <Divider horizontal>∗ ∗ ∗</Divider>
                {currentPoetry >= 0 && poeties[currentPoetry] && (
                    <>
                        <Ref innerRef={poetryElementRef}>
                        <Grid.Row>
                            <Grid.Column>
                                {poeties[currentPoetry].map((line: {playerId: string, avatar: string, name: string, text: string}, index: number) => {
                                    return (
                                            <div className="poetry-line-block" key={`poetry-line-${line.playerId}`}>
                                                {(index <= currentPoetryLine + 1) ? (
                                                    <>
                                            <div>{line.avatar && (<Image avatar src={line.avatar} />)}{line.name}:</div>
                                                        <Segment className="poetry-line">{index <= currentPoetryLine ? line.text : '...'}</Segment>
                                                    </>
                                                ) : null}
                                        </div>
                                    );
                                })}
                            </Grid.Column>
                        </Grid.Row>
                        </Ref>
                        <Divider horizontal>∗ ∗ ∗</Divider>
                    </>
                )}
                <Grid.Row>
                    <Grid.Column textAlign="center">
                        {!(currentPoetry >= 0 && currentPoetry === poeties.length - 1 && currentPoetryLine >= 0 && currentPoetryLine === poeties[currentPoetry].length - 1) && (
                            <Button primary onClick={onRevealNextResult} disabled={!(selfId && hostId && selfId === hostId)}>
                                {t('gameResultsNextButton')}
                                <Icon name="arrow right"/>
                            </Button>
                        )}
                        {(currentPoetry >= 0 && currentPoetry === poeties.length - 1 && currentPoetryLine >= 0 && currentPoetryLine === poeties[currentPoetry].length - 1) && (
                            <Button primary onClick={onNewRound} disabled={!(selfId && hostId && selfId === hostId)}>
                                {t('gameResultsNewRoundButton')}
                                <Icon name="arrow right"/>
                            </Button>
                        )}
                    </Grid.Column>
                </Grid.Row>
            </Grid>
        </Container>
    );
}

export default Game;