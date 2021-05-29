import { Button, Container, Grid, Icon, Image, Input, InputOnChangeData, List } from "semantic-ui-react";
import * as nakamajs from "@heroiclabs/nakama-js";
import { nanoid } from "nanoid";
import React, { useEffect, useReducer, useRef, useState } from "react";
import { uniqueNamesGenerator, Config as NamesConfig, adjectives, colors, animals } from 'unique-names-generator';
import multiavatar from '@multiavatar/multiavatar';
import { useHistory, useParams } from "react-router";

const namesConfig: NamesConfig = {
    dictionaries: [adjectives, colors, animals],
    separator: '',
    style: 'capital'
};

type PlayerInfo = {
    id: string,
    name: string,
    avatar: string,
    host: boolean,
    self: boolean
};

function Game() {
    const { id: gameId } = useParams<{id: string | undefined}>();
    const history = useHistory();

    const [currentState, setCurrentState] = useState<'login'|'lobby'|'game'>('login');

    const [defaultUserName, setDefaultUserName] = useState<string>(localStorage.getItem('username') || '');
    const [userName, setUserName] = useState<string>(defaultUserName);
    const [customId, setCustomId] = useState<string>(localStorage.getItem('uuid') || '');
    const [avatar, setAvatar] = useState<string>(localStorage.getItem('avatar') || '');

    const [players, setPlayers] = useState<PlayerInfo[]>([]);

    const clientRef = useRef<nakamajs.Client>();
    const socketRef = useRef<nakamajs.Socket>();
    const sessionRef = useRef<nakamajs.Session>();

    const randomCustomId = () => {
        const newCustomId = nanoid();
        localStorage.setItem('uuid', newCustomId);
        setCustomId(newCustomId);
    };
    
    const randomUserName = () => {
        const newUserName = uniqueNamesGenerator(namesConfig);
        localStorage.setItem('username', newUserName);
        setDefaultUserName(newUserName);
    };

    const randomAvatar = () => {
        //const newAvatar = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(multiavatar(nanoid()))))}`;
        const newAvatar = `https://api.multiavatar.com/${nanoid()}.svg`;
        localStorage.setItem('avatar', newAvatar);
        setAvatar(newAvatar);
    };

    const onUserNameChange = (event: React.ChangeEvent, data: InputOnChangeData) => {
        const newUserName = data.value.trim();
        localStorage.setItem('username', newUserName || defaultUserName);
        setUserName(newUserName);
    };

    const onLogin = () => {
        setCurrentState('lobby');

        const client = new nakamajs.Client('defaultkey');
        clientRef.current = client;

        client.authenticateCustom(customId, true)
            .then(onAuth)
            .catch(error => console.error(error));
    };

    const onAuth = (session: nakamajs.Session) => {
        console.log('onAuth', session);

        sessionRef.current = session;

        const socket = clientRef.current!.createSocket(false, true);
        socketRef.current = socket;

        clientRef.current!.updateAccount(session, {
            display_name: userName || defaultUserName,
            avatar_url: avatar
        }).then(onUpdateAccount).catch(error => console.error(error));
    };

    const onUpdateAccount = (result: boolean) => {
        console.log("onUpdateAccount", result);

        const socket = socketRef.current!;
        const session = sessionRef.current!;
        socket.connect(session, false)
            .then(onConnect)
            .catch(error => console.error(error));
    };

    const onConnect = (session: nakamajs.Session) => {
        console.log('onConnect', session);

        sessionRef.current = session;
        
        socketRef.current!.ondisconnect = onDisconnect;
        socketRef.current!.onerror = onError;
        socketRef.current!.onmatchpresence = onMatchPresence;
        socketRef.current!.onmatchdata = onMatchData;

        if (gameId) {
            socketRef.current!.joinMatch(gameId)
                .then(onMatchJoined)
                .catch(error => console.error(error));
        } else {
            socketRef.current!.createMatch()
                .then(onMatchJoined)
                .catch(error => console.error(error));
        }
    };

    const onDisconnect = (event: Event) => {
        console.info("Disconnected from the server. Event:", event);
    };

    const onError = (event: Event) => {
        console.info("Error from the server. Event:", event);
    };

    const onMatchPresence = (matchPresence: nakamajs.MatchPresenceEvent) => {
        console.info("Received match presence update:", matchPresence);

        //const joins = matchPresence.joins && matchPresence.joins.filter((p: nakamajs.Presence) => p.user_id !== sessionRef.current!.user_id);
        const joins = matchPresence.joins;

        if (matchPresence.leaves && matchPresence.leaves.length && !(joins && joins.length)) {
            setPlayers(
                (prevPlayers: PlayerInfo[]) => prevPlayers.filter(
                    (player: PlayerInfo) => matchPresence.leaves.findIndex(
                        (p: nakamajs.Presence) => p.user_id === player.id
                    ) === -1
                )
            );
        } else if (joins && joins.length) {
            clientRef.current!.getUsers(sessionRef.current!, joins.map((p: nakamajs.Presence) => p.user_id))
                .then((users: nakamajs.Users) => {
                    let newPlayers: PlayerInfo[] = [];
                    if (users.users && users.users.length) {
                        newPlayers = users.users.map((user: nakamajs.User) => ({
                            id: user.id,
                            name: user.display_name,
                            avatar: user.avatar_url,
                            host: false,
                            self: user.id === sessionRef.current!.user_id
                        } as PlayerInfo));
                    }
                    setPlayers(
                        (prevPlayers: PlayerInfo[]) => {
                            let filteredPlayers = prevPlayers;
                            if (matchPresence.leaves && matchPresence.leaves.length) {
                                filteredPlayers = filteredPlayers.filter(
                                    (player: PlayerInfo) => matchPresence.leaves.findIndex(
                                        (p: nakamajs.Presence) => p.user_id === player.id
                                    ) === -1
                                );
                            }
                            return filteredPlayers.concat(newPlayers);
                        }
                    );
                })
                .catch(error => console.error(error));
        }
    }

    const onMatchData = (matchData: nakamajs.MatchData) => {
        console.info("Received match data:", matchData);
    };

    const onMatchJoined = (match: nakamajs.Match) => {
        console.log("onMatchJoined", match);
        if (!gameId) {
            history.replace(`/game/${match.match_id}`);
        }

        const presences = match.presences;
        if (presences && presences.length) {
            clientRef.current!.getUsers(sessionRef.current!, presences.map((p: nakamajs.Presence) => p.user_id))
                .then((users: nakamajs.Users) => {
                    let newPlayers: PlayerInfo[] = [];
                    if (users.users && users.users.length) {
                        newPlayers = users.users.map((user: nakamajs.User) => ({
                            id: user.id,
                            name: user.display_name,
                            avatar: user.avatar_url,
                            host: false,
                            self: user.id === sessionRef.current!.user_id
                        } as PlayerInfo));
                    }
                    setPlayers(newPlayers);
                })
                .catch(error => console.error(error));
        }
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

    if (currentState === 'login') {
        return (
            <Login
                avatar={avatar}
                defaultUserName={defaultUserName}
                userName={userName}
                refreshAvatar={randomAvatar}
                refreshUserName={randomUserName}
                onUserNameChange={onUserNameChange}
                onLogin={onLogin}
            />
        );
    } else if (currentState === 'lobby') {
        return (
            <Lobby players={players} viewAsHost={false} />
        );
    }

    return (
        null
    );
}

interface LoginProps {
    avatar: string,
    defaultUserName: string,
    userName: string,
    refreshAvatar: () => void,
    refreshUserName: () => void,
    onUserNameChange: (event: React.ChangeEvent, data: InputOnChangeData) => void,
    onLogin: () => void
}

function Login({
    avatar,
    defaultUserName,
    userName,
    refreshAvatar,
    refreshUserName,
    onUserNameChange,
    onLogin
}: LoginProps) {
    return (
        <Container textAlign='center'>
            <Grid>
                <Grid.Row>
                    <Grid.Column>
                        <Button
                            as='a'
                            circular
                            compact
                            onClick={refreshAvatar}
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
                            action={{icon:'undo', disabled: !!userName, onClick: refreshUserName}}
                            onChange={onUserNameChange}
                            maxLength={50}
                        />
                    </Grid.Column>
                </Grid.Row>
                <Grid.Row>
                    <Grid.Column>
                        <Button onClick={onLogin}>
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
    viewAsHost: boolean
}

function Lobby({players}: LobbyProps) {
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
                                        {(p.self || p.host) && (
                                            <Icon.Group>
                                                {p.host && (
                                                    <Icon name="certificate" color='yellow' />
                                                )}
                                                {p.self && (
                                                    <Icon name="check" color='grey' />
                                                )}
                                            </Icon.Group>
                                        )}
                                        <Button icon='ban' disabled={p.self} basic></Button>
                                    </List.Header>
                                </List.Content>
                            </List.Item>
                        ))}
                    </List>
                </Grid.Column>
                <Grid.Column>
                    <Button>
                        Start
                        <Icon name='arrow right' />
                    </Button>
                </Grid.Column>
            </Grid>
        </Container>
    );
}

export default Game;