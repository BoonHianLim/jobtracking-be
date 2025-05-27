import express, { Express, Request, Response } from "express";
import session from "express-session";


import jobRouter from "./src/routes/job";
import authRouter from "./src/routes/auth";
import { initDB } from "./src/utils/initDB";
import { initEnv } from "./src/utils/initEnv";
declare module "express-session" {
  export interface SessionData {
    state: string;
  }
}
initEnv();
initDB();

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(function (req, res, next) {
  // TODO: change when deploying to production
  res.header("Access-Control-Allow-Origin", "*"); // TODO: configure properly before deployment
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

app.use(
  session({
    secret: "keyboard cat",
    cookie: { maxAge: 60000 },
    resave: true,
    saveUninitialized: true,
  })
);

app.use("/jobs", jobRouter);

app.use("/auth", authRouter);
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});


