function normalizeTariffName(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\bbio\b/g, "")
    .replace(/\b(kg|pce|piece)\b$/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceUnit(value, name) {
  const raw = String(value || "").toLowerCase();
  if (/\b(pce|piece|pi[eè]ce|p|botte|bouquet)\b/.test(raw)) return "piece";
  if (/\b(kg|kilo)\b/.test(raw)) return "kg";
  if (/\bp\s*$/i.test(name) || /\b(botte|bouquet)\s*$/i.test(name)) return "piece";
  if (/\bkg\s*$/i.test(name)) return "kg";
  return "";
}

function sourceProductId(row) {
  const unit = sourceUnit(row.unit, row.name);
  if (!unit) return "";
  const name = String(row.name || "")
    .replace(/\bbio\b/gi, "")
    .replace(/\b(kg|pce|piece|p)\b\s*$/gi, "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return name ? `${name}-${unit}` : "";
}

function matchTariffRows(sourceRows, products) {
  const byKey = new Map();
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const product of products) {
    const key = `${normalizeTariffName(product.name)}|${product.unit}`;
    byKey.set(key, [...(byKey.get(key) || []), product]);
  }
  const deduped = new Map();
  for (const row of sourceRows) {
    deduped.set(`${normalizeTariffName(row.name)}|${sourceUnit(row.unit, row.name)}`, row);
  }
  return Array.from(deduped, ([key, row]) => {
    const named = byKey.get(key) || [];
    const idMatch = byId.get(sourceProductId(row));
    const sameUnit = idMatch && idMatch.unit === sourceUnit(row.unit, row.name);
    const candidates = named.length === 1 ? named : sameUnit ? [idMatch] : named;
    return { row, candidates, unitConflict: Boolean(idMatch && !sameUnit) };
  });
}

module.exports = { matchTariffRows, normalizeTariffName, sourceProductId, sourceUnit };
