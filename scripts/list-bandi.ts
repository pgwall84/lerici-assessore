import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const bandi = await prisma.bando.findMany({
    select: { titolo: true, ente: true, bandoUrl: true, descrizione: true, beneficiari: true },
    orderBy: [{ ente: "asc" }, { titolo: "asc" }],
  });
  for (const b of bandi) {
    console.log(`[${b.ente}] ${b.titolo.slice(0, 65)}`);
    if (b.beneficiari) console.log(`  ben: ${b.beneficiari.slice(0, 100)}`);
    if (b.descrizione) console.log(`  desc: ${b.descrizione.slice(0, 100)}`);
  }
  console.log(`\nTotale: ${bandi.length}`);
  await prisma.$disconnect();
}
main().catch(console.error);
