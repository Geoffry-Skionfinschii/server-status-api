
import Router from "express";

import AuthRoute from "./auth";
import ServerRoute from "./server";
import UserRoute from "./user";

const router = Router();

router.use("/auth", AuthRoute);
router.use("/server", ServerRoute);
router.use("/user", UserRoute);



export default router;