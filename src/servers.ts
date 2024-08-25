
import EventEmitter from 'events';
import WebSocket from 'ws';
import { CircularBuffer } from "./lib/circular_buffer";


type ServerEventEmitterTypes = {[event in HostMessageType]: [message: HostMessage]}
type GlobalServerEventEmitterTypes = {"message": [HostMessageWithId]}

export type ClientMessage = {
    type: "status_request"
} | {
    type: "start_process"
} | {
    type: "stop_process"
} | {
    type: "send_command"
    data: string
} | {
    type: "request_full_stdout"
} | {
    type: "request_full_stderr"
}

export type HostMessage = {
    type: "status"
    process_active: boolean,
    started_at: string
} | {
    type: "stdout",
    data: string
} | {
    type: "stderr",
    data: string
} | {
    type: "full_stdout",
    data: string[]
} | {
    type: "full_stderr",
    data: string[]
}

export type HostMessageWithId = {message: HostMessage, server_id: number};

type HostMessageType = HostMessage["type"];

class ServerSessionHandler {
    private SERVERS: Map<number, ServerSession> = new Map();
    serverEvent: EventEmitter<GlobalServerEventEmitterTypes> = new EventEmitter();

    getServer(id: number) {
        return this.SERVERS.get(id);
    }

    createServer(id: number) {
        if (this.SERVERS.get(id)) {
            throw new Error("attempted to create duplicate server");
        }

        const newServer = new ServerSession(id);
        this.SERVERS.set(id, newServer);

        return newServer;
    }

    getServerList() {
        return this.SERVERS.values();
    }

}

const HANDLER = new ServerSessionHandler();

class ServerSession {
    id: number;
    process_active: boolean;
    started_at: undefined | string;
    last_updated: Date;
    socket?: WebSocket | undefined;
    emitter: EventEmitter<ServerEventEmitterTypes>;
    stdout: CircularBuffer<string>;
    
    constructor(server_id: number, socket?: WebSocket) {
        this.id = server_id;
        this.process_active = false;
        this.started_at = undefined;
        this.socket = undefined;
        this.emitter = new EventEmitter();
        this.last_updated = new Date();
        // Default size will be 1024 lines.
        this.stdout = new CircularBuffer(1024);

        if (socket) {
            this.websocketConnected(socket);
        }
    }

    websocketConnected(socket: WebSocket) {
        if (this.socket) {
            this.socket.close();
        }
        this.socket = socket;

        socket.on("message", (data: string) => {
            try {
                const message = JSON.parse(data) as HostMessage;

                this.parseMessage(message);
            } catch (e) {
                console.log("Parsed malformed JSON", e, data);
            }
        });

        socket.on("close", (code, reason) => {
            this.websocketDisconnected();
        });

        this.sendMessage({type: "status_request"});
    }

    websocketDisconnected() {
        if (this.socket) {
            this.socket.close();
        }
        this.socket = undefined;
        this.sendMessage({type: "status_request"});
    }

    parseMessage(message: HostMessage) {
        this.emitter.emit(message.type, message);
        HANDLER.serverEvent.emit("message", { message, server_id: this.id });

        // console.log(`Recieved message from server ${this.id}:${JSON.stringify(message)}`);

        switch (message.type) {
            case "full_stderr":
                break;
            case "full_stdout":
                break;
            case "status":
                this.process_active = message.process_active;
                this.started_at = message.started_at == "" ? undefined : message.started_at;
                this.last_updated = new Date();
                break;
            case "stderr":
                break;
            case "stdout":
                this.stdout.push(message.data);
                break;
        }
    }

    sendMessage(message: ClientMessage) {
        if (!this.socket) return false;

        this.socket.send(JSON.stringify(message));

        return true;
    }

    startServer() {
        return this.sendMessage({ type: "start_process" });
    }

    stopServer() {
        return this.sendMessage({ type: "stop_process" });
    }

    awaitMessage<T extends HostMessageType>(type: T): PromiseLike<HostMessage & {type: T} | undefined> {
        if (!this.socket) return Promise.resolve(undefined);

        return new Promise(resolve => {
            this.emitter.prependOnceListener(type as HostMessageType, (message) => {
                resolve(message as HostMessage & {type: T});
            });

            setTimeout(() => resolve(undefined), 5000);
        })
    }

    async getState() {
        const stateWaiter = this.awaitMessage("status");

        this.sendMessage({ type: "status_request" });

        const status = await stateWaiter;

        if (!status) return;

        this.last_updated = new Date();
        this.process_active = status.process_active;
        this.started_at = status.started_at;

        return status;
    }
}

export { HANDLER as ServerSessionHandler };