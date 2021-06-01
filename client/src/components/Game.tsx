import { Button, Container, Grid, Icon, Image, Input, InputOnChangeData, List } from "semantic-ui-react";
import * as nakamajs from "@heroiclabs/nakama-js";
import { nanoid } from "nanoid";
import React, { useEffect, useReducer, useRef, useState } from "react";
import { uniqueNamesGenerator, Config as NamesConfig, adjectives, colors, animals } from 'unique-names-generator';
//import multiavatar from '@multiavatar/multiavatar';
import { useHistory, useParams } from "react-router";
import { OpCode, HostChangedMessageData, KickPlayerMessageData } from "../common";
import NakamaHelper from "../nakamaHelper";

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
const nakamaHelper: NakamaHelper = new NakamaHelper();

function Game() {
    const { id: gameId } = useParams<{id: string | undefined}>();
    const history = useHistory();

    const [currentState, setCurrentState] = useState<'login'|'lobby'|'game'>('login');
    const [players, setPlayers] = useState<PlayerInfo[]>([]);
    const [hostId, setHostId] = useState<string>('');

    const onLogin = (customId: string, userName: string, avatar: string) => {
        nakamaHelper.auth(customId, storage.getItem('nakamaToken'))
            .then((jwt: string) => {
                storage.setItem('nakamaToken', jwt);
                return nakamaHelper.updateAccount(userName, avatar);
            })
            .then(() => nakamaHelper.joinOrCreateMatch(gameId))
            .then(onMatchJoined)
            .catch((error) => {
                if (error instanceof Error) {
                    console.error(error);
                } else if (typeof error === 'object' && typeof error.code === 'number' && typeof error.message === 'string') {
                    // nakama error
                    if (error.code === 4) {
                        // Match not found
                    } else if (error.code === 5) {
                        // Match join rejected
                    }
                    console.error(error);
                } else {
                    console.error(error);
                }
            });
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
            nakamaHelper.getUsers(joins.map((p: nakamajs.Presence) => p.user_id))
                .then((users: nakamajs.User[]) => {
                    setPlayers((prevPlayers: PlayerInfo[]) => (leaves && leaves.length ? filterLeft(prevPlayers, leaves) : prevPlayers).concat(toPlayerInfo(users)));
                })
                .catch(error => console.error(error));
        }
    }

    const onMatchData = (matchData: nakamajs.MatchData) => {
        console.info("Received match data:", matchData);

        if (matchData.op_code === OpCode.HOST_CHANGED) {
            const messageData: HostChangedMessageData = matchData.data;
            setHostId(messageData.userId);
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
            nakamaHelper.getUsers(presences.map((p: nakamajs.Presence) => p.user_id))
                .then((users: nakamajs.User[]) => {
                    setPlayers(toPlayerInfo(users));
                })
                .catch(error => console.error(error));
        }
    };

    const onKick = (userId: string) => {
        nakamaHelper.sendMatchMessage(OpCode.KICK_PLAYER, {userId} as KickPlayerMessageData)
            .catch(error => console.error(error));
    };

    const onLeave = () => {
        setCurrentState('login');
        setPlayers([]);
        setHostId('');
        nakamaHelper.leaveCurrentMatch()
            .catch(error => console.error(error));
    };

    useEffect(() => {
        nakamaHelper.onDisconnect = onDisconnect;
        nakamaHelper.onError = onError;
        nakamaHelper.onMatchPresence = onMatchPresence;
        nakamaHelper.onMatchData = onMatchData;

        return () => {
            nakamaHelper.onDisconnect = undefined;
            nakamaHelper.onError = undefined;
            nakamaHelper.onMatchPresence = undefined;
            nakamaHelper.onMatchData = undefined;
        };
    }, []);

    if (currentState === 'login') {
        return (
            <Login onLogin={onLogin} />
        );
    } else if (currentState === 'lobby') {
        return (
            <Lobby
                players={players}
                hostId={hostId}
                selfId={nakamaHelper.selfId || ''}
                onKick={onKick}
                onBack={onLeave}
            />
        );
    }

    return (
        null
    );
}

interface LoginProps {
    onLogin: (customId: string, userName: string, avatar: string) => void
}

function Login({
    onLogin
}: LoginProps) {
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

    return (
        <Container textAlign='center'>
            <Grid>
                <Grid.Row>
                    <Grid.Column>
                        <Button
                            as='a'
                            circular
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
                        <Button onClick={() => onLogin(customId, userName || defaultUserName, avatar)}>
                            Login
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
    onBack: () => void
}

function Lobby({players, hostId, selfId, onKick, onBack}: LobbyProps) {
    return (
        <Container>
            <Grid columns={2} divided>
                <Grid.Column>
                    <List verticalAlign="middle">
                        {players.map((p: PlayerInfo) => (
                            <List.Item key={p.id}>
                                <Image avatar src={p.avatar} />
                                <List.Content>
                                    <List.Header>
                                        {p.name}
                                        {' '}
                                        {(p.id === selfId || p.id === hostId) && (
                                            <Icon.Group>
                                                {p.id === hostId && (
                                                    <Icon name="certificate" color='yellow' />
                                                )}
                                                {p.id === selfId && (
                                                    <Icon name="check" color='green' />
                                                )}
                                            </Icon.Group>
                                        )}
                                        {selfId && hostId && selfId === hostId && p.id !== selfId && (
                                            <Button
                                                icon='ban'
                                                color='red'
                                                basic
                                                onClick={() => onKick(p.id)}
                                            ></Button>
                                        )}
                                    </List.Header>
                                </List.Content>
                            </List.Item>
                        ))}
                    </List>
                </Grid.Column>
                <Grid.Column>
                    <Button onClick={onBack}>
                        <Icon name='arrow left' />
                        Back
                    </Button>
                    <Button disabled={!(selfId && hostId && selfId === hostId)}>
                        Start
                        <Icon name='arrow right' />
                    </Button>
                </Grid.Column>
            </Grid>
        </Container>
    );
}

export default Game;