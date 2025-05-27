import express, { Express, Request, Response } from "express";
import jobRouter from "./src/routes/job";

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(function (req, res, next) {
  // TODO: change when deploying to production
  res.header("Access-Control-Allow-Origin", "*"); // TODO: configure properly before deployment
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

app.use("/jobs", jobRouter);
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
