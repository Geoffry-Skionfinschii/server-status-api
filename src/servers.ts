
import EventEmitter from 'events';
import WebSocket from 'ws';

type ServerEventEmitterTypes = {[event in Message["type"]]: [message: Message]}

type ServerStatus = {
    process_active: boolean,
    started_at: string,
    socket?: WebSocket,
    emitter: EventEmitter<ServerEventEmitterTypes>
}

type Message = {
    type: "status_request"
} | {
    type: "status"
    process_active: boolean,
    started_at: string
} | {
    type: "start_process"
} | {
    type: "stop_process"
} | {
    type: "send_command"
    data: string
} | {
    type: "stdout",
    data: string
} | {
    type: "stderr",
    data: string
} | {
    type: "request_full_stdout"
} | {
    type: "request_full_stderr"
} | {
    type: "full_stdout",
    data: string
} | {
    type: "full_stderr",
    data: string
}

const SERVERS: {[id: number]: ServerStatus} = {};

export function getServer(id: number) {
    return SERVERS[id];
}

function getOrCreateServer(id: number) {
    let server = getServer(id);
    if (!server) {
        const newServer = {
            emitter: new EventEmitter<ServerEventEmitterTypes>(),
            process_active: false,
            started_at: ""
        }

        SERVERS[id] = newServer;
        return newServer as ServerStatus;
    }
    return server;
}

function updateState(id: number, state: Message & {type: "status"}) {
    let server = getOrCreateServer(id);
    server.process_active = state.process_active,
    server.started_at = state.started_at
}

export function waitForMessage(type: Message["type"], server_id: number): PromiseLike<undefined | Message> {
    let server = getServer(server_id);

    if (!server || !server.socket) {
        return new Promise(resolve => resolve(undefined));
    }

    return new Promise(resolve => {
        server.emitter.once(type, (msg) => {
            resolve(msg);
        });

        setTimeout(() => resolve(undefined), 5000);
    })
}

export function setWebsocket(id: number, socket?: WebSocket) {
    let server = getOrCreateServer(id);
    server.socket = socket;
}

export function getState(id: number) {

    let server = getServer(id);

    if (server) {
        return {
            process_active: server.process_active,
            started_at: server.started_at,
            socket_active: server.socket ? true : false
        }
    } else {
        return undefined;
    }

}

export function parseMessage(server_id: number, messageData: Record<string, any>) {

    const message = messageData as Message;
    const server = getOrCreateServer(server_id);

    server.emitter.emit(message.type, message);

    switch (message.type) {
        case "full_stderr":
            break;
        case "full_stdout":
            break;
        case "request_full_stderr":
            break;
        case "request_full_stdout":
            break;
        case "send_command":
            break;
        case "start_process":
            break;
        case "status":
            updateState(server_id, message);
            break;
        case "status_request":
            break;
        case "stderr":
            break;
        case "stdout":
            break;
        case "stop_process":
            break;
    }
}

export function sendMessage(server_id: number, messageData: Message) {
    const msg = JSON.stringify(messageData);

    const server = getServer(server_id);
    if (!server) return;

    if (!server.socket) return;

    server.socket.send(msg);
}