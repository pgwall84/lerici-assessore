import { createServer } from "http";
import { google } from "googleapis";
import "dotenv/config";

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://127.0.0.1:3002"
);

const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/calendar"],
});

console.log("\n✓ Apri questo URL nel browser per autorizzare Google Calendar:\n");
console.log(url);
console.log("\nDopo l'autorizzazione sarai reindirizzato — il token verrà stampato qui.\n");

// Server temporaneo che cattura il codice di autorizzazione
const server = createServer(async (req, res) => {
  const code = new URL(req.url ?? "", "http://127.0.0.1:3002").searchParams.get("code");
  if (!code) { res.end("Nessun codice ricevuto."); return; }

  try {
    const { tokens } = await oauth2.getToken(code);
    res.end("<h2>✓ Autorizzazione completata! Puoi chiudere questa finestra.</h2>");
    console.log("\n✓ REFRESH TOKEN OTTENUTO:");
    console.log(`\nGOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"\n`);
    console.log("Copia questo valore nel tuo .env e poi riavvia il server.\n");
  } catch (e) {
    res.end("Errore durante il recupero del token.");
    console.error(e);
  } finally {
    server.close();
  }
});

server.listen(3002, () => {});
