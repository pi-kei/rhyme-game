import * as nakamajs from "@heroiclabs/nakama-js";

export default class Nakama {
    private customId: string | undefined;

    private client: nakamajs.Client | undefined;
    private session: nakamajs.Session | undefined;
    private socket: nakamajs.Socket | undefined;
    private match: nakamajs.Match | undefined;

    private onDisconnectHandler: ((event: Event) => void) | undefined;
    private onErrorHandler: ((event: Event) => void) | undefined;
    private onMatchPresenceHandler: ((event: nakamajs.MatchPresenceEvent) => void) | undefined;
    private onMatchDataHandler: ((event: nakamajs.MatchData) => void) | undefined;

    get selfId() {
        return this.session?.user_id;
    }

    set onDisconnect(value: ((event: Event) => void) | undefined) {
        this.onDisconnectHandler = value;
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

    async auth(customId: string, jwt: string | null | undefined): Promise<string> {
        this.customId = customId;
        if (!this.client) {
            this.client = new nakamajs.Client('defaultkey', '127.0.0.1', '7350', false);
        }
        if (!this.session && jwt) {
            try {
                this.session = nakamajs.Session.restore(jwt);
            } catch (error) {
                // ignore
            }
        }
        await this.reauth();
        if (!this.socket) {
            this.socket = this.client.createSocket(false, true);
            this.socket.ondisconnect = (event: Event) => {
                if (this.onDisconnectHandler) {
                    this.onDisconnectHandler(event);
                }
            };
            this.socket.onerror = (event: Event) => {
                if (this.onErrorHandler) {
                    this.onErrorHandler(event);
                }
            };
            this.socket.onmatchpresence = (event: nakamajs.MatchPresenceEvent) => {
                if (this.onMatchPresenceHandler) {
                    this.onMatchPresenceHandler(event);
                }
            };
            this.socket.onmatchdata = (event: nakamajs.MatchData) => {
                if (this.onMatchDataHandler) {
                    this.onMatchDataHandler(event);
                }
            };
            this.session = await this.socket.connect(this.session!, false);
        }

        return this.session!.token;
    }

    async updateAccount(userName: string, avatar: string): Promise<boolean> {
        await this.reauth();
        const result = await this.client!.updateAccount(this.session!, {
            display_name: userName,
            avatar_url: avatar
        });

        return result;
    }

    async getUsers(ids: string[]): Promise<nakamajs.User[]> {
        await this.reauth();
        const users: nakamajs.User[] = (await this.client!.getUsers(this.session!, ids)).users || [];
        
        return users;
    }

    async joinOrCreateMatch(matchId: string | undefined): Promise<nakamajs.Match> {
        if (!matchId) {
            await this.reauth();
            const rpcResponse = await this.client!.rpc(this.session!, 'create_match_server_authoritative', {});
            matchId = (rpcResponse.payload as {match_id: string}).match_id;
        }

        this.match = await this.socket!.joinMatch(matchId);

        return this.match;
    }

    async leaveCurrentMatch(): Promise<void> {
        if (this.match) {
            const matchId = this.match.match_id;
            this.match = undefined;
            await this.socket!.leaveMatch(matchId);
        }
    }

    async sendMatchMessage(opCode: number, data: any): Promise<void> {
        await this.socket!.sendMatchState(this.match!.match_id, opCode, data);
    }

    private async reauth(): Promise<void> {
        // NOTE: renew session even if it has few minutes before expiration
        if (!this.session || this.session.isexpired(Math.floor(Date.now() / 1000) - 5 * 60)) {
            this.session = await this.client!.authenticateCustom(this.customId!, true);
        }
    }
}