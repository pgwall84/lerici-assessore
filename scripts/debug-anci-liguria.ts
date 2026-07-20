import * as cheerio from "cheerio";

async function main() {
  const res = await fetch("https://www.anciliguria.it/bandi", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  // Per ogni "VEDI DETTAGLIO" link, mostra i 3 livelli di parent e loro testo
  $("a[href*='/bandi/']").each((i, el) => {
    if (i >= 3) return;
    const href = $(el).attr("href") ?? "";
    console.log(`\n=== LINK ${i+1}: ${href} ===`);
    let parent = $(el).parent();
    for (let lvl = 0; lvl < 5; lvl++) {
      const tag = parent.prop("tagName") ?? "?";
      const cls = parent.attr("class") ?? "";
      const txt = parent.text().replace(/\s+/g, " ").trim().slice(0, 150);
      console.log(`  L${lvl} <${tag} class="${cls}">: ${txt}`);
      parent = parent.parent();
    }
  });

  // Prova il testo del body dopo aver rimosso navigation/header/footer
  $("header, footer, nav, script, style").remove();
  const bodyLines = $("body").text().split(/\n/).map(l => l.trim()).filter(l => l.length > 5);
  console.log("\n--- PRIME 40 RIGHE DI TESTO BODY ---");
  bodyLines.slice(0, 40).forEach((l, i) => console.log(`${i}: ${l}`));
}
main().catch(console.error);
