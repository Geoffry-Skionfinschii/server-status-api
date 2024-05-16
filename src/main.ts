

import express from 'express';
import expressws from 'express-ws';
const app = expressws(express()).app;
import { db } from "./database";
import { GameDig } from 'gamedig';
import { getServer, getState, parseMessage, sendMessage, setWebsocket, waitForMessage } from './servers';
import cors from 'cors';

const gamedig = new GameDig();

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

app.use(async (req, res, next) => {
    if (req.headers.authorization) {
        const bearer = req.headers.authorization.split(" ");

        const token = bearer[1];

        const user = await db.selectFrom("auth").selectAll().where("token", "=", token).executeTakeFirst();

        if (!user) {
            res.status(401).json({});
            return;
        }

        console.log(`Request ${user.email} ${req.path}`);

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


app.listen(port, async () => {
    console.log(`Express server on ${port}`);
})