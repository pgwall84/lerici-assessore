import { createServer } from "http";
import { readFileSync, writeFileSync } from "fs";
import { google } from "googleapis";
import "dotenv/config";

function aggiornaEnv(path: string, token: string) {
  const contenuto = readFileSync(path, "utf-8");
  const riga = `GOOGLE_REFRESH_TOKEN="${token}"`;
  const aggiornato = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(contenuto)
    ? contenuto.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, riga)
    : contenuto.trimEnd() + "\n" + riga + "\n";
  writeFileSync(path, aggiornato);
}

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:3002"
);

const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.modify",
  ],
});

console.log("\n✓ Apri questo URL nel browser per autorizzare Google Calendar + Gmail:\n");
console.log(url);
console.log("\nDopo l'autorizzazione sarai reindirizzato — il token verrà stampato qui.\n");

// Server temporaneo che cattura il codice di autorizzazione
const server = createServer(async (req, res) => {
  const code = new URL(req.url ?? "", "http://localhost:3002").searchParams.get("code");
  if (!code) { res.end("Nessun codice ricevuto."); return; }

  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      res.end("<h2>⚠ Nessun refresh_token ricevuto (probabilmente hai già un consenso attivo). Revoca l'accesso su myaccount.google.com/permissions e riprova.</h2>");
      console.log("\n⚠ Google non ha restituito un refresh_token. Vai su https://myaccount.google.com/permissions, revoca l'accesso all'app, poi rilancia questo script.\n");
      server.close();
      return;
    }
    aggiornaEnv(".env.local", tokens.refresh_token);
    aggiornaEnv(".env.production", tokens.refresh_token);
    res.end("<h2>✓ Autorizzazione completata e .env aggiornati! Puoi chiudere questa finestra.</h2>");
    console.log("\n✓ GOOGLE_REFRESH_TOKEN aggiornato automaticamente in .env.local e .env.production.\n");
  } catch (e) {
    res.end("Errore durante il recupero del token.");
    console.error(e);
  } finally {
    server.close();
  }
});

server.listen(3002, () => {});
