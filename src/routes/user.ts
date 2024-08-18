import { Router } from "express";
import { db } from "../database";
import argon2 from "argon2";
import { requireAuth } from "../middleware/require_auth";
import { getTokenEmail } from "../auth_tokens";
import { ClientMessage, HostMessage, ServerSessionHandler } from "../servers";

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

type ExtendedUserResponse =
    | {
          type: "extended_status";
          process_active: boolean;
          started_at: string;
          last_updated: string;
          websocket_connected: boolean;
      }
    | {
        type: "discover",
        details: Server
    }
    | HostMessage;

type UserResponse = { server_id: number } & { message: ExtendedUserResponse };

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

    const constructMessage = (message: ExtendedUserResponse, server_id: number) =>
        ({ message, server_id } as UserResponse);

    const handleMessage: (arg: UserResponse) => void = ({ message, server_id }) => {
        console.log(`Sending to ${user} ${server_id}:${message.type}`);
        ws.send(JSON.stringify(constructMessage(message, server_id)));
    };

    ServerSessionHandler.serverEvent.on("message", handleMessage);

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
                handleMessage(stdoutPacketFull);

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

                        handleMessage(constructMessage({ 
                            type: "extended_status",
                            last_updated: serv.last_updated.toISOString(),
                            process_active: serv.process_active,
                            started_at: serv.started_at || "",
                            websocket_connected: serv.socket != undefined
                        }, serv.id));
                    });
                }
                break;

            case "discover_servers":
                {
                    new Promise(async (resolve) => {
                        const values = await db.selectFrom("servers").select(["id", "name", "game_host", "game_port", "game_type"]).execute();

                        values.forEach(async (serv) => {
    
                            handleMessage(constructMessage({ 
                                type: "discover",
                                details: serv
                            }, serv.id));

                            const serverSess = ServerSessionHandler.getServer(serv.id);
                            if (serverSess) {
                                handleMessage(constructMessage({
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
        ServerSessionHandler.serverEvent.off("message", handleMessage);
    });
});

router.use(requireAuth);

router.post("/user", async (req, res) => {
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

router.get("/user", async (req, res) => {
    res.status(200).json({});
});

export default router;
