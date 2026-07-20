// Script di test: chiama checkBandi() direttamente senza passare dall'endpoint HTTP
// Eseguire con: npx tsx scripts/test-bandi.ts
import "dotenv/config";
import { checkBandi } from "../lib/bandi";

async function main() {
  console.log("🔍 Avvio check bandi...\n");
  const start = Date.now();
  const { nuovi, errori } = await checkBandi();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n✅ Completato in ${elapsed}s`);
  console.log(`📦 Nuovi bandi trovati: ${nuovi}`);
  if (errori.length > 0) {
    console.log(`⚠️  Errori (${errori.length}):`);
    errori.forEach(e => console.log(`   - ${e}`));
  } else {
    console.log("✓  Nessun errore");
  }
}

main().catch(e => {
  console.error("❌ Errore:", e);
  process.exit(1);
});
