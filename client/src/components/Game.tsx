import {
  Button,
  Checkbox,
  CheckboxProps,
  Confirm,
  Container,
  Divider,
  Dropdown,
  DropdownProps,
  Form,
  Grid,
  Header,
  Icon,
  Image,
  Input,
  InputOnChangeData,
  InputProps,
  List,
  Popup,
  Progress,
  Ref,
  Segment,
  Transition,
} from "semantic-ui-react";
import * as nakamajs from "@heroiclabs/nakama-js";
import { nanoid } from "nanoid";
import React, { SyntheticEvent, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { uniqueNamesGenerator, Config as NamesConfig, adjectives, colors, animals } from "unique-names-generator";
//import multiavatar from '@multiavatar/multiavatar';
import { useHistory, useParams } from "react-router";
import { OpCode, HostChangedMessageData, KickPlayerMessageData, StageChangedMessageData } from "../common";
import NakamaHelper from "../nakamaHelper";
import { useAlertContext } from "./Alert";
import "./Game.css";
import { useTranslation } from "react-i18next";
import LangSelector from "./LangSelector";
import { useCountdownTimer, CountdownTimerState } from "./Timer";
import saveImage from "../saveImage";
import SoundsHelper from "../soundsHelper";
import SpeechHelper from "../speechHelper";
import storage from "../storage";
import { Link } from "react-router-dom";

const namesConfig: NamesConfig = {
  dictionaries: [adjectives, colors, animals],
  separator: "",
  style: "capital",
};

interface PlayerInfo {
  id: string;
  name: string;
  avatar: string;
  left: boolean;
}

function filterLeft(players: PlayerInfo[], leaves: nakamajs.Presence[]) {
  return players.map((player: PlayerInfo) => {
    player.left = leaves.findIndex((p: nakamajs.Presence) => p.user_id === player.id) !== -1;
    return player;
  });
}

const nakamaHelper: NakamaHelper = new NakamaHelper(
  process.env.REACT_APP_NAKAMA_SERVER_KEY,
  process.env.REACT_APP_NAKAMA_HOST ?? "127.0.0.1",
  process.env.REACT_APP_NAKAMA_PORT ?? "7350",
  process.env.REACT_APP_NAKAMA_USE_SSL === "true"
);
const speechHelper = new SpeechHelper();
const soundsHelper = new SoundsHelper();

soundsHelper.addSound("join", {
  src: [`${process.env.PUBLIC_URL}/sounds/join.mp3`],
});
soundsHelper.addSound("left", {
  src: [`${process.env.PUBLIC_URL}/sounds/left.mp3`],
});
soundsHelper.addSound("error", {
  src: [`${process.env.PUBLIC_URL}/sounds/error.mp3`],
});
soundsHelper.addSound("step", {
  src: [`${process.env.PUBLIC_URL}/sounds/step.mp3`],
});
soundsHelper.addSound("stage", {
  src: [`${process.env.PUBLIC_URL}/sounds/stage.mp3`],
});
soundsHelper.addSound("result", {
  src: [`${process.env.PUBLIC_URL}/sounds/result.mp3`],
});

function useSoundsHelper(soundsHelper: SoundsHelper) {
  const soundsHelperRef = useRef(soundsHelper);
  const [isMuted, setIsMuted] = useState<boolean>(soundsHelperRef.current.muted);

  const toggleMuted = () => {
    setIsMuted((prevIsMuted) => {
      const newIsMuted = !prevIsMuted;
      soundsHelperRef.current.muted = newIsMuted;
      return newIsMuted;
    });
  };

  const playSound = (key: string) => {
    soundsHelperRef.current.getSound(key).play();
  };

  return {
    isMuted,
    toggleMuted,
    playSound,
  };
}

function Game() {
  const { t, i18n } = useTranslation();
  const { id: gameId } = useParams<{ id: string | undefined }>();
  const history = useHistory();
  const { appendMessage } = useAlertContext();
  const nakamaHelperRef = useRef(nakamaHelper);
  const { playSound } = useSoundsHelper(soundsHelper);

  const [currentState, setCurrentState] = useState<"login" | "lobby" | "game" | "results" | "serverRestarting">("login");
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [hostId, setHostId] = useState<string>("");
  const [settings, setSettings] = useState<any>();

  const [stepData, setStepData] = useState<any>(); // game
  const [readyState, setReadyState] = useState<{ ready: number; total: number }>(); // game
  const [resultsData, setResultsData] = useState<any>(); // results
  const [resultsRevealData, setResultsRevealData] = useState<{ currentPoetry: number; currentPoetryLine: number }>({ currentPoetry: -1, currentPoetryLine: -1 }); // results

  const handleError = (error: any) => {
    playSound("error");

    if (error instanceof Error) {
      appendMessage(error.name, error.message, "error");
      console.error(error);
    } else if (typeof error === "object" && typeof error.code === "number" && typeof error.message === "string") {
      // nakama error
      if (error.code === 4) {
        // Match not found
      } else if (error.code === 5) {
        // Match join rejected
      }
      appendMessage("Error", error.message, "error");
      console.error(error);
    } else {
      appendMessage("Error", "Something went wrong", "error");
      console.error(error);
    }
  };

  const onLogin = (customId: string, userName: string, avatar: string) => {
    nakamaHelperRef.current
      .auth(customId, storage.getItem("nakamaToken"), storage.getItem("nakamaRefreshToken"))
      .then(() => nakamaHelperRef.current.updateAccount(userName, avatar))
      .then(() => nakamaHelperRef.current.joinOrCreateMatch(storage.getItem("matchId"), { lang: i18n.language }))
      .then(onMatchJoined)
      .catch(handleError);
  };

  const onTokensUpdate = (token?: string, refreshToken?: string) => {
    console.info("Tokens update");

    if (token) {
      storage.setItem("nakamaToken", token);
    }
    if (refreshToken) {
      storage.setItem("nakamaRefreshToken", refreshToken);
    }
  };

  const onDisconnect = () => {
    console.info("Disconnected from the server");

    playSound("error");

    setCurrentState("login");
    setPlayers((prevPlayers) => []);
    setHostId("");
  };

  const onReconnect = (matchId: string | undefined) => {
    console.info("Reconnected to the server");

    if (!matchId) {
      return;
    }
    nakamaHelperRef.current.joinOrCreateMatch(matchId, { lang: i18n.language }).then(onMatchRejoined).catch(handleError);
  };

  const onError = (event: Event) => {
    console.info("Error from the server. Event:", event);
  };

  const handlePresenceUpdate = (joins?: nakamajs.Presence[], leaves?: nakamajs.Presence[]) => {
    if (leaves && leaves.length && !(joins && joins.length)) {
      setPlayers((prevPlayers: PlayerInfo[]) => filterLeft(prevPlayers, leaves));
    } else if (joins && joins.length) {
      nakamaHelperRef.current
        .getUsers(joins.map((p: nakamajs.Presence) => p.user_id))
        .then((users: nakamajs.User[]) => {
          setPlayers((prevPlayers: PlayerInfo[]) => {
            const newPlayers: PlayerInfo[] = leaves && leaves.length ? filterLeft(prevPlayers, leaves) : prevPlayers.concat();
            for (const user of users) {
              const index = newPlayers.findIndex((p) => p.id === user.id);
              if (index >= 0) {
                const p = newPlayers.splice(index, 1)[0];
                p.name = user.display_name!;
                p.avatar = user.avatar_url!;
                p.left = false;
                newPlayers.push(p);
              } else {
                newPlayers.push({
                  id: user.id!,
                  name: user.display_name!,
                  avatar: user.avatar_url!,
                  left: false,
                });
              }
            }
            return newPlayers;
          });
        })
        .catch(handleError);
    }
  };

  const onMatchPresence = (matchPresence: nakamajs.MatchPresenceEvent) => {
    console.info("Received match presence update:", matchPresence);

    const joins = matchPresence.joins;
    const leaves = matchPresence.leaves;

    if (joins && joins.length) {
      playSound("join");
    }

    if (leaves && leaves.length) {
      playSound("left");
    }

    handlePresenceUpdate(joins, leaves);
  };

  const onMatchData = (matchData: nakamajs.MatchData) => {
    console.info("Received match data:", matchData);

    if (matchData.op_code === OpCode.HOST_CHANGED) {
      const messageData: HostChangedMessageData = matchData.data;
      setHostId(messageData.userId);
    } else if (matchData.op_code === OpCode.SETTINGS_UPDATE) {
      setSettings(matchData.data);
    } else if (matchData.op_code === OpCode.STAGE_CHANGED) {
      const messageData: StageChangedMessageData = matchData.data;
      if (currentState !== messageData.stage) {
        if (messageData.stage === "inProgress") {
          setCurrentState("game");
        } else if (messageData.stage === "results") {
          setResultsRevealData({ currentPoetry: -1, currentPoetryLine: -1 });
          setCurrentState("results");
          setStepData(undefined);
        } else if (messageData.stage === "gettingReady") {
          setCurrentState("lobby");
          setResultsData(undefined);
        }
        playSound("stage");
      }
    } else if (matchData.op_code === OpCode.NEXT_STEP) {
      setStepData(matchData.data);
    } else if (matchData.op_code === OpCode.RESULTS) {
      setResultsRevealData({ currentPoetry: 0, currentPoetryLine: -1 });
      setResultsData(matchData.data);
    } else if (matchData.op_code === OpCode.REVEAL_RESULT) {
      setResultsRevealData({ currentPoetry: matchData.data.poetry, currentPoetryLine: matchData.data.poetryLine });
      playSound("result");
    } else if (matchData.op_code === OpCode.READY_UPDATE) {
      setReadyState(matchData.data);
    } else if (matchData.op_code === OpCode.TERMINATING) {
      const messageData: { creatorId: string; graceSeconds: number } = matchData.data;
      onTerminating(messageData.creatorId, messageData.graceSeconds);
    }
  };

  const onNotification = (notification: nakamajs.Notification) => {
    if (notification.subject === "match_restored" && notification.code === 1) {
      if (currentState === "serverRestarting") {
        nakamaHelperRef.current.joinOrCreateMatch((notification.content as { matchId: string }).matchId).then(onMatchRejoined);
      }
    }
  };

  const onTerminating = (creatorId: string, graceSeconds: number) => {
    setCurrentState("serverRestarting");
    setStepData(undefined);
    setResultsData(undefined);
    appendMessage("Server restarting", `Game will be restored. Please wait about ${graceSeconds} seconds...`, "warning", graceSeconds * 1000);
    const isCreator = creatorId === nakamaHelperRef.current.selfId;
    const oldMatchId = nakamaHelperRef.current.currentMatchId;
    nakamaHelperRef.current.terminate();
    nakamaHelperRef.current
      .waitRestart(graceSeconds)
      .then(() => nakamaHelperRef.current.auth(nakamaHelperRef.current.clientCustomId || ""))
      .then(() => {
        if (isCreator && oldMatchId) {
          return nakamaHelperRef.current.joinOrCreateMatch(undefined, { restoreFrom: oldMatchId }).then(onMatchRejoined);
        } else {
          return Promise.resolve();
        }
      })
      .catch((error) => {
        onDisconnect();
        appendMessage("Error", "Failed to restore game", "error");
        console.error(error);
      });
  };

  const onMatchJoined = (match: nakamajs.Match) => {
    console.log("onMatchJoined", match);
    storage.setItem("matchId", match.match_id);

    const presences = match.presences;
    handlePresenceUpdate(presences);
  };

  const onMatchRejoined = (match: nakamajs.Match) => {
    console.log("onMatchRejoined", match);
    storage.setItem("matchId", match.match_id);

    const presences = match.presences;
    const joins = presences;
    const leaves = players.map(
      (player) =>
        ({
          user_id: player.id,
          session_id: "", // don't care about this value
          username: "", // don't care about this value
          node: "", // don't care about this value
        } as nakamajs.Presence)
    );

    console.log("onMatchRejoined", joins, leaves);

    handlePresenceUpdate(joins, leaves);
  };

  const onKick = (userId: string) => {
    nakamaHelperRef.current.sendMatchMessage(OpCode.KICK_PLAYER, { userId } as KickPlayerMessageData).catch(handleError);
  };

  const onSettingsUpdate = (settings: any) => {
    nakamaHelperRef.current.sendMatchMessage(OpCode.SETTINGS_UPDATE, settings);
  };

  const onLeave = () => {
    setCurrentState("login");
    setPlayers([]);
    setHostId("");
    nakamaHelperRef.current.leaveCurrentMatch().catch(handleError);

    playSound("left");
  };

  const legacyCopyToClipboard = (text: string) => {
    try {
      const e = document.createElement("input");
      document.body.appendChild(e);
      e.value = text;
      e.select();
      document.execCommand("copy");
      document.body.removeChild(e);
      appendMessage(t("linkCopiedHeader"), t("linkCopiedContent"), "success", 3000);
    } catch (error) {
      handleError(error);
    }
  };

  const onInvite = () => {
    const link = `${window.location.origin}/game/${nakamaHelperRef.current.currentMatchId}`;

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      legacyCopyToClipboard(link);
      return;
    }
    navigator.clipboard
      .writeText(link)
      .then(() => {
        appendMessage(t("linkCopiedHeader"), t("linkCopiedContent"), "success", 3000);
      })
      .catch((error) => {
        console.error(error);
        legacyCopyToClipboard(link);
      });
  };

  const onStart = () => {
    if (players.reduce((prevCount, player) => prevCount + (player.left ? 0 : 1), 0) < 2) {
      appendMessage(t("startWarningHeader"), t("startWarningContent"), "warning");
      return;
    }
    nakamaHelperRef.current.sendMatchMessage(OpCode.START_GAME, {});
  };

  const onInput = (step: number, rawInput: string, ready: boolean) => {
    const input = rawInput.trim().replaceAll(/\s{2,}/gu, " ");
    if (input) {
      nakamaHelperRef.current.sendMatchMessage(OpCode.PLAYER_INPUT, { step, input, ready });
    }
  };

  const onRevealResult = (poetry: number, poetryLine: number) => {
    nakamaHelperRef.current.sendMatchMessage(OpCode.REVEAL_RESULT, { poetry, poetryLine });
  };

  const onNewRound = () => {
    nakamaHelperRef.current.sendMatchMessage(OpCode.NEW_ROUND, {});
  };

  useEffect(() => {
    nakamaHelperRef.current.onDisconnect = onDisconnect;
    nakamaHelperRef.current.onReconnect = onReconnect;
    nakamaHelperRef.current.onError = onError;
    nakamaHelperRef.current.onMatchPresence = onMatchPresence;
    nakamaHelperRef.current.onMatchData = onMatchData;
    nakamaHelperRef.current.onNotification = onNotification;
    nakamaHelperRef.current.onTokensUpdate = onTokensUpdate;

    return () => {
      nakamaHelperRef.current.onDisconnect = undefined;
      nakamaHelperRef.current.onReconnect = undefined;
      nakamaHelperRef.current.onError = undefined;
      nakamaHelperRef.current.onMatchPresence = undefined;
      nakamaHelperRef.current.onMatchData = undefined;
      nakamaHelperRef.current.onNotification = undefined;
      nakamaHelperRef.current.onTokensUpdate = undefined;
    };
  });

  useEffect(() => {
    if (gameId) {
      storage.setItem("matchId", gameId);
      history.replace("/game");
    }
  }, []);

  return (
    <>
      {currentState === "login" && <Login onLogin={onLogin} />}
      {currentState === "lobby" && (
        <Lobby
          players={players}
          hostId={hostId}
          selfId={nakamaHelperRef.current.selfId || ""}
          settings={settings}
          onKick={onKick}
          onSettingsUpdate={onSettingsUpdate}
          onBack={onLeave}
          onInvite={onInvite}
          onStart={onStart}
        />
      )}
      {currentState === "game" && <GameSteps settings={settings} stepData={stepData} readyState={readyState} onInput={onInput} />}
      {currentState === "results" && (
        <GameResults
          resultsData={resultsData}
          players={players}
          hostId={hostId}
          selfId={nakamaHelperRef.current.selfId || ""}
          muteTts={settings && !settings.turnOnTts}
          resultsRevealData={resultsRevealData}
          onRevealResult={onRevealResult}
          onNewRound={onNewRound}
        />
      )}
    </>
  );
}

