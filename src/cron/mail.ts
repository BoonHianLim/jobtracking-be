import cron from "node-cron";
import { google } from "googleapis";
import { Credentials } from "google-auth-library";
import { getClient } from "../utils/initDB";

interface User {
  credential: Credentials;
  lastUpdatedAt: Date;
}
let currentUser: User | undefined;
export const initCredential = async () => {
  const prisma = getClient();
  const user = await prisma.user.findUnique({
    where: {
      id: 1,
    },
  });
  if (user) {
    if (!user.refreshToken || !user.accessToken) {
      console.warn("User credentials are incomplete, skipping initialization");
      return;
    }
    currentUser = {
      credential: {
        refresh_token: user.refreshToken,
        expiry_date: Number(user.expiryDate),
        access_token: user.accessToken,
        token_type: user.tokenType,
        id_token: user.idToken,
        scope: user.scope,
      },
      lastUpdatedAt: new Date(user.lastRefreshAt),
    };
    console.log("Credential initialized:", currentUser);
  } else {
    console.warn("No credential found, skipping initialization");
  }
};
export const setNewUser = async (user: User | undefined) => {
  if (!user) {
    user = undefined;
    return;
  }
  if (!user.credential.access_token) {
    console.warn("Invalid credential received, no access token present");
    return;
  }
  const prisma = getClient();
  await prisma.user.upsert({
    where: {
      id: 1,
    },
    update: {
      refreshToken: user.credential?.refresh_token || "",
      expiryDate: user.credential?.expiry_date || 0,
      accessToken: user.credential?.access_token || "",
      tokenType: user.credential?.token_type || "",
      idToken: user.credential?.id_token || "",
      scope: user.credential?.scope || "",
    },
    create: {
      id: 1,
      refreshToken: user.credential?.refresh_token || "",
      expiryDate: user.credential?.expiry_date || 0,
      accessToken: user.credential?.access_token || "",
      tokenType: user.credential?.token_type || "",
      idToken: user.credential?.id_token || "",
      scope: user.credential?.scope || "",
      lastRefreshAt: user.lastUpdatedAt,
    },
  });
  currentUser = user;
};
export const setNewLastRefreshAt = async (date: Date) => {
  if (!currentUser) {
    console.warn("No current user to update lastUpdatedAt");
    return;
  }

  const prisma = getClient();
  await prisma.user.update({
    where: {
      id: 1,
    },
    data: {
      lastRefreshAt: date,
    },
  });
  currentUser.lastUpdatedAt = date;
  console.log("Updated lastUpdatedAt to:", date);
};

export const startCron = () => {
  console.log("Starting cron job to fetch emails every minute...");
  cron.schedule("* * * * *", async () => {
    if (!currentUser) {
      console.warn("No credential available, skipping cron job");
      return;
    }
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.SERVER_URL + "/auth/callback"
    );
    console.log("Running cron job to fetch emails...");

    console.log("Current credentials:", currentUser);
    if (!currentUser.credential.access_token) {
      console.warn("Skipping invalid credential:", currentUser.credential);
      return;
    }

    oauth2Client.setCredentials(currentUser.credential);
    const hasExpired =
      oauth2Client.credentials.expiry_date &&
      oauth2Client.credentials.expiry_date < Date.now();

    if (hasExpired) {
      console.warn("Credential has expired, refreshing...");
      const refreshAccessTokenResp = await oauth2Client.refreshAccessToken();
      const tokens = refreshAccessTokenResp.credentials;
      if (!tokens || !tokens.access_token) {
        console.error("No tokens received after refresh");
        return;
      }
      oauth2Client.setCredentials(tokens);
      if (!tokens.refresh_token) {
        console.warn(
          "No refresh token received, setting it to current credentials"
        );
        tokens.refresh_token = oauth2Client.credentials.refresh_token;
      }

      setNewUser({
        credential: tokens,
        lastUpdatedAt: currentUser.lastUpdatedAt,
      });
      console.log("Refreshed credentials:", tokens);
    }
    // Here you can add logic to use the oauth2Client, e.g., making API calls
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const newLastUpdatedAt = new Date();
    const emailList = await gmail.users.messages.list({
      userId: "me",
      maxResults: 2,
      q: "after:" + Math.floor(Number(currentUser.lastUpdatedAt) / 1000),
      labelIds: ["INBOX"],
    });
    await setNewLastRefreshAt(newLastUpdatedAt);
    console.log("Fetched emails:", emailList.data.messages?.length || 0);
    for (const email of emailList.data.messages || []) {
      if (!email.id) {
        console.warn("Skipping email with no ID:", email);
        continue;
      }
      gmail.users.messages
        .get({
          userId: "me",
          id: email.id,
        })
        .then((emailDetails) => {
          console.log(JSON.stringify(emailDetails.data, null, 2));
        })
        .catch((err) => {
          console.error("Error fetching email details:", err);
        });
    }
  });
};
