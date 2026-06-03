const { createOrder, getOrders, getPartnerByCredentials } = require("@/lib/db");
const { getNextDelivery } = require("@/lib/schedule");
const { requireAdmin } = require("@/lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    const orders = await getOrders({ deliveryDate: req.query.deliveryDate });
    return res.status(200).json({ orders });
  }

  if (req.method === "POST") {
    const { partnerId, code, items } = req.body || {};
    const partner = await getPartnerByCredentials(partnerId, code);
    if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });

    const delivery = getNextDelivery();
    const order = await createOrder({
      partnerId: partner.id,
      deliveryDate: delivery.deliveryDate,
      harvestDay: delivery.harvestDay,
      items: Array.isArray(items) ? items : []
    });

    return res.status(201).json({ order, delivery });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Methode non autorisee" });
};
