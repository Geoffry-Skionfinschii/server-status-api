
import Router from "express";
import { db } from "../database";
import { randomUUID } from "crypto";
import argon2 from 'argon2';
import { authenticateToken } from "../auth_tokens";


const router = Router();

router.post("/", async (req, res) => {
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

        authenticateToken(newUUID, pw.email);
        res.status(200).json({token: newUUID});
        return;
    }

    res.status(401).json({message: "Incorrect username or password"});
    return;
});


export default router;