interface LoginProps {
  onLogin: (customId: string, userName: string, avatar: string) => void;
}

function Login({ onLogin }: LoginProps) {
  const { t, ready } = useTranslation();
  const [defaultUserName, setDefaultUserName] = useState<string>(storage.getItem("username") || "");
  const [userName, setUserName] = useState<string>(defaultUserName);
  const [customId, setCustomId] = useState<string>(storage.getItem("uuid") || "");
  const [avatar, setAvatar] = useState<string>(storage.getItem("avatar") || "");
  const { isMuted, toggleMuted } = useSoundsHelper(soundsHelper);
  const [avatarHistory, setAvatarHistory] = useState<string[]>(avatar ? [avatar] : []);
  const [avatarHistoryIndex, setAvatarHistoryIndex] = useState<number>(avatarHistory.length ? 0 : -1);

  const randomCustomId = () => {
    const newCustomId = nanoid();
    storage.setItem("uuid", newCustomId);
    setCustomId(newCustomId);
  };

  const randomUserName = () => {
    const newUserName = uniqueNamesGenerator(namesConfig);
    storage.setItem("username", newUserName);
    setDefaultUserName(newUserName);
  };

  const nextAvatar = () => {
    setAvatarHistoryIndex((prevAvatarHistoryIndex) => prevAvatarHistoryIndex + 1);
  };

  const prevAvatar = () => {
    setAvatarHistoryIndex((prevAvatarHistoryIndex) => Math.max(0, prevAvatarHistoryIndex - 1));
  };

  const onUserNameChange = (event: React.ChangeEvent, data: InputOnChangeData) => {
    const newUserName = data.value.trim();
    storage.setItem("username", newUserName || defaultUserName);
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
      nextAvatar();
    }
  }, []);

  useEffect(() => {
    if (avatarHistory[avatarHistoryIndex]) {
      const newAvatar = avatarHistory[avatarHistoryIndex];
      storage.setItem("avatar", newAvatar);
      setAvatar(newAvatar);
    } else {
      //const newAvatar = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(multiavatar(nanoid()))))}`;
      const newAvatar =
        process.env.NODE_ENV === "production" && process.env.REACT_APP_GET_AVATARS_FROM === "sameOrigin"
          ? `${process.env.PUBLIC_URL}/avatar/${nanoid()}`
          : `https://api.multiavatar.com/${nanoid()}.svg`;
      const index = avatarHistoryIndex;
      setAvatarHistory((prevAvatarHistory) => {
        const newAvatarHistory = prevAvatarHistory.concat();
        newAvatarHistory[index] = newAvatar;
        return newAvatarHistory;
      });
    }
  }, [avatarHistoryIndex, avatarHistory]);

  if (!ready) {
    return null;
  }

  return (
    <Container>
      <Grid padded>
        <Grid.Row columns={2}>
          <Grid.Column width={13}>
            <Button as={Link} to="/" basic>
              <Icon name="home" />
              {t("gameHomeButton")}
            </Button>
            <LangSelector />
          </Grid.Column>
          <Grid.Column width={3} textAlign="right">
            <Button icon={isMuted ? "volume off" : "volume up"} active={false} basic onClick={toggleMuted} />
          </Grid.Column>
        </Grid.Row>
        <Grid.Row textAlign="center">
          <Grid.Column>
            <Button icon="angle left" as="a" compact onClick={prevAvatar} disabled={avatarHistoryIndex <= 0} />
            <Button as="a" compact onClick={nextAvatar}>
              <Image src={avatar} size="tiny" />
            </Button>
            <Button icon="angle right" as="a" compact onClick={nextAvatar} />
          </Grid.Column>
        </Grid.Row>
        <Grid.Row textAlign="center">
          <Grid.Column>
            <Input placeholder={defaultUserName} value={userName} fluid action={{ icon: "undo", disabled: !!userName, onClick: randomUserName }} onChange={onUserNameChange} maxLength={50} />
          </Grid.Column>
        </Grid.Row>
        <Grid.Row textAlign="center">
          <Grid.Column>
            <Button onClick={() => onLogin(customId, userName || defaultUserName, avatar)} primary>
              {t("gameLoginButton")}
              <Icon name="arrow right" />
            </Button>
          </Grid.Column>
        </Grid.Row>
      </Grid>
    </Container>
  );
}

