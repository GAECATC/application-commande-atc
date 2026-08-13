const path = require("path");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

const PRICE_LIST = { id: "tarif-panier", name: "Tarif panier" };

// Feuille 1, complétée par les corrections de la Feuille 2 du fichier
// « tarifs vente directe.ods ». En cas de doublon, la dernière valeur gagne.
const rows = [
  ["Ail botte", "piece", 2.7], ["Ail frais", "kg", 10.5], ["Ail sec", "kg", 9],
  ["Aubergine", "kg", 4.4], ["Basilic", "piece", 1.2], ["Bette", "kg", 3.5],
  ["Betterave crue", "kg", 3.2], ["Carotte", "kg", 2.65], ["Carotte botte", "kg", 3],
  ["Céleri rave", "kg", 3.6], ["Chicorée pain de sucre", "kg", 4.2], ["Chicorée trévise", "kg", 4.2],
  ["Choux Cabus", "kg", 3.1], ["Choux chinois", "kg", 4.2], ["Choux de printemps", "kg", 3.5],
  ["Choux fleur", "kg", 4], ["Choux frisé", "kg", 3.1], ["Choux rave", "kg", 3.4],
  ["Concombre", "kg", 4], ["Courge Butternut", "kg", 3.1], ["Courge Carrat", "kg", 3.1],
  ["Courge Musquée", "kg", 2.6], ["Courge Patidou", "kg", 3.1], ["Courge Potimarron", "kg", 3.1],
  ["Courge Potimarron Vert", "kg", 3.1], ["Courgette", "kg", 2.8], ["Courgette serre", "kg", 3.3],
  ["Echalotte", "kg", 6], ["Echallion", "kg", 4.4], ["Epinard", "kg", 5.2],
  ["Fenouil", "kg", 4.2], ["Haricot vert", "kg", 7.3], ["Laitue", "piece", 1.2],
  ["Laitue serre", "piece", 1.4], ["Mâche", "kg", 15], ["Melon", "kg", 3],
  ["Mesclum", "kg", 15], ["Navet", "kg", 3.1], ["Navet botte", "piece", 2.6],
  ["Oignon", "kg", 3.3], ["Oignon botte", "piece", 2.6], ["Pastèque", "kg", 2.5],
  ["Panais", "kg", 3.8], ["Patate douce", "kg", 4.2], ["PDT primeur", "kg", 5.5],
  ["PDT primeur saison", "kg", 3.5], ["Persil", "piece", 1.4], ["Poireaux", "kg", 3.6],
  ["Poivron", "kg", 4.7], ["Poivron mini sucre", "kg", 8], ["Radis botte", "piece", 1.9],
  ["Radis daïkon", "kg", 3.6], ["Radis noir", "kg", 3.6], ["Tomate ancienne", "kg", 4.2],
  ["Tomate cerise", "kg", 6.3], ["Tomate ronde", "kg", 3.6],
  ["Confiture pêche", "piece", 4.4], ["Confiture pêche gingembre", "piece", 4],
  ["Conserve apéro courgette", "piece", 3.5], ["Conserve cardons", "piece", 7],
  ["Conserve coulis tomate", "piece", 3], ["Conserve ketchup", "piece", 4],
  ["Conserve pesto basilic", "piece", 5.5], ["Conserve pickles choux fleur", "piece", 4],
  ["Conserve pickles concombre", "piece", 4.5], ["tartinade aubergine", "piece", 4.5],
  // Feuille 2 : corrections prioritaires.
  ["Betterave crue", "kg", 2.9], ["Carotte", "kg", 3.3], ["Céleri rave", "kg", 3.4],
  ["Choux Cabus", "kg", 2.9], ["Choux chinois", "kg", 4], ["Choux rave", "kg", 3.2],
  ["Courge Potimarron Vert", "kg", 3], ["Echalotte", "kg", 6], ["Laitue serre", "piece", 1.4],
  ["Navet", "kg", 2.9], ["Oignon", "kg", 3.3], ["Panais", "kg", 3.5],
  ["PDT conservation", "kg", 2.2], ["Poireaux", "kg", 3.3], ["Radis daïkon", "kg", 3.4],
  ["Radis noir", "kg", 3.4]
];

function normalize(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\bbio\b/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function deduplicate(sourceRows) {
  const prices = new Map();
  for (const [name, unit, price] of sourceRows) prices.set(`${normalize(name)}|${unit}`, { name, unit, price });
  return Array.from(prices.values());
}

function findProduct(products, row) {
  const key = normalize(row.name);
  const exact = products.filter((product) => normalize(product.name) === key && product.unit === row.unit);
  if (exact.length === 1) return exact[0];
  return null;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  let db;
  let products;
  let partners = [];
  if (checkOnly) {
    const seed = require(path.join(process.cwd(), "data", "seed.json"));
    products = seed.products;
    partners = seed.partners;
  } else {
    db = require("../lib/db");
    products = await db.getProducts({ includeHidden: true });
    partners = await db.getPartners();
  }

  const matched = [];
  const missing = [];
  for (const row of deduplicate(rows)) {
    const product = findProduct(products, row);
    if (product) matched.push({ product, price: row.price });
    else missing.push(row);
  }

  console.log(`${matched.length} tarifs associés, ${missing.length} nouveau(x) produit(s).`);
  if (missing.length) console.log(`Nouveaux produits : ${missing.map((row) => `${row.name} (${row.unit})`).join(", ")}`);
  if (checkOnly) return;

  const existingLists = await db.getPriceLists();
  if (!existingLists.some((item) => item.id === PRICE_LIST.id)) await db.createPriceList(PRICE_LIST);
  for (const item of matched) await db.upsertProductPrice(PRICE_LIST.id, item.product.id, item.price);
  for (const row of missing) {
    const product = await db.upsertProduct({
      id: normalize(row.name).replace(/\s+/g, "-") + `-${row.unit}`,
      name: row.name,
      category: "Légumes",
      unit: row.unit,
      stock: 0,
      active: true,
      sortOrder: 1000,
      priceListId: PRICE_LIST.id,
      price: row.price
    });
    await db.upsertProductPrice(PRICE_LIST.id, product.id, row.price);
  }

  const targetPartners = partners.filter((partner) => normalize(partner.name).includes("panier saint genix"));
  if (!targetPartners.length) throw new Error("Client Panier Saint-Genix introuvable");
  for (const partner of targetPartners) await db.upsertPartner({ ...partner, originalId: partner.id, priceListId: PRICE_LIST.id });
  console.log(`Grille « ${PRICE_LIST.name} » appliquée à : ${targetPartners.map((partner) => partner.name).join(", ")}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
