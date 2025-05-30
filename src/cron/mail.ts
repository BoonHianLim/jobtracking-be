import cron from "node-cron";
import { google } from "googleapis";
import { Credentials } from "google-auth-library";
import { getClient } from "../utils/initDB";
import * as cheerio from "cheerio";
import * as fs from "fs";
import querystring from "querystring";

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
export const setNewUser = async (user: User) => {
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
  cron.schedule("10 * * * * *", async () => {
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
      maxResults: 10,
      // q: "after:" + Math.floor(Number(currentUser.lastUpdatedAt) / 1000),
      q: "from:jobs-noreply@linkedin.com",
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
          const sender = emailDetails.data.payload?.headers?.find(
            (header) => header.name === "From"
          )?.value;
          const subject =
            emailDetails.data.payload?.headers?.find(
              (header) => header.name === "Subject"
            )?.value ?? undefined;
          const senderEmail = ((
            sender: string | null | undefined
          ): string | undefined => {
            if (!sender) {
              return undefined;
            }
            const start = sender.indexOf("<");
            const end = sender.indexOf(">");
            if (start !== -1 && end !== -1 && end > start) {
              return sender
                .substring(start + 1, end)
                .trim()
                .toLowerCase();
            }
            return undefined;
          })(sender);
          const messageParts = emailDetails.data.payload?.parts;
          if (!messageParts) {
            console.warn("No message parts found in email:", emailDetails.data);
            return;
          }
          const htmlMessagePart = messageParts.find((messagePart) => {
            return messagePart.mimeType == "text/html";
          });
          if (!htmlMessagePart) {
            console.warn(
              "No HTML message part found in email:",
              emailDetails.data
            );
            return;
          }
          const encodedBody = htmlMessagePart.body?.data;
          if (!encodedBody) {
            console.warn(
              "No encoded body found in email part:",
              htmlMessagePart
            );
            return;
          }
          const decodedBody = Buffer.from(encodedBody, "base64").toString(
            "utf-8"
          );
          matching(senderEmail, subject, decodedBody);
        })
        .catch((err) => {
          console.error("Error fetching email details:", err);
        });
    }
  });
};

const matching = (
  sender: string | undefined,
  subject: string | undefined,
  emailContent: string
) => {
  if (!sender) {
    // TODO: pass to LLM to extract information / other rule-based logic
    return;
  }
  if (sender == "jobs-noreply@linkedin.com") {
    const linkedInContent = cheerio.load(emailContent);
    const elements = linkedInContent(
      'a[href^="https://www.linkedin.com/comm/jobs/view/"]'
    );
    if (elements.length === 0) {
      console.warn("No LinkedIn job links found in email content");
      return;
    }
    const firstElement = elements.first();
    const attachedLink = firstElement.attr("href");
    if (!attachedLink) {
      console.warn("No href attribute found in the first LinkedIn job link");
      return;
    }
    const parseQueries = querystring.parse(attachedLink.split("?")[1]);
    const lipi = parseQueries["lipi"];
    if (!lipi) {
      console.warn("No lipi query parameter found in the LinkedIn job link");
      return;
    }
    if (typeof lipi !== "string") {
      console.warn("Lipi query parameter is not a string:", lipi);
      return;
    }
    if (lipi.includes("rejected")) {
      const extractedSubjects = ((
        subject: string | undefined
      ):
        | {
            company: string;
            jobTitle: string;
          }
        | undefined => {
        if (!subject) {
          return undefined;
        }
        const start = subject.indexOf("Your application to ");
        const end = subject.indexOf(" at ");
        if (start !== -1 && end !== -1 && end > start) {
          return {
            jobTitle: subject
              .substring(start + "Your application to".length, end)
              .trim(),
            company: subject.substring(end + " at ".length).trim(),
          };
        }
        return undefined;
      })(subject);
      console.log(
        "Job application rejected for company:",
        extractedSubjects?.company,
        "and job title:",
        extractedSubjects?.jobTitle
      );
    } else if (lipi.includes("confirmation")) {
      console.log("Job applied, lipi:", lipi);
    }
  }
};
