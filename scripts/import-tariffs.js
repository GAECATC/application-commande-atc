const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const output = path.join(process.cwd(), "data", "seed.json");

const sources = {
  grocery: {
    file: "C:\\Users\\achraf\\Desktop\\GAEC\\tarifs épicerie.ods",
    priceListId: "tarif-epicerie",
    priceListName: "Tarif épicerie",
    partners: [
      ["epicerie-du-coin", "Épicerie du Coin", "EPICERIE"],
      ["la-fourmiliene", "La Fourmiliène", "FOURMILIENE"],
      ["auberge-savoyarde", "L'Auberge Savoyarde", "AUBERGE"],
      ["biocoop-macher", "Biocoop Mâcher", "BIOMACHER"],
      ["halles-de-chartreuse", "Les Halles de Chartreuse", "HALLESCHARTREUSE"],
      ["co-clipcho", "Coclich'haut", "COCLIPCHO"]
    ]
  },
  satoriz: {
    file: "C:\\Users\\achraf\\Desktop\\GAEC\\MERCURIALE 2026 LA RAVOIRE (1).xlsx",
    priceListId: "tarif-mercuriale-2026",
    priceListName: "Mercuriale 2026 La Ravoire",
    partners: [
      ["satoriz-la-ravoire", "Satoriz La Ravoire", "SATORIZRAVOIRE"],
      ["satoriz-chambery", "Satoriz Chambéry", "SATORIZCHAMBERY"],
      ["biocoop-pont-beauvoisin", "Biocoop Pont-de-Beauvoisin", "BIOPONTBEAUVOISIN"]
    ]
  }
};

const manualProducts = [
  { id: "ipa", name: "Bière IPA", category: "Bières", unit: "unite", price: 3.2, stock: 96, active: true, sortOrder: 900 },
  { id: "blonde-carton", name: "Bière blonde - carton 12", category: "Bières", unit: "carton", price: 34, stock: 20, active: true, sortOrder: 910 }
];

const partnerEmails = {
  "epicerie-du-coin": "contact@epicerie-du-coing.fr",
  "la-fourmiliene": "fourmilienne@gmail.com",
  "auberge-savoyarde": "sarl-gtt@orange.fr",
  "biocoop-macher": "magasin@biocoop-chambery.com",
  "halles-de-chartreuse": "",
  "co-clipcho": "appro@coclic-haut.fr",
  "satoriz-la-ravoire": "laravoire@satoriz.fr",
  "satoriz-chambery": "chambery@satoriz.fr",
  "biocoop-pont-beauvoisin": "magasin@biocoopbeauvoisin.fr",
  "client-test": "client-test@example.com"
};

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/bio\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseUnit(raw) {
  const value = String(raw).trim().toLowerCase();
  if (["kg", "kilo"].includes(value)) return "kg";
  if (["p", "pce", "piece", "pièce", "botte", "bouquet"].includes(value)) return "piece";
  if (["unite", "unité"].includes(value)) return "unite";
  if (value.includes("carton")) return "carton";
  return "piece";
}

function cleanName(value) {
  return String(value)
    .replace(/\bBIO\b/gi, "")
    .replace(/\bKG\b/gi, "")
    .replace(/\bPce\b/gi, "")
    .replace(/\bP\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readGrocery(file) {
  const workbook = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
  return rows.slice(2)
    .map((row) => ({
      name: cleanName(row[0]),
      price: Number(row[1]),
      unit: parseUnit(row[2])
    }))
    .filter((row) => row.name && Number.isFinite(row.price) && row.price > 0);
}

function readSatoriz(file) {
  const workbook = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
  return rows.slice(2)
    .map((row) => {
      const original = String(row[0] || "").trim();
      const unitMatch = original.match(/\b(KG|P)\b/i);
      return {
        name: cleanName(original),
        price: Number(row[1]),
        unit: parseUnit(unitMatch ? unitMatch[1] : "")
      };
    })
    .filter((row) => row.name && Number.isFinite(row.price) && row.price > 0);
}

const priceLists = [];
const partners = [];
const productById = new Map();
const productPrices = [];

function addSource(source, rows, sortOffset) {
  priceLists.push({ id: source.priceListId, name: source.priceListName });
  partners.push(...source.partners.map(([id, name, code]) => ({
    id,
    name,
    code,
    email: partnerEmails[id] || "",
    active: true,
    priceListId: source.priceListId
  })));

  rows.forEach((row, index) => {
    const id = `${slugify(row.name)}-${row.unit}`;
    if (!productById.has(id)) {
      productById.set(id, {
        id,
        name: row.name,
        category: "Légumes",
        unit: row.unit,
        stock: 0,
        active: true,
        sortOrder: sortOffset + index
      });
    }
    productPrices.push({
      priceListId: source.priceListId,
      productId: id,
      price: Number(row.price.toFixed(4))
    });
  });
}

addSource(sources.grocery, readGrocery(sources.grocery.file), 10);
addSource(sources.satoriz, readSatoriz(sources.satoriz.file), 300);

partners.push({
  id: "client-test",
  name: "Client test",
  code: "TESTCLIENT",
  email: partnerEmails["client-test"],
  active: true,
  priceListId: "tarif-epicerie"
});

for (const product of manualProducts) {
  productById.set(product.id, {
    id: product.id,
    name: product.name,
    category: product.category,
    unit: product.unit,
    stock: product.stock,
    active: product.active,
    sortOrder: product.sortOrder
  });
  for (const priceList of priceLists) {
    productPrices.push({ priceListId: priceList.id, productId: product.id, price: product.price });
  }
}

const seed = {
  priceLists,
  partners,
  products: Array.from(productById.values()).sort((a, b) => a.sortOrder - b.sortOrder),
  productPrices,
  orders: [],
  orderItems: []
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(seed, null, 2)}\n`);

console.log(`Wrote ${output}`);
console.log(`${seed.partners.length} partners, ${seed.products.length} products, ${seed.productPrices.length} prices`);
