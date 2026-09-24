function normalizeTariffName(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\bbio\b/g, "")
    .replace(/\b(kg|pce|piece)\b$/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceUnit(value, name) {
  const raw = String(value || "").toLowerCase();
  if (/\b(kg|kilo)\b/.test(raw) || /\bkg\b/i.test(name)) return "kg";
  if (/\b(pce|piece|pi[eè]ce|p|botte|bouquet)\b/.test(raw) || /\bp\b/i.test(name)) return "piece";
  return "";
}

function matchTariffRows(sourceRows, products) {
  const byKey = new Map();
  for (const product of products) {
    const key = `${normalizeTariffName(product.name)}|${product.unit}`;
    byKey.set(key, [...(byKey.get(key) || []), product]);
  }
  const deduped = new Map();
  for (const row of sourceRows) {
    deduped.set(`${normalizeTariffName(row.name)}|${sourceUnit(row.unit, row.name)}`, row);
  }
  return Array.from(deduped, ([key, row]) => ({ row, candidates: byKey.get(key) || [] }));
}

module.exports = { matchTariffRows, normalizeTariffName, sourceUnit };
