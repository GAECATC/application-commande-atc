const {
  getOrders,
  getPartnerByCredentials,
  getProductAllocations,
  replaceProductAllocations
} = require("@/lib/db");
const { isAdmin } = require("@/lib/auth");
const { getNextDelivery } = require("@/lib/schedule");

export default async function handler(req, res) {
  const deliveryDate = req.query.deliveryDate || req.body?.deliveryDate || getNextDelivery().deliveryDate;
  const partnerId = req.query.partnerId || req.body?.partnerId;
  if (!partnerId) return res.status(400).json({ error: "Client requis" });

  if (req.method === "GET") {
    if (!isAdmin(req)) {
      const partner = await getPartnerByCredentials(partnerId, req.query.code);
      if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });
    }
    const allocations = await getProductAllocations({ partnerId, deliveryDate });
    const orders = await getOrders({ partnerId, deliveryDate });
    const orderedByProduct = {};
    for (const order of orders) {
      for (const item of order.items) {
        orderedByProduct[item.productId] = (orderedByProduct[item.productId] || 0) + Number(item.quantity);
      }
    }
    return res.status(200).json({ deliveryDate, configured: allocations.length > 0, allocations, orderedByProduct });
  }

  if (req.method === "POST") {
    if (!isAdmin(req)) return res.status(401).json({ error: "Accès admin refusé" });
    const rawAllocations = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
    const allocations = rawAllocations
      .filter((item) => item.productId && Number.isFinite(Number(item.quantity)) && Number(item.quantity) >= 0)
      .map((item) => ({ productId: item.productId, quantity: Number(item.quantity) }));
    try {
      const saved = await replaceProductAllocations({ partnerId, deliveryDate, allocations });
      return res.status(200).json({ allocations: saved });
    } catch (error) {
      const missingTable = error.code === "ER_NO_SUCH_TABLE";
      return res.status(400).json({ error: missingTable ? "Table des disponibilités non installée" : error.message });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Méthode non autorisée" });
}
