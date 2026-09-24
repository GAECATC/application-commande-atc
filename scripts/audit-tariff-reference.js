// Lecture seule : compare les grilles en base aux tableurs de référence.
const { loadEnvConfig } = require("@next/env");
const reference = require("../data/tariff-reference.json");
const { matchTariffRows, normalizeTariffName } = require("../lib/tariff-matching");

loadEnvConfig(process.cwd());
const db = require("../lib/db");

async function main() {
  const lists = await db.getPriceLists();
  for (const [name, sourceRows] of Object.entries(reference)) {
    const list = lists.find((item) => normalizeTariffName(item.name) === normalizeTariffName(name))
      || lists.find((item) => name === "Mercuriale 2026" && normalizeTariffName(item.name).startsWith(normalizeTariffName(name)));
    if (!list) { console.log(`${name}: grille introuvable`); continue; }
    const products = await db.getProducts({ includeHidden: true, priceListId: list.id });
    const matches = matchTariffRows(sourceRows, products);
    const missing = [];
    const ambiguous = [];
    const different = [];
    const matchedIds = new Set();
    for (const { row, candidates } of matches) {
      if (candidates.length !== 1) {
        ambiguous.push(`${row.name} (${row.unit || "unité non précisée"}) : ${candidates.length} correspondance(s)`);
        continue;
      }
      const product = candidates[0];
      matchedIds.add(product.id);
      if (product.listed === false) missing.push(`${product.name} : ancien prix ${product.price || 0} €, tableur ${row.price} €`);
      else if (Math.abs(Number(product.price) - row.price) > 0.0001) {
        different.push(`${product.name} : actuel ${product.price} €, tableur ${row.price} €`);
      }
    }
    const manual = products.filter((product) => product.listed !== false && !matchedIds.has(product.id));
    console.log(`\n${name} : ${matches.length} références distinctes dans le tableur, ${products.filter((p) => p.listed !== false).length} dans l'application.`);
    for (const [label, rows] of [
      ["Absentes de la grille (à examiner, aucun changement automatique)", missing],
      ["Prix différents (tarifs manuels conservés)", different],
      ["Correspondances incertaines (à examiner)", ambiguous],
      ["Références présentes seulement dans l'application (conservées)", manual.map((p) => `${p.name} : ${p.price} €`)]
    ]) {
      console.log(`${label} : ${rows.length}`);
      for (const row of rows) console.log(`  - ${row}`);
    }
  }
}

main().catch((error) => { console.error(`Audit impossible : ${error.message}`); process.exitCode = 1; });
