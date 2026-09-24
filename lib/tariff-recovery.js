const { matchTariffRows, normalizeTariffName } = require("./tariff-matching");

function planTariffRecovery(reference, lists, products, prices) {
  const result = [];
  for (const [sourceName, sourceRows] of Object.entries(reference)) {
    const list = lists.find((item) => normalizeTariffName(item.name) === normalizeTariffName(sourceName))
      || lists.find((item) => sourceName === "Mercuriale 2026" && normalizeTariffName(item.name).startsWith(normalizeTariffName(sourceName)));
    if (!list) throw new Error(`Grille introuvable : ${sourceName}`);
    const priceByProduct = new Map(prices.filter((item) => item.price_list_id === list.id).map((item) => [item.product_id, item]));
    const restore = [];
    const review = [];
    let preserved = 0;
    for (const { row, candidates } of matchTariffRows(sourceRows, products)) {
      if (candidates.length !== 1) {
        review.push(`${row.name} : ${candidates.length} correspondance(s)`);
        continue;
      }
      const product = candidates[0];
      const record = priceByProduct.get(product.id);
      if (record && Number(record.listed) === 1) { preserved++; continue; }
      if (record && Number(record.price) !== 0) {
        review.push(`${product.name} : hors grille avec un ancien prix de ${record.price} € ; tarif préservé`);
        continue;
      }
      restore.push({ priceListId: list.id, productId: product.id, productName: product.name, price: row.price });
    }
    result.push({ name: sourceName, restore, review, preserved });
  }
  return result;
}

module.exports = { planTariffRecovery };