interface LobbyProps {
  players: PlayerInfo[];
  hostId: string;
  selfId: string;
  settings: any;
  onKick: (userId: string) => void;
  onSettingsUpdate: (settings: any) => void;
  onBack: () => void;
  onInvite: () => void;
  onStart: () => void;
}

function Lobby({ players, hostId, selfId, settings, onKick, onSettingsUpdate, onBack, onInvite, onStart }: LobbyProps) {
  const { t } = useTranslation();
  const [confirmKick, setConfirmKick] = useState<PlayerInfo | null>(null);
  const { isMuted, toggleMuted } = useSoundsHelper(soundsHelper);
  const onCancelKick = () => {
    setConfirmKick(null);
  };
  const onConfirmKick = () => {
    setConfirmKick(null);
    onKick(confirmKick!.id);
  };
  const onMaxPlayersChange = (event: SyntheticEvent, data: DropdownProps) => {
    onSettingsUpdate({
      ...settings,
      maxPlayers: data.value,
    });
  };
  const onShowFullPreviousLineChange = (event: SyntheticEvent, data: CheckboxProps) => {
    onSettingsUpdate({
      ...settings,
      showFullPreviousLine: data.checked,
    });
  };
  const onRevealLastWordInLinesChange = (event: SyntheticEvent, data: CheckboxProps) => {
    onSettingsUpdate({
      ...settings,
      revealLastWordInLines: data.checked,
    });
  };
  const onRevealAtMostPercentChange = (event: SyntheticEvent, data: DropdownProps) => {
    onSettingsUpdate({
      ...settings,
      revealAtMostPercent: data.value,
    });
  };
  const onStepDurationChange = (event: SyntheticEvent, data: DropdownProps) => {
    onSettingsUpdate({
      ...settings,
      stepDuration: data.value,
    });
  };
  const onTurnOnTtsChange = (event: SyntheticEvent, data: CheckboxProps) => {
    onSettingsUpdate({
      ...settings,
      turnOnTts: data.checked,
    });
  };
  const playersCount = useMemo(() => {
    return players.reduce((prevCount, player) => prevCount + (player.left ? 0 : 1), 0);
  }, [players]);
  return (
    <Container>
      <Grid padded>
        <Grid.Row columns={2}>
          <Grid.Column width={13}>
            <Button onClick={onBack} basic>
              <Icon name="arrow left" />
              {t("gameBackButton")}
            </Button>
          </Grid.Column>
          <Grid.Column width={3} textAlign="right">
            <Button icon={isMuted ? "volume off" : "volume up"} active={false} basic onClick={toggleMuted} />
          </Grid.Column>
        </Grid.Row>
      </Grid>
      <Grid columns={2} divided padded stackable>
        <Grid.Column width={5}>
          <div>
            {t("gamePlayersCountLabel")}: {playersCount} / {settings && settings.maxPlayers}
          </div>
          {players.map((p: PlayerInfo) => (
            <div key={p.id} className="ui-player-list-item" style={p.left ? { display: "none" } : undefined}>
              <Image avatar src={p.avatar} />
              <span className="ui-player-list-item-name">{p.name}</span>
              {(p.id === selfId || p.id === hostId) && (
                <Icon.Group size="big">
                  {p.id === hostId && <Icon name="certificate" color="yellow" />}
                  {p.id === selfId && <Icon name="check" color="green" />}
                </Icon.Group>
              )}
              {selfId && hostId && selfId === hostId && p.id !== selfId && <Button icon="ban" color="red" onClick={() => setConfirmKick(p)} compact circular />}
            </div>
          ))}
        </Grid.Column>
        <Grid.Column width={11}>
          <Grid>
            <Grid.Row>
              <Grid.Column>
                <Form>
                  <Form.Field inline>
                    <label>{t("gameSettingsMaxPlayers")}</label>
                    <Dropdown
                      disabled={!settings || !(selfId && hostId && selfId === hostId)}
                      options={[
                        { key: "2", value: 2, text: "2" },
                        { key: "3", value: 3, text: "3" },
                        { key: "4", value: 4, text: "4" },
                        { key: "5", value: 5, text: "5" },
                        { key: "6", value: 6, text: "6" },
                        { key: "7", value: 7, text: "7" },
                        { key: "8", value: 8, text: "8" },
                        { key: "9", value: 9, text: "9" },
                        { key: "10", value: 10, text: "10" },
                        { key: "11", value: 11, text: "11" },
                        { key: "12", value: 12, text: "12" },
                        { key: "13", value: 13, text: "13" },
                        { key: "14", value: 14, text: "14" },
                        { key: "15", value: 15, text: "15" },
                        { key: "16", value: 16, text: "16" },
                      ]}
                      value={settings && settings.maxPlayers}
                      onChange={onMaxPlayersChange}
                    />
                  </Form.Field>
                  <Form.Field inline>
                    <label>{t("gameSettingsShowFullPreviousLine")}</label>
                    <Checkbox
                      disabled={!settings || !(selfId && hostId && selfId === hostId)}
                      toggle
                      className="settings-checkbox"
                      checked={settings && settings.showFullPreviousLine}
                      onChange={onShowFullPreviousLineChange}
                    />
                  </Form.Field>
                  <Form.Field inline>
                    <label>{t("gameSettingsRevealLastWordInLines")}</label>
                    <Checkbox
                      disabled={!settings || !(selfId && hostId && selfId === hostId)}
                      toggle
                      className="settings-checkbox"
                      checked={settings && settings.revealLastWordInLines}
                      onChange={onRevealLastWordInLinesChange}
                    />
                  </Form.Field>
                  <Form.Field inline>
                    <label>{t("gameSettingsRevealAtMostPercent")}</label>
                    <Dropdown
                      disabled={!settings || !settings.revealLastWordInLines || !(selfId && hostId && selfId === hostId)}
                      options={[
                        { key: "10", value: 10, text: "10%" },
                        { key: "15", value: 15, text: "15%" },
                        { key: "20", value: 20, text: "20%" },
                        { key: "25", value: 25, text: "25%" },
                        { key: "33", value: 33, text: "33%" },
                        { key: "50", value: 50, text: "50%" },
                      ]}
                      value={settings && settings.revealAtMostPercent}
                      onChange={onRevealAtMostPercentChange}
                    />
                  </Form.Field>
                  <Form.Field inline>
                    <label>{t("gameSettingsStepDuration")}</label>
                    <Dropdown
                      disabled={!settings || !(selfId && hostId && selfId === hostId)}
                      options={[
                        { key: "30", value: 30000, text: `30 ${t("gameSettingsSeconds")}` },
                        { key: "45", value: 45000, text: `45 ${t("gameSettingsSeconds")}` },
                        { key: "60", value: 60000, text: `1 ${t("gameSettingsMinutes")}` },
                        { key: "90", value: 90000, text: `1.5 ${t("gameSettingsMinutes")}` },
                        { key: "120", value: 120000, text: `2 ${t("gameSettingsMinutes")}` },
                        { key: "180", value: 180000, text: `3 ${t("gameSettingsMinutes")}` },
                        { key: "300", value: 300000, text: `5 ${t("gameSettingsMinutes")}` },
                      ]}
                      value={settings && settings.stepDuration}
                      onChange={onStepDurationChange}
                    />
                  </Form.Field>
                  <Form.Field inline>
                    <label>{t("gameSettingsTurnOnTts")}</label>
                    <Checkbox
                      disabled={!settings || !(selfId && hostId && selfId === hostId)}
                      toggle
                      className="settings-checkbox"
                      checked={settings && settings.turnOnTts}
                      onChange={onTurnOnTtsChange}
                    />
                  </Form.Field>
                </Form>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column>
                <Button onClick={onInvite}>
                  <Icon name="chain" />
                  {t("gameInviteButton")}
                </Button>
                <Button disabled={!(selfId && hostId && selfId === hostId)} primary onClick={onStart}>
                  {t("gameStartButton")}
                  <Icon name="arrow right" />
                </Button>
              </Grid.Column>
            </Grid.Row>
          </Grid>
        </Grid.Column>
      </Grid>
      <Confirm
        open={!!confirmKick}
        onCancel={onCancelKick}
        onConfirm={onConfirmKick}
        cancelButton={t("confirmKickNoButton")}
        confirmButton={t("confirmKickYesButton")}
        header={t("confirmKickHeader")}
        content={
          confirmKick && (
            <Segment basic>
              <Image avatar src={confirmKick.avatar} />
              {confirmKick.name}
            </Segment>
          )
        }
      />
    </Container>
  );
}

