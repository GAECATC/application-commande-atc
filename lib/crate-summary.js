function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const SATORIZ_IDS = new Set(["satoriz-la-ravoire", "satoriz-chambery"]);

function buildCrateSummary(orders) {
  const groups = new Map();
  for (const order of orders) for (const item of order.items || []) {
    // Le nom affiché peut être renommé ou abrégé dans le catalogue. Les règles de
    // conditionnement s'appuient donc aussi sur le nom mémorisé et l'identifiant stable.
    const name = normalize([item.productName, item.originalProductName, item.productId].filter(Boolean).join(" "));
    const unit = normalize(item.unit);
    let capacity;
    let type = "standard";
    const isSalad = /\b(laitue|laitues|salade|salades|batavia|batavias|iceberg|scarole|scaroles|frisee|lpa|ls)\b/.test(name) && /^(piece|pieces)$/.test(unit);
    if (isSalad) {
      const isSatoriz = SATORIZ_IDS.has(order.partnerId) || /\bsatoriz\b/.test(normalize(order.partnerName));
      type = isSatoriz ? "rouge" : "verte";
      capacity = type === "rouge" ? 6 : 12;
    } else if (unit === "kg") {
      if (/\btomates? rondes?\b/.test(name)) capacity = 7;
      else if (/\btomates? anciennes?\b/.test(name)) capacity = 8;
      else if (/\baubergines?\b/.test(name)) capacity = 20;
      else if (/\bharicots?\b/.test(name)) capacity = 19;
      else if (/\bcourgettes?\b/.test(name)) capacity = 12.5;
    }
    const quantity = Number(item.quantity);
    if (!capacity || !Number.isFinite(quantity) || quantity <= 0) continue;
    const key = JSON.stringify([item.productId || name, unit, type]);
    const row = groups.get(key) || { id: key, name: item.productName, unit: item.unit, type, capacity, isSalad, quantity: 0 };
    row.quantity += quantity;
    groups.set(key, row);
  }
  return Array.from(groups.values()).map((row) => {
    const quantity = Math.round(row.quantity * 1000000) / 1000000;
    const fullCrates = Math.floor(quantity / row.capacity);
    const remainder = Math.round((quantity - fullCrates * row.capacity) * 1000000) / 1000000;
    return { ...row, quantity, fullCrates, remainder, crateEquivalent: Math.round((quantity / row.capacity) * 100) / 100 };
  }).sort((a, b) => Number(b.isSalad) - Number(a.isSalad) || a.name.localeCompare(b.name, "fr") || a.type.localeCompare(b.type));
}

function countSaladCratesByType(rows) {
  return ["rouge", "verte"].reduce((counts, type) => {
    counts[type] = rows
      .filter((item) => item.isSalad && item.type === type)
      .reduce((sum, item) => sum + Math.ceil(item.quantity / item.capacity), 0);
    return counts;
  }, { rouge: 0, verte: 0 });
}

module.exports = { buildCrateSummary, countSaladCratesByType };
