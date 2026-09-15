import { config } from "dotenv";
config({ path: ".env.local", override: true });

async function main() {
  const { eseguiMotoreMail, primaEsecuzione } = await import("../lib/motore-mail");
  const { prisma } = await import("../lib/prisma");

  console.log("primaEsecuzione():", await primaEsecuzione());

  const attiPrima = await prisma.attoPoliticoAmministrativo.count();
  const giustifichePrima = await prisma.giustifica.count();

  const risultato = await eseguiMotoreMail(1, 15); // 1 sola pagina di discovery, per non riscansionare tutto
  console.log(JSON.stringify(risultato, null, 2));

  const attiDopo = await prisma.attoPoliticoAmministrativo.count();
  const giustificheDopo = await prisma.giustifica.count();
  console.log(`Atti: ${attiPrima} -> ${attiDopo} | Giustifiche: ${giustifichePrima} -> ${giustificheDopo}`);

  const automaticoInAttesa = await prisma.mailProcessata.count({ where: { binario: "AUTOMATICO", esito: "IN_ATTESA" } });
  const automaticoCompletato = await prisma.mailProcessata.count({ where: { binario: "AUTOMATICO", esito: "COMPLETATO" } });
  console.log(`MailProcessata AUTOMATICO: ${automaticoInAttesa} in attesa, ${automaticoCompletato} completate`);

  await prisma.$disconnect();
}
main().catch(console.error);
