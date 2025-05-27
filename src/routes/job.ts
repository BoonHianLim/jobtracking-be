import Express from "express";
import jobController from "../controllers/job";

const router = Express.Router();

router.get("/", jobController.getJobs);

export { router as default };
