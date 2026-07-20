import "dotenv/config";
import { prisma } from "../lib/prisma";
import { isBandoRilevante } from "../lib/bandi/filtro-territoriale";

async function main() {
  const tutti = await prisma.bando.findMany();
  const daEliminare: string[] = [];

  for (const b of tutti) {
    const motivi: string[] = [];

    if (b.ente === "Regione Liguria") motivi.push("fonte rimossa");
    if (b.titolo === "VEDI DETTAGLIO") motivi.push("titolo rotto");
    if (b.dataChiusura && b.dataChiusura < new Date()) motivi.push("scaduto");

    // UPEL senza metadati: descrizione e beneficiari vuoti → non filtrabili, ri-fetcha
    if (b.ente === "UPEL" && !b.descrizione && !b.beneficiari) {
      motivi.push("UPEL senza metadati (ri-fetch)");
    }

    if (!isBandoRilevante({
      titolo: b.titolo, ente: b.ente, fonteUrl: b.fonteUrl,
      bandoUrl: b.bandoUrl ?? undefined,
      descrizione: b.descrizione ?? undefined,
      beneficiari: b.beneficiari ?? undefined,
    })) {
      motivi.push("altra regione");
    }

    if (motivi.length > 0) {
      console.log(`❌ [${b.ente}] ${b.titolo.slice(0, 60)} → ${motivi.join(", ")}`);
      daEliminare.push(b.id);
    }
  }

  if (daEliminare.length === 0) {
    console.log("Nessun bando da eliminare.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nEliminando ${daEliminare.length} bandi...`);
  await prisma.bando.deleteMany({ where: { id: { in: daEliminare } } });
  console.log(`✅ Rimasti: ${tutti.length - daEliminare.length} bandi`);
  await prisma.$disconnect();
}
main().catch(console.error);
