import fs from "fs";

export const initEnv = () => {
  const credentials = JSON.parse(
    fs.readFileSync("./credentials.json", "utf-8")
  );
  process.env.GOOGLE_CLIENT_ID = credentials.web.client_id;
  process.env.GOOGLE_CLIENT_SECRET = credentials.web.client_secret;
  console.log("Environment variables initialized from credentials.json");
};
