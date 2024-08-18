
import { Router } from "express";
import { requireAuth } from "../middleware/require_auth";
import { ServerSessionHandler } from "../servers";
import { db } from "../database";
import { randomUUID } from "crypto";
import { GameDig } from "gamedig";
import { z } from "zod";

const gamedig = new GameDig();


const router = Router();

router.ws("/:token", async (ws, req) => {
    const token = req.params.token;

    const server = await db.selectFrom("servers").selectAll().where("token", "=", token).executeTakeFirst();
    if (!server) {
        ws.close();
        console.log(`Rejected connection from ${JSON.stringify(req.socket.address())}`);
        return;
    }

    console.log(`Server ${server.id} has connected ${server.name}`);

    let serverSession = ServerSessionHandler.getServer(server.id);
    if (!serverSession) {
        serverSession = ServerSessionHandler.createServer(server.id);
    }

    serverSession.websocketConnected(ws);
});


router.use(requireAuth);


router.get("/", async (req, res) => {
    const servers = await db.selectFrom("servers").selectAll().execute();

    return res.status(200).json(servers);
});

router.get("/:id", async (req, res) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", +req.params.id).executeTakeFirst();
    if (!server) {
        return res.status(404).json({});
    }

    const localServer = ServerSessionHandler.getServer(server.id);

    if (!localServer) {
        return res.status(404).json({message: "not found"});
    }

    const state = await localServer.getState();
    if (!state) {
        return res.status(200).json({
            details: server,
            state: undefined
        });
    }

    return res.status(200).json({
        details: server,
        state: state
    });
});

router.get("/:id/gamedig", async (req, res) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", +req.params.id).executeTakeFirst();

    if (!server) {
        return res.status(404).json({});
    }

    if (!server.game_host || !server.game_type) {
        return res.status(401).json({message: "Host or GameType not set", server});
    }

    try {

        const game = await gamedig.query({
            type: server.game_type,
            host: server.game_host,
            port: server.game_port
        });
        

        return res.status(200).json(game);
    } catch (e) {
        console.log(e);
        return res.status(400).json({message: "Server is unreachable"});
    }
});

router.post("/:id/start", async (req, res) => {
    const server = ServerSessionHandler.getServer(+req.params.id);

    if (!server) {
        return res.status(404).json({});
    }

    server.startServer();

    return res.status(200).json({});
});

router.post("/:id/stop", async (req, res) => {
    const server = ServerSessionHandler.getServer(+req.params.id);

    if (!server) {
        return res.status(404).json({});
    }

    server.stopServer();

    return res.status(200).json({});
});

router.post("/add", async (req, res) => {
    try {
        const json = req.body;

        const validated = z.object({
            name: z.string(),
            game_type: z.string(),
            game_host: z.string(),
            game_port: z.number().int().optional()
        });

        const newServer = validated.safeParse(json);

        if (!newServer.success) {
            return res.status(400).json(newServer.error.flatten());
        }

        const uuid = randomUUID();

        const newId = await db.insertInto("servers").values({
            name: newServer.data.name,
            token: uuid,
            game_host: newServer.data.game_host,
            game_type: newServer.data.game_type,
            game_port: newServer.data.game_port
        }).returning('id as id').executeTakeFirst();

        return res.status(200).json(newId);
    } catch (e) {
        console.error(e);
        return res.status(500).json({});
    }
});

router.put("/:id", async (req, res) => {
    try {
        const json = req.body;

        const validated = z.object({
            name: z.string(),
            game_type: z.string(),
            game_host: z.string(),
            game_port: z.number().int().optional()
        });

        console.log(json);

        const newServer = validated.safeParse(json);

        if (!newServer.success) {
            return res.status(400).json(newServer.error.flatten());
        }

        const newId = await db.updateTable("servers").set({
            name: newServer.data.name,
            game_host: newServer.data.game_host,
            game_type: newServer.data.game_type,
            game_port: newServer.data.game_port
        }).where("id", "=", +req.params.id).executeTakeFirst();

        return res.status(200).json({});
    } catch (e) {
        console.error(e);
        return res.status(500).json({});
    }
})

export default router;