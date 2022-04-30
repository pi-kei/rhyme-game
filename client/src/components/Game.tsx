import * as nakamajs from "@heroiclabs/nakama-js";
import { useEffect, useRef, useState } from "react";
//import multiavatar from '@multiavatar/multiavatar';
import { useHistory, useParams } from "react-router";
import { OpCode, HostChangedMessageData, KickPlayerMessageData, StageChangedMessageData } from "../common";
import NakamaHelper from "../nakamaHelper";
import { useAlertContext } from "./Alert";
import "./Game.css";
import { useTranslation } from "react-i18next";
import SoundsHelper, { useSoundsHelper } from "../soundsHelper";
import SpeechHelper from "../speechHelper";
import storage from "../storage";
import GameResults from "./GameResults";
import GameSteps from "./GameSteps";
import Lobby from "./Lobby";
import Login from "./Login";

export interface PlayerInfo {
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
export const speechHelper = new SpeechHelper();
export const soundsHelper = new SoundsHelper();

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
    const nh = nakamaHelperRef.current;
    nh.onDisconnect = onDisconnect;
    nh.onReconnect = onReconnect;
    nh.onError = onError;
    nh.onMatchPresence = onMatchPresence;
    nh.onMatchData = onMatchData;
    nh.onNotification = onNotification;
    nh.onTokensUpdate = onTokensUpdate;

    return () => {
      nh.onDisconnect = undefined;
      nh.onReconnect = undefined;
      nh.onError = undefined;
      nh.onMatchPresence = undefined;
      nh.onMatchData = undefined;
      nh.onNotification = undefined;
      nh.onTokensUpdate = undefined;
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

export default Game;
