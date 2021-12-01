import * as nakamajs from "@heroiclabs/nakama-js";
import retry from './retry';

export default class NakamaHelper {
    readonly serverKey: string | undefined;
    readonly host: string | undefined;
    readonly port: string | undefined;
    readonly useSSL: boolean | undefined;    
    
    private customId: string | undefined;
    private client: nakamajs.Client | undefined;
    private session: nakamajs.Session | undefined;
    private socket: nakamajs.Socket | undefined;
    private matchId: string | undefined;

    private onDisconnectHandler: (() => void) | undefined;
    private onReconnectHandler: ((matchId: string | undefined) => void) | undefined;
    private onErrorHandler: ((event: Event) => void) | undefined;
    private onMatchPresenceHandler: ((event: nakamajs.MatchPresenceEvent) => void) | undefined;
    private onMatchDataHandler: ((event: nakamajs.MatchData) => void) | undefined;
    private onTokensUpdateHandler: ((token?: string, refreshToken?: string) => void) | undefined;

    constructor(serverKey: string | undefined, host: string | undefined, port: string | undefined, useSSL: boolean | undefined) {
        this.serverKey = serverKey;
        this.host = host;
        this.port = port;
        this.useSSL = useSSL;
    }

    get selfId() {
        return this.session?.user_id;
    }

    get currentMatchId() {
        return this.matchId;
    }

    set onDisconnect(value: (() => void) | undefined) {
        this.onDisconnectHandler = value;
    }

    set onReconnect(value: ((matchId: string | undefined) => void) | undefined) {
        this.onReconnectHandler = value;
    }

    set onError(value: ((event: Event) => void) | undefined) {
        this.onErrorHandler = value;
    }

    set onMatchPresence(value: ((event: nakamajs.MatchPresenceEvent) => void) | undefined) {
        this.onMatchPresenceHandler = value;
    }

    set onMatchData(value: ((event: nakamajs.MatchData) => void) | undefined) {
        this.onMatchDataHandler = value;
    }

    set onTokensUpdate(value: ((token?: string, refreshToken?: string) => void) | undefined) {
        this.onTokensUpdateHandler = value;
    }

    async auth(customId: string, token?: string | null, refreshToken?: string | null): Promise<void> {
        if (this.customId && this.customId !== customId) {
            // force session, socket and match to reinit
            this.session = undefined;
            if (this.socket) {
                this.socket.ondisconnect = () => undefined;
                this.socket.onerror = () => undefined;
                this.socket.onmatchpresence = () => undefined;
                this.socket.onmatchdata = () => undefined;
                this.socket.disconnect(false);
                this.socket = undefined;
            }
            this.matchId = undefined;
        }
        this.customId = customId;
        if (!this.client) {
            this.client = new nakamajs.Client(this.serverKey, this.host, this.port, this.useSSL, undefined, false);
        }
        if (!this.session && token && refreshToken) {
            try {
                this.session = nakamajs.Session.restore(token, refreshToken);
            } catch (error) {
                // ignore
            }
        }
        await this.reauth();
        if (!this.socket) {
            await this.createSocket();
            if (!this.socket) {
                this.session = undefined;
                await this.reauth();
                await this.createSocket();
                if (!this.socket) {
                    throw new Error('Connection failed');
                }
            }
        }
    }

    async updateAccount(userName: string, avatar: string): Promise<boolean> {
        await this.reauth();
        const result = await retry<boolean>(() => this.client!.updateAccount(this.session!, {
            display_name: userName,
            avatar_url: avatar
        }));

        return result;
    }

    async getUsers(ids: string[]): Promise<nakamajs.User[]> {
        await this.reauth();
        const users: nakamajs.User[] = (await retry<nakamajs.Users>(() => this.client!.getUsers(this.session!, ids))).users || [];
        
        return users;
    }

    async joinOrCreateMatch(matchId: string | null | undefined, input?: object): Promise<nakamajs.Match> {
        await this.leaveCurrentMatch();
        
        if (!matchId) {
            await this.reauth();
            const rpcResponse = await retry(() => this.client!.rpc(this.session!, 'create_match_server_authoritative', input || {}));
            matchId = (rpcResponse.payload as {match_id: string}).match_id;
        }

        const match = await this.socket!.joinMatch(matchId);

        this.matchId = match.match_id;

        return match;
    }

    async leaveCurrentMatch(): Promise<void> {
        if (this.socket && this.matchId) {
            const matchId = this.matchId;
            this.matchId = undefined;
            await this.socket!.leaveMatch(matchId);
        }
    }

    async sendMatchMessage(opCode: number, data: any): Promise<void> {
        if (this.socket && this.matchId) {
            await this.socket!.sendMatchState(this.matchId!, opCode, data);
        }
    }

    private async reauth(): Promise<void> {
        // NOTE: renew session even if it has some time before expiration
        let isSessionUpdated: boolean = false;
        if (!this.session || !this.session.refresh_token || this.session.isrefreshexpired(Math.floor(Date.now() / 1000) + 5 * 60)) {
            this.session = await retry<nakamajs.Session>(() => this.client!.authenticateCustom(this.customId!, true));
            isSessionUpdated = true;
        } else if (this.session.isexpired(Math.floor(Date.now() / 1000) + 5)) {
            try {
                this.session = await this.client!.sessionRefresh(this.session);
            } catch (error) {
                // Refresh may fail if refresh token actually expired on server side
                this.session = await retry<nakamajs.Session>(() => this.client!.authenticateCustom(this.customId!, true));
            }
            isSessionUpdated = true;
        }
        if (isSessionUpdated && this.onTokensUpdateHandler) {
            this.onTokensUpdateHandler(this.session.token, this.session.refresh_token);
        }
    }

    private async createSocket(): Promise<void> {
        const socket = this.client!.createSocket(this.useSSL, true);
        try {
            await this.reauth();
            this.session = await socket.connect(this.session!, false);
            socket.ondisconnect = (event: Event) => {
                socket.ondisconnect = () => undefined;
                socket.onerror = () => undefined;
                socket.onmatchpresence = () => undefined;
                socket.onmatchdata = () => undefined;
                if (this.socket !== socket) {
                    return;
                }
                this.socket = undefined;
                const matchId = this.matchId;
                this.matchId = undefined;
                retry(async () => {
                    await this.createSocket();
                    if (!this.socket) {
                        throw new Error('Connection failed');
                    }
                }).then(() => {
                    if (this.onReconnectHandler) {
                        this.onReconnectHandler(matchId);
                    }
                }).catch(() => {
                    if (this.onDisconnectHandler) {
                        this.onDisconnectHandler();
                    }
                });
            };
            socket.onerror = (event: Event) => {
                if (this.onErrorHandler) {
                    this.onErrorHandler(event);
                }
            };
            socket.onmatchpresence = (event: nakamajs.MatchPresenceEvent) => {
                if (this.onMatchPresenceHandler) {
                    this.onMatchPresenceHandler(event);
                }
            };
            socket.onmatchdata = (event: nakamajs.MatchData) => {
                if (this.onMatchDataHandler) {
                    this.onMatchDataHandler(event);
                }
            };
            if (this.socket) {
                this.socket.ondisconnect = () => undefined;
                this.socket.onerror = () => undefined;
                this.socket.onmatchpresence = () => undefined;
                this.socket.onmatchdata = () => undefined;
                this.socket.disconnect(false);
                this.socket = undefined;
            }
            this.socket = socket;
        } catch (error) {
            // ignore
        }
    }
}