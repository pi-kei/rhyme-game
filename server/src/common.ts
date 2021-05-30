// This file have to be in sync both on server and client

// NOTE: OpCode can't be equal to 0
enum OpCode {
    // initiated by server
    HOST_CHANGED = 6,
    STAGE_CHANGED = 1,
    NEXT_STEP = 5,
    
    // initiated by players
    KICK_PLAYER = 2, // initiated by host player
    START_GAME = 3, // initiated by host player
    PLAYER_INPUT = 4, // initiated by each player when game is in progress
}

interface KickPlayerMessageData {
    userId: string
}

interface HostChangedMessageData {
    userId: string
}