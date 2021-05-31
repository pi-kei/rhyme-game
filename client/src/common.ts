// This file have to be in sync both on server and client

// NOTE: OpCode can't be equal to 0
export enum OpCode {
    // initiated by server
    HOST_CHANGED = 6,
    STAGE_CHANGED = 1,
    NEXT_STEP = 5,
    
    // initiated by players
    KICK_PLAYER = 2, // initiated by host player on gettig started stage
    START_GAME = 3, // initiated by host player on gettig started stage
    SETTINGS_UPDATE = 7, // initiated by host player on gettig started stage
    PLAYER_INPUT = 4, // initiated by each player when game is in progress
}

export interface KickPlayerMessageData {
    userId: string
}

export interface HostChangedMessageData {
    userId: string
}

export interface StartGameMessageData {
    
}