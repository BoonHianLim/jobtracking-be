import cron from "node-cron";
import { google } from "googleapis";
import { Credentials } from "google-auth-library";
import { oauth2 } from "googleapis/build/src/apis/oauth2";

let credential: Credentials | undefined;

export const addCredential = (cred: Credentials | undefined) => {
  if (cred && !cred.access_token) {
    console.warn("Invalid credential received, no access token present");
    return;
  }
  credential = cred;
};

cron.schedule("* * * * *", () => {
  if (!credential) {
    console.warn("No credential available, skipping cron job");
    return;
  }
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.SERVER_URL + "/auth/callback"
  );
  console.log("Running cron job to fetch emails...");

  console.log("Current credentials:", credential);
  if (!credential.access_token) {
    console.warn("Skipping invalid credential:", credential);
    return;
  }

  oauth2Client.setCredentials(credential);
  const hasExpired =
    oauth2Client.credentials.expiry_date &&
    oauth2Client.credentials.expiry_date < Date.now();
  if (hasExpired) {
    console.warn("Credential has expired, refreshing...");
    oauth2Client.refreshAccessToken((err, tokens) => {
      if (err) {
        console.error("Error refreshing access token:", err);
        return;
      }
      if (!tokens || !tokens.access_token) {
        console.error("No tokens received after refresh");
        addCredential(undefined);
        return;
      }
      oauth2Client.setCredentials(tokens);
      addCredential(tokens);
      console.log("Refreshed credentials:", tokens);
    });
  }
  // Here you can add logic to use the oauth2Client, e.g., making API calls
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  gmail.users.messages
    .list({
      userId: "me",
      maxResults: 2,
    })
    .then((emailList) => {
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
});
