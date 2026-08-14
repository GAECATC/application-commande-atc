const { getBasketTemplates, getOrders, getPartners, getProducts } = require("@/lib/db");
const { getNextDelivery } = require("@/lib/schedule");
const { requireAdmin } = require("@/lib/auth");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Methode non autorisee" });
  }
  if (!requireAdmin(req, res)) return;

  const requestedDeliveryDate = req.query.deliveryDate;
  const deliveryDate = requestedDeliveryDate || getNextDelivery().deliveryDate;
  const orders = await getOrders({ deliveryDate: requestedDeliveryDate || undefined });
  const partners = await getPartners();
  const partnerById = new Map(partners.map((partner) => [partner.id, partner.name]));
  const legacyBasketCache = new Map();
  const namedOrders = await Promise.all(orders.map(async (order) => {
    let baskets = order.baskets || [];
    if (!baskets.length) {
      if (!legacyBasketCache.has(order.partnerId)) {
        const partner = partners.find((entry) => entry.id === order.partnerId);
        legacyBasketCache.set(order.partnerId, partner ? await loadBasketCatalog(partner) : null);
      }
      baskets = inferLegacyBaskets(order, legacyBasketCache.get(order.partnerId));
    }
    return completeOrderFromBaskets({ ...order, baskets, partnerName: partnerById.get(order.partnerId) || order.partnerId });
  }));
  const ordersByDeliveryDate = new Map();
  for (const order of namedOrders) {
    const group = ordersByDeliveryDate.get(order.deliveryDate) || [];
    group.push(order);
    ordersByDeliveryDate.set(order.deliveryDate, group);
  }
  const groups = Array.from(ordersByDeliveryDate.entries())
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([groupDeliveryDate, groupOrders]) => ({
      deliveryDate: groupDeliveryDate,
      orders: groupOrders,
      totals: buildTotals(groupOrders),
      baskets: buildBasketTotals(groupOrders)
    }));

  return res.status(200).json({
    deliveryDate,
    orders: namedOrders,
    totals: buildTotals(namedOrders),
    groups
  });
};

function buildTotals(orders) {
  const totals = new Map();
  for (const order of orders) {
    const actualByNameAndUnit = new Map();
    for (const item of order.items) {
      const key = `${item.productId}:${item.unit}`;
      const current = totals.get(key) || {
        productId: item.productId,
        productName: item.productName,
        category: item.category,
        unit: item.unit,
        quantity: 0
      };
      current.quantity += Number(item.quantity);
      totals.set(key, current);
      const nameKey = `${normalizeName(item.productName)}:${item.unit}`;
      actualByNameAndUnit.set(nameKey, (actualByNameAndUnit.get(nameKey) || 0) + Number(item.quantity));
    }
    const expectedByNameAndUnit = new Map();
    for (const basket of order.baskets || []) {
      for (const item of basket.items || []) {
        const nameKey = `${normalizeName(item.productName)}:${item.unit}`;
        const expected = Number(item.quantity) * Number(basket.quantity);
        const current = expectedByNameAndUnit.get(nameKey) || { ...item, quantity: 0 };
        current.quantity += expected;
        expectedByNameAndUnit.set(nameKey, current);
      }
    }
    for (const [nameKey, expected] of expectedByNameAndUnit) {
      const missing = expected.quantity - Number(actualByNameAndUnit.get(nameKey) || 0);
      if (missing <= 0.000001) continue;
      const key = `${expected.productId || `basket:${nameKey}`}:${expected.unit}`;
      const current = totals.get(key) || { productId: expected.productId || `basket:${nameKey}`, productName: expected.productName, category: "Composition des paniers", unit: expected.unit, quantity: 0 };
      current.quantity += missing;
      totals.set(key, current);
    }
  }
  return Array.from(totals.values())
    .sort((a, b) => a.category.localeCompare(b.category) || a.productName.localeCompare(b.productName));
}

function normalizeName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr");
}

function completeOrderFromBaskets(order) {
  const items = [...order.items];
  const actual = new Map();
  for (const item of items) {
    const key = `${normalizeName(item.productName)}:${item.unit}`;
    actual.set(key, (actual.get(key) || 0) + Number(item.quantity));
  }
  const expected = new Map();
  for (const basket of order.baskets || []) for (const item of basket.items || []) {
    const key = `${normalizeName(item.productName)}:${item.unit}`;
    const current = expected.get(key) || { ...item, quantity: 0 };
    current.quantity += Number(item.quantity) * Number(basket.quantity);
    expected.set(key, current);
  }
  let total = Number(order.total || 0);
  for (const [key, item] of expected) {
    const missing = item.quantity - Number(actual.get(key) || 0);
    if (missing <= 0.000001) continue;
    items.push({
      id: `basket-recovery:${order.id}:${key}`, productId: item.productId || `basket:${key}`,
      productName: item.productName, category: "Composition des paniers", unit: item.unit,
      quantity: missing, unitPrice: Number(item.unitPrice || 0)
    });
    total += missing * Number(item.unitPrice || 0);
  }
  return { ...order, items, total };
}

async function loadBasketCatalog(partner) {
  const [templates, products] = await Promise.all([
    getBasketTemplates({ partnerId: partner.id, includeInactive: true }),
    getProducts({ includeHidden: true, priceListId: partner.priceListId })
  ]);
  return { templates, productById: new Map(products.map((product) => [product.id, product])) };
}

function inferLegacyBaskets(order, catalog) {
  if (!catalog?.templates?.length) return [];
  const orderQuantity = new Map(order.items.map((item) => [item.productId, Number(item.quantity)]));
  const usageCount = new Map();
  for (const template of catalog.templates) for (const item of template.items) usageCount.set(item.productId, (usageCount.get(item.productId) || 0) + 1);
  return catalog.templates.flatMap((template) => {
    const ratios = template.items
      .filter((item) => usageCount.get(item.productId) === 1 && orderQuantity.has(item.productId) && Number(item.quantity) > 0)
      .map((item) => orderQuantity.get(item.productId) / Number(item.quantity));
    const count = ratios[0];
    if (!count || count <= 0 || Math.abs(count - Math.round(count)) >= 0.0001 || ratios.some((ratio) => Math.abs(ratio - count) >= 0.0001)) return [];
    const items = template.items.map((item) => {
      const product = catalog.productById.get(item.productId);
      return { productName: product?.name || item.productId, unit: product?.unit || "", quantity: Number(item.quantity), unitPrice: Number(product?.price || 0) };
    });
    return [{ basketId: template.id, name: template.name, quantity: Math.round(count), items, unitPrice: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) }];
  });
}

function buildBasketTotals(orders) {
  const totals = new Map();
  for (const order of orders) {
    for (const basket of order.baskets || []) {
      const current = totals.get(basket.basketId) || { ...basket, quantity: 0 };
      current.quantity += Number(basket.quantity);
      totals.set(basket.basketId, current);
    }
  }
  return Array.from(totals.values()).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
