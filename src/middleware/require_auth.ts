

import { NextFunction, Request, Response } from "express";
import { getTokenEmail } from "../auth_tokens";


export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization) {
        const bearer = req.headers.authorization.split(" ");

        const token = bearer[1];

        // const user = await db.selectFrom("auth").selectAll().where("token", "=", token).executeTakeFirst();
        const user = getTokenEmail(token);

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
};