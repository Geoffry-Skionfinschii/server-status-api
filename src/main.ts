

import express from 'express';
import expressws from 'express-ws';
const app = expressws(express()).app;
import { db } from "./database";
import { GameDig } from 'gamedig';
import { getServer, getState, parseMessage, sendMessage, setWebsocket, waitForMessage } from './servers';
import cors from 'cors';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import argon2 from 'argon2';

const gamedig = new GameDig();

const USER_AUTH_TOKENS = new Map<string, string>();

const port = 3000;
app.use(express.json());

app.use(cors());

app.ws("/server/:token", async (ws, req) => {
    const token = req.params.token;

    const server = await db.selectFrom("servers").selectAll().where("token", "=", token).executeTakeFirst();
    if (!server) {
        ws.close();
        // console.log(`Rejected connection from ${JSON.stringify(req.socket.address())}`);
        return;
    }

    console.log(`Server ${server.id} has connected ${server.name}`);

    setWebsocket(server.id, ws);

    ws.on("message", (data: string) => {
        console.log(`${token} sent ${data}`);
        parseMessage(server.id, JSON.parse(data));
    });

    ws.on("close", (code) => {
        console.log(`${server.id} ${server.name} disconnected - ${code}`);
        setWebsocket(server.id, undefined);
    });
});

app.post("/auth", async (req, res) => {
    const {email, password} = req.body;

    if (!email || !password) {
        res.status(400).json({message: "Bad Request"});
        return;
    }

    const pw = await db.selectFrom("auth").selectAll().where("auth.email", "=", email).executeTakeFirst();
    if (!pw) {
        res.status(401).json({message: "Incorrect username or password"});
        return;
    }

    if (await argon2.verify(pw.password, password)) {
        const newUUID = randomUUID();

        USER_AUTH_TOKENS.set(newUUID, pw.email);
        res.status(200).json({token: newUUID});
        return;
    }

    res.status(401).json({message: "Incorrect username or password"});
    return;
});

app.use(async (req, res, next) => {
    if (req.headers.authorization) {
        const bearer = req.headers.authorization.split(" ");

        const token = bearer[1];

        // const user = await db.selectFrom("auth").selectAll().where("token", "=", token).executeTakeFirst();
        const user = USER_AUTH_TOKENS.get(token);

        if (!user) {
            res.status(401).json({});
            return;
        }

        console.log(`Request ${user} ${req.path}`);

        next();
    } else {

        res.status(401).json({});
        return;
    }
});


app.get("/server", async (req, res) => {
    const servers = await db.selectFrom("servers").selectAll().execute();

    return res.status(200).json(servers);
});

app.get("/server/:id", async (req, res) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", +req.params.id).executeTakeFirst();
    if (!server) {
        return res.status(404).json({});
    }

    const localServer = getServer(+req.params.id);

    sendMessage(+req.params.id, {type: "status_request"});

    const message = await waitForMessage("status", +req.params.id);

    return res.status(200).json({
        details: server,
        state: getState(+req.params.id),
    });
});

app.get("/server/:id/status", async (req, res) => {
    const server = getServer(+req.params.id);

    if (!server) {
        return res.status(404).json({});
    }

    sendMessage(+req.params.id, {type: "status_request"});

    const message = await waitForMessage("status", +req.params.id);

    return res.status(200).json(message);
})

app.get("/server/:id/gamedig", async (req, res) => {
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

app.post("/server/:id/start", async (req, res) => {
    const server = getServer(+req.params.id);

    if (!server) {
        return res.status(404).json({});
    }

    sendMessage(+req.params.id, {type: "start_process"});

    const message = await waitForMessage("status", +req.params.id);

    return res.status(200).json(message);
});

app.post("/server/:id/stop", async (req, res) => {
    const server = getServer(+req.params.id);

    if (!server) {
        return res.status(404).json({});
    }

    sendMessage(+req.params.id, {type: "stop_process"});

    const message = await waitForMessage("status", +req.params.id);

    return res.status(200).json(message);
});

app.post("/server/add", async (req, res) => {
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

app.put("/server/:id", async (req, res) => {
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


app.listen(port, async () => {
    console.log(`Express server on ${port}`);
})