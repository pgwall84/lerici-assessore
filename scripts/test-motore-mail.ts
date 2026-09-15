import { config } from "dotenv";
config({ path: ".env.local", override: true });

async function main() {
  const { scansionaMail } = await import("../lib/motore-mail");
  const { prisma } = await import("../lib/prisma");
  const pageToken = process.argv[2];
  const risultato = await scansionaMail(pageToken, 15);
  console.log(JSON.stringify(risultato, null, 2));

  const righe = await prisma.mailProcessata.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  for (const r of righe) {
    console.log(`[${r.binario}] ${r.categoriaProposta ?? "—"} (conf ${r.confidenza ?? "n/d"}) — ${r.oggetto?.slice(0, 70)}`);
  }
  await prisma.$disconnect();
}
main().catch(console.error);
