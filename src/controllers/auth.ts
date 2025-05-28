import crypto from "crypto";
import url from "url";

import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Request, Response } from "express";
import { setNewUser } from "../cron/mail";

let oauth2Client: OAuth2Client | undefined;
const initClient = () => {
  oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.SERVER_URL + "/auth/callback"
  );
};
const getClient = (): OAuth2Client => {
  if (!oauth2Client) {
    initClient();
  }
  if (!oauth2Client) {
    throw new Error("OAuth2 client initialized failed");
  }
  return oauth2Client;
};
const oauth = async (req: Request, res: Response) => {
  const client = getClient();

  const scopes = ["https://www.googleapis.com/auth/gmail.readonly"];

  const state = crypto.randomBytes(16).toString("hex");

  req.session.state = state;
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: state,
    prompt: "consent",
  });
  res.redirect(authUrl);
};

const oauthCallback = async (req: Request, res: Response) => {
  const query = url.parse(req.url, true).query;

  if (query.error) {
    console.error("OAuth error:", query.error);
    res.status(400).json({ error: "OAuth error" });
  } else if (query.state !== req.session.state) {
    console.error("State mismatch:", query.state, req.session.state);
    res.status(400).json({ error: "State mismatch" });
  } else {
    const client = getClient();
    try {
      const { tokens } = await client.getToken(query.code as string);
      client.setCredentials(tokens);
      setNewUser({
        credential: client.credentials,
        lastUpdatedAt: new Date(),
      });
      res.status(200).json({ message: "Authentication successful" });
    } catch (error) {
      let errMessage = "Internal Server Error";
      if (error instanceof Error) {
        errMessage = error.message;
      }
      console.error("Error getting tokens:", errMessage);
      res.status(500).json({ error: errMessage });
    }
  }
};

const authController = {
  oauth,
  oauthCallback,
};

export default authController;
