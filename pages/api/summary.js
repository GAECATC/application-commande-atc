const { getOrders, getPartners } = require("@/lib/db");
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
  const namedOrders = orders.map((order) => ({
    ...order,
    partnerName: partnerById.get(order.partnerId) || order.partnerId
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
      totals: buildTotals(groupOrders)
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
  return Array.from(totals.values())
    .sort((a, b) => a.category.localeCompare(b.category) || a.productName.localeCompare(b.productName));
}
