const { randomUUID } = require("crypto");

const BASKET_CATEGORY = "__basket__";
const BASKET_ITEM_CATEGORY = "__basket_item__";

function buildBasketMetadataItems(orderId, snapshots = []) {
  return snapshots.flatMap((basket) => {
    const basketId = String(basket.basketId || "");
    const header = {
      id: randomUUID(), orderId, productId: `${BASKET_CATEGORY}:${basketId}`,
      productName: basket.name, category: BASKET_CATEGORY, unit: "panier",
      quantity: Number(basket.quantity), unitPrice: Number(basket.unitPrice || 0)
    };
    const details = (basket.items || []).map((item, index) => ({
      id: randomUUID(), orderId, productId: `${BASKET_ITEM_CATEGORY}:${basketId}:${index}`,
      productName: item.productName, category: BASKET_ITEM_CATEGORY, unit: item.unit,
      quantity: Number(item.quantity), unitPrice: Number(item.unitPrice || 0)
    }));
    return [header, ...details];
  });
}

function splitBasketMetadata(items = []) {
  const regularItems = items.filter((item) => item.category !== BASKET_CATEGORY && item.category !== BASKET_ITEM_CATEGORY);
  const detailsByBasketId = new Map();
  for (const item of items.filter((entry) => entry.category === BASKET_ITEM_CATEGORY)) {
    const basketId = String(item.productId).slice(`${BASKET_ITEM_CATEGORY}:`.length).split(":")[0];
    const details = detailsByBasketId.get(basketId) || [];
    details.push({ productName: item.productName, unit: item.unit, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) });
    detailsByBasketId.set(basketId, details);
  }
  const baskets = items.filter((item) => item.category === BASKET_CATEGORY).map((item) => {
    const basketId = String(item.productId).slice(`${BASKET_CATEGORY}:`.length);
    return { basketId, name: item.productName, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), items: detailsByBasketId.get(basketId) || [] };
  });
  return { items: regularItems, baskets };
}

module.exports = { buildBasketMetadataItems, splitBasketMetadata };
