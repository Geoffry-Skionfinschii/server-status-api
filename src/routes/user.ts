import { Router } from "express";
import { db } from "../database";
import argon2 from "argon2";
import { requireAuth } from "../middleware/require_auth";
import { getTokenEmail } from "../auth_tokens";
import { ClientMessage, HostMessage, HostMessageWithId, ServerSessionHandler } from "../servers";

const router = Router();

type UserRequest =
    | ({ server_id: number } & (
          | {
                type: "start_process";
            }
          | {
                type: "stop_process";
            }
          | {
                type: "status_request";
            }
          | {
                type: "rcon";
                data: string;
            }
          | {
                type: "request_stdout";
            }
      ))
    | { type: "server_status_all" } | {type: "discover_servers"};

interface Server {
    id: number;
    name: string;

    game_type?: string;
    game_host?: string;
    game_port?: number;
}

type UserResponse =
    | {
          type: "extended_status";
          process_active: boolean;
          started_at: string;
          last_updated: string;
          last_connected: string;
          websocket_connected: boolean;
      }
    | {
        type: "discover",
        details: Server,
    }
    | {
        type: "stdout",
        data: string,
    } | {
        type: "stderr",
        data: string,
    } | {
        type: "full_stdout",
        data: string[],
    } | {
        type: "full_stderr",
        data: string[],
    };

type UserResponseWithServer = { server_id: number } & { message: UserResponse };

router.ws("/stream/:token", async (ws, req) => {
    const token = req.params.token;
    const id = req.params.id;

    const user = getTokenEmail(token);
    if (!user) {
        ws.close(1002, "Bad Authentication");
        console.log(`Rejected connection from ${JSON.stringify(req.socket.address())}`);
        return;
    }

    console.log(`User ${user} has connected to RCON socket`);

    const constructMessage = (message: UserResponse, server_id: number) =>
        ({ message, server_id } as UserResponseWithServer);

    const sendMessage: (arg: UserResponseWithServer) => void = async ({ message, server_id }) => {


        console.log(`Sending to ${user} ${server_id}:${message.type}`);
        ws.send(JSON.stringify(constructMessage(message, server_id)));
    };

    const handleServerMessage: (arg: HostMessageWithId) => void = async ( {message, server_id}) => {
        const server = await db.selectFrom("servers").where("servers.id", "=", server_id).executeTakeFirstOrThrow();
        const serverSession = ServerSessionHandler.getServer(server_id);

        // Parse message type from server and create necessary user message
        let userMessage: UserResponse | undefined = undefined;
        switch (message.type) {
            case "status":
                userMessage = {
                    type: "extended_status", 
                    last_connected: "",
                    last_updated: serverSession?.last_updated.toISOString() || "",
                    process_active: serverSession?.process_active || false,
                    websocket_connected: serverSession?.process_active || false,
                    started_at: serverSession?.started_at || ""
                }
                break;
            case "full_stderr":
                userMessage = {type: "full_stderr", data: message.data}
                break;
            case "full_stdout":
                userMessage = {type: "full_stdout", data: message.data}
                break;
            case "stderr":
                userMessage = {type: "stderr", data: message.data}

                break;
            case "stdout":
                userMessage = {type: "stdout", data: message.data}
                break;
        }

        if (userMessage) {
            sendMessage(constructMessage(userMessage, server_id));
        }
    }

    ServerSessionHandler.serverEvent.on("message", handleServerMessage);

    ws.on("message", (data: string) => {
        const request = JSON.parse(data) as UserRequest;

        switch (request.type) {
            case "rcon":
                const rconPacket: ClientMessage = { type: "send_command", data: request.data };
                ServerSessionHandler.getServer(request.server_id)?.sendMessage(rconPacket);
                break;
            case "request_stdout":
                const server = ServerSessionHandler.getServer(request.server_id);
                if (!server) break;

                const stdoutPacketFull = constructMessage(
                    { type: "full_stdout", data: server.stdout.get() },
                    request.server_id
                );
                sendMessage(stdoutPacketFull);

                break;
            case "start_process":
                ServerSessionHandler.getServer(request.server_id)?.sendMessage({
                    type: "start_process",
                });
                break;
            case "status_request":
                ServerSessionHandler.getServer(request.server_id)?.getState();
                break;
            case "stop_process":
                ServerSessionHandler.getServer(request.server_id)?.sendMessage({
                    type: "stop_process",
                });
                break;
            case "server_status_all":
                {
                    console.log("Returning full list");
                    const values = new Array(...ServerSessionHandler.getServerList());

                    values.forEach(async (serv) => {
                        await serv.getState();

                        sendMessage(constructMessage({ 
                            type: "extended_status",
                            last_updated: serv.last_updated.toISOString(),
                            process_active: serv.process_active,
                            started_at: serv.started_at || "",
                            websocket_connected: serv.socket != undefined,
                            last_connected: ""
                        }, serv.id));
                    });
                }
                break;

            case "discover_servers":
                {
                    new Promise(async (resolve) => {
                        const values = await db.selectFrom("servers").select(["id", "name", "game_host", "game_port", "game_type"]).execute();

                        values.forEach(async (serv) => {
    
                            sendMessage(constructMessage({ 
                                type: "discover",
                                details: serv
                            }, serv.id));

                            const serverSess = ServerSessionHandler.getServer(serv.id);
                            if (serverSess) {
                                sendMessage(constructMessage({
                                    type: "full_stdout",
                                    data: serverSess.stdout.get()
                                }, serverSess.id));
                            }
                        });
                    })
                    console.log("Returning full list");
                    
                }
                break;
        }

        console.log(`${user} sent command ${JSON.stringify(request)}`);
    });

    ws.on("close", (code) => {
        console.log(`${user} disconnected from ${id} - ${code}`);
        ServerSessionHandler.serverEvent.off("message", handleServerMessage);
    });
});

router.use(requireAuth);

router.post("/", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400).json({ message: "Bad Request" });
        return;
    }
    try {
        const pw = await db
            .insertInto("auth")
            .values({ email: email, password: await argon2.hash(password) })
            .executeTakeFirst();
        res.status(200).json({ email: email });
        return;
    } catch (e) {
        console.log(e);
        res.status(400).json({ message: "Username in use" });
    }
});

router.get("/", async (req, res) => {
    res.status(200).json({});
});

export default router;
