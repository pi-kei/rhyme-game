// This file have to be in sync both on server and client

type Stage = "gettingReady" | "inProgress" | "results";

// NOTE: OpCode can't be equal to 0
enum OpCode {
  // initiated by server
  HOST_CHANGED = 6,
  STAGE_CHANGED = 1,
  NEXT_STEP = 5,
  RESULTS = 8,
  READY_UPDATE = 11,
  TERMINATING = 12,

  // initiated by players
  KICK_PLAYER = 2, // initiated by host player on gettig started stage
  START_GAME = 3, // initiated by host player on gettig started stage
  NEW_ROUND = 9, // initiated by host player on results stage
  REVEAL_RESULT = 10, // initiated by host player on results stage and relayed to other players
  SETTINGS_UPDATE = 7, // initiated by host player on gettig started stage
  PLAYER_INPUT = 4, // initiated by each player when game is in progress
}

interface KickPlayerMessageData {
  userId: string;
}

interface HostChangedMessageData {
  userId: string;
}

interface StartGameMessageData {}

interface StageChangedMessageData {
  stage: Stage;
}
