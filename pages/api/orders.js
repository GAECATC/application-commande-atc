const { createOrder, getOrders, getPartnerByCredentials, updateOrder } = require("@/lib/db");
const { getNextDelivery } = require("@/lib/schedule");
const { isAdmin } = require("@/lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    if (isAdmin(req)) {
      const orders = await getOrders({ deliveryDate: req.query.deliveryDate });
      return res.status(200).json({ orders });
    }

    const partner = await getPartnerByCredentials(req.query.partnerId, req.query.code);
    if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });

    const orders = await getOrders({ deliveryDate: req.query.deliveryDate, partnerId: partner.id });
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

  if (req.method === "PUT") {
    const { orderId, partnerId, code, items } = req.body || {};
    let nextPartnerId = partnerId;

    if (!isAdmin(req)) {
      const partner = await getPartnerByCredentials(partnerId, code);
      if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });
      nextPartnerId = partner.id;
    } else if (!partnerId) {
      return res.status(400).json({ error: "Partenaire requis" });
    }

    if (!orderId) return res.status(400).json({ error: "Commande requise" });

    try {
      const order = await updateOrder({
        orderId,
        partnerId: nextPartnerId,
        items: Array.isArray(items) ? items : []
      });
      return res.status(200).json({ order });
    } catch (error) {
      const status = error.message === "Commande introuvable" ? 404 : 400;
      return res.status(status).json({ error: error.message || "Modification refusee" });
    }
  }

  res.setHeader("Allow", "GET, POST, PUT");
  return res.status(405).json({ error: "Methode non autorisee" });
};
