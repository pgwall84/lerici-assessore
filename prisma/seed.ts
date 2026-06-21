import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  // Utente Marco
  const hash = await bcrypt.hash("Lerici2026!", 12);
  await prisma.utente.upsert({
    where: { email: "marco.muro@comune.lerici.sp.it" },
    update: {},
    create: {
      nome: "Marco Muro",
      email: "marco.muro@comune.lerici.sp.it",
      passwordHash: hash,
    },
  });

  // Rubrica persone pre-caricate
  const persone = [
    { nome: "Marco", cognome: "Russo", ruolo: "Sindaco", telefono: "3493522675" },
    { nome: "Nicola", cognome: "Di Matteo", ruolo: "Capo Settore Lavori Pubblici", telefono: "3342196151" },
    { nome: "Ilaria", cognome: "Bernazzani", ruolo: "Capo Settore Ambiente", telefono: "3470143931" },
    { nome: "Massimo", cognome: "Cremona", ruolo: "Comandante Vigili Urbani", telefono: "3290398332" },
    { nome: "Tintori", cognome: "MARIS", ruolo: "Gestore Rifiuti MARIS", telefono: "3394141646" },
  ];

  for (const p of persone) {
    await prisma.persona.upsert({
      where: { id: (await prisma.persona.findFirst({ where: { nome: p.nome, cognome: p.cognome } }))?.id ?? 0 },
      update: {},
      create: p,
    });
  }

  console.log("✓ Seed completato — utente: marco.muro@comune.lerici.sp.it / Lerici2026!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
