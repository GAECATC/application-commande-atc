const { getOrders, getPartners } = require("@/lib/db");
const { getNextDelivery } = require("@/lib/schedule");
const { requireAdmin } = require("@/lib/auth");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Methode non autorisee" });
  }
  if (!requireAdmin(req, res)) return;

  const deliveryDate = req.query.deliveryDate || getNextDelivery().deliveryDate;
  const orders = await getOrders({ deliveryDate });
  const partners = await getPartners();
  const partnerById = new Map(partners.map((partner) => [partner.id, partner.name]));
  const totals = new Map();

  for (const order of orders) {
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
    }
  }

  return res.status(200).json({
    deliveryDate,
    orders: orders.map((order) => ({ ...order, partnerName: partnerById.get(order.partnerId) || order.partnerId })),
    totals: Array.from(totals.values()).sort((a, b) => a.category.localeCompare(b.category) || a.productName.localeCompare(b.productName))
  });
};
