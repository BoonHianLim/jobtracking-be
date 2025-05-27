import Express from "express";
import authController from "../controllers/auth";

const router = Express.Router();

router.get("/", authController.oauth);
router.get("/callback", authController.oauthCallback);

export { router as default };