interface GameStepsProps {
  settings: any;
  stepData: any;
  readyState?: { ready: number; total: number };
  onInput: (step: number, input: string, ready: boolean) => void;
}

function GameSteps({ settings, stepData, readyState, onInput }: GameStepsProps) {
  const { t } = useTranslation();
  const [timerState, timerReset] = useCountdownTimer(0, false);
  const [sent, setSent] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const { isMuted, toggleMuted, playSound } = useSoundsHelper(soundsHelper);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputRegexp = useMemo(() => {
    return new RegExp(`[^${settings && settings.lang === "ru" ? "а-яё" : "a-z"}\\p{Zs}\\p{P}]`, "giu");
  }, [settings && settings.lang]);

  const onButtonClick = () => {
    if (!input && !sent) {
      return;
    }
    const newSent = !sent;
    setSent(newSent);
    onInput(stepData.step, input, newSent);
  };

  const onInputChange = (event: React.ChangeEvent, data: InputOnChangeData) => {
    const newInput = data.value.replaceAll(inputRegexp, "");
    setInput(newInput);
    onInput(stepData.step, newInput, sent);
  };

  const onInputKeyPress = (event: React.KeyboardEvent) => {
    if (event.code !== "Enter") {
      return;
    }
    if (!input && !sent) {
      return;
    }
    const newSent = !sent;
    setSent(newSent);
    onInput(stepData.step, input, newSent);
  };

  useEffect(() => {
    setSent(false);
    setInput(stepData?.input ?? "");
    if (stepData) {
      timerReset(stepData.timeout);
    }
    if (stepData && stepData.step > 0) {
      playSound("step");
    }
  }, [stepData?.step]);

  useEffect(() => {
    if (!sent) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [stepData?.step, sent]);

  if (!stepData) {
    return null;
  }

  return (
    <Container>
      <Grid padded>
        <Grid.Row columns={2}>
          <Grid.Column width={13}>
            <span>
              {stepData.step} / {stepData.last}
            </span>
            {stepData && stepData.step > 0 && readyState && (
              <>
                &nbsp;&nbsp;
                <small>
                  ({readyState.ready} / {readyState.total})
                </small>
              </>
            )}
          </Grid.Column>
          <Grid.Column width={3} textAlign="right">
            <Button icon={isMuted ? "volume off" : "volume up"} active={false} basic onClick={toggleMuted} />
          </Grid.Column>
        </Grid.Row>
      </Grid>
      <Grid padded stackable>
        <Grid.Row>
          <Grid.Column>
            <Progress total={timerState.duration} value={timerState.passed} size="tiny" />
          </Grid.Column>
        </Grid.Row>
        {stepData && stepData.step === 0 && stepData.active && (
          <Grid.Row textAlign="center">
            <Grid.Column>
              <Transition animation="tada" duration={1000} transitionOnMount={true}>
                <Header as="h1">
                  <Header.Content>{t("gameStepsGetReady")}</Header.Content>
                </Header>
              </Transition>
            </Grid.Column>
          </Grid.Row>
        )}
        {stepData && stepData.lines && (
          <Grid.Row>
            <Grid.Column>
              {stepData.lines.map((line: string) => (
                <>
                  {line}
                  <br />
                </>
              ))}
            </Grid.Column>
          </Grid.Row>
        )}
        {stepData && stepData.step > 0 && stepData.active && (
          <Grid.Row columns={2}>
            <Grid.Column width={13}>
              <Input
                disabled={sent}
                fluid
                onChange={onInputChange}
                onKeyPress={onInputKeyPress}
                value={input}
                maxLength={100}
                placeholder={t(stepData.step === 1 ? "gameStepsFirstLine" : "gameStepsContinue")}
                tabIndex={-1}
              >
                <input ref={inputRef} />
              </Input>
            </Grid.Column>
            <Grid.Column width={3}>
              <Button primary fluid icon={sent ? "edit" : "send"} content={t(sent ? "gameStepsEditButton" : "gameStepsSendButton")} onClick={onButtonClick} />
            </Grid.Column>
          </Grid.Row>
        )}
      </Grid>
    </Container>
  );
}

interface GameResultsProps {
  resultsData: any;
  players: PlayerInfo[];
  hostId: string;
  selfId: string;
  muteTts: boolean;
  resultsRevealData: {
    currentPoetry: number;
    currentPoetryLine: number;
  };
  onRevealResult: (poetry: number, poetryLine: number) => void;
  onNewRound: () => void;
}

function GameResults({ resultsData, players, hostId, selfId, muteTts, resultsRevealData, onRevealResult, onNewRound }: GameResultsProps) {
  const { t, i18n } = useTranslation();
  const [poeties, setPoetries] = useState<any[]>([]);
  const { appendMessage } = useAlertContext();
  const poetryElementRef = useRef(null);
  const speechHelperRef = useRef(speechHelper);
  const { isMuted, toggleMuted } = useSoundsHelper(soundsHelper);
  const [maxResultsRevealData, setMaxResultsRevealData] = useState<{ currentPoetryLine: number; currentPoetry: number }>({ currentPoetryLine: -1, currentPoetry: -1 });
  const buttonsRef = useRef<HTMLDivElement>(null);

  const onRevealNextResult = () => {
    const { currentPoetryLine, currentPoetry } = resultsRevealData;

    if (maxResultsRevealData.currentPoetry >= currentPoetry + 1) {
      onRevealResult(currentPoetry + 1, maxResultsRevealData.currentPoetry === currentPoetry + 1 ? maxResultsRevealData.currentPoetryLine : poeties[currentPoetry + 1].length - 1);
    } else if (currentPoetry < 0 || (currentPoetryLine >= 0 && currentPoetryLine === poeties[currentPoetry].length - 1)) {
      onRevealResult(currentPoetry + 1, -1);
    } else {
      onRevealResult(currentPoetry, currentPoetryLine + 1);
    }
  };

  const onRevealPrevResult = () => {
    const { currentPoetry } = resultsRevealData;
    if (currentPoetry > 0) {
      onRevealResult(currentPoetry - 1, poeties[currentPoetry - 1].length - 1);
    }
  };

  const onSave = () => {
    if (!poetryElementRef.current) {
      return;
    }

    const { currentPoetry } = resultsRevealData;

    saveImage(poeties[currentPoetry])
      .then((canvas) => {
        const uri = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = uri;
        link.download = `${currentPoetry + 1}-${nanoid()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch((error) => {
        appendMessage("Error", "Could not save image", "error");
        console.error(error);
      });
  };

  useEffect(() => {
    if (!resultsData) {
      setPoetries([]);
      return;
    }
    setPoetries(
      resultsData.order
        .map((pId: string) => {
          if (!resultsData.results[pId]) {
            return undefined;
          }
          return resultsData.results[pId].map((line: { author: string; input: string }) => {
            const author = players.find((p2) => p2.id === line.author);
            return {
              playerId: line.author,
              avatar: author?.avatar || "",
              name: author?.name || "???",
              text: line.input,
            };
          });
        })
        .filter((poetry: any[]) => poetry && poetry.length)
    );
  }, [resultsData, players]);

  useEffect(() => {
    speechHelperRef.current.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    speechHelperRef.current.muted = muteTts || isMuted;
  }, [muteTts, isMuted]);

  useEffect(() => {
    const { currentPoetryLine, currentPoetry } = resultsRevealData;

    if (currentPoetry > maxResultsRevealData.currentPoetry || (currentPoetry === maxResultsRevealData.currentPoetry && currentPoetryLine > maxResultsRevealData.currentPoetryLine)) {
      setMaxResultsRevealData({ currentPoetry, currentPoetryLine });
    }

    if (buttonsRef.current) {
      buttonsRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [resultsRevealData]);

  useEffect(() => {
    const { currentPoetryLine, currentPoetry } = maxResultsRevealData;

    if (currentPoetry >= 0 && currentPoetryLine >= 0 && poeties[currentPoetry] && poeties[currentPoetry][currentPoetryLine]) {
      speechHelperRef.current.speak(poeties[currentPoetry][currentPoetryLine].text);
    }
  }, [maxResultsRevealData]);

  const { currentPoetryLine, currentPoetry } = resultsRevealData;
  const isPoetryFullyRevealed = currentPoetry >= 0 && poeties[currentPoetry] && currentPoetryLine >= 0 && currentPoetryLine === poeties[currentPoetry].length - 1;
  const isAllPoetriesRevealed = currentPoetry >= 0 && currentPoetry === poeties.length - 1 && currentPoetryLine >= 0 && currentPoetryLine === poeties[currentPoetry].length - 1;
  const isHost = selfId && hostId && selfId === hostId;

  return (
    <Container>
      <Grid padded>
        <Grid.Row columns={2}>
          <Grid.Column width={13}>
            {currentPoetry >= 0 && (
              <span>
                {currentPoetry + 1} / {poeties.length}
              </span>
            )}
            {currentPoetry >= 0 && poeties[currentPoetry] && (
              <>
                &nbsp;&nbsp;
                <small>
                  ({currentPoetryLine + 1} / {poeties[currentPoetry].length})
                </small>
              </>
            )}
          </Grid.Column>
          <Grid.Column width={3} textAlign="right">
            <Button icon={isMuted ? "volume off" : "volume up"} active={false} basic onClick={toggleMuted} />
          </Grid.Column>
        </Grid.Row>
        <Divider horizontal>∗ ∗ ∗</Divider>
        {currentPoetry >= 0 && poeties[currentPoetry] && (
          <>
            <Ref innerRef={poetryElementRef}>
              <Grid.Row>
                <Grid.Column>
                  {poeties[currentPoetry].map((line: { playerId: string; avatar: string; name: string; text: string }, index: number) => {
                    return (
                      <div className="poetry-line-block" key={`poetry-line-${line.playerId}`}>
                        {index <= currentPoetryLine + 1 ? (
                          <>
                            <div>
                              {line.avatar && <Image avatar src={line.avatar} />}
                              {line.name}:
                            </div>
                            <Segment className="poetry-line">{index <= currentPoetryLine ? line.text : "..."}</Segment>
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
        <Ref innerRef={buttonsRef}>
          <Grid.Row>
            <Grid.Column textAlign="center">
              {isHost && currentPoetry > 0 && (
                <Button primary onClick={onRevealPrevResult}>
                  <Icon name="arrow left" />
                  {t("gameResultsPrevButton")}
                </Button>
              )}
              {isPoetryFullyRevealed && (
                <Button primary onClick={onSave}>
                  <Icon name="photo" />
                  {t("gameResultsSaveButton")}
                </Button>
              )}
              {isHost && !isAllPoetriesRevealed && (
                <Button primary onClick={onRevealNextResult}>
                  {t("gameResultsNextButton")}
                  <Icon name="arrow right" />
                </Button>
              )}
              {isHost && isAllPoetriesRevealed && (
                <Button primary onClick={onNewRound}>
                  {t("gameResultsNewRoundButton")}
                  <Icon name="arrow right" />
                </Button>
              )}
            </Grid.Column>
          </Grid.Row>
        </Ref>
      </Grid>
    </Container>
  );
}

export default Game;
