const { cancelOrder, createOrder, getOrders, getPartnerByCredentials, getPartners, updateOrder } = require("@/lib/db");
const { getNextDelivery } = require("@/lib/schedule");
const { isAdmin } = require("@/lib/auth");
const { sendOrderConfirmation } = require("@/lib/mailer");

async function notifyOrder(partner, order, mode, previousOrder) {
  try {
    return await sendOrderConfirmation({ partner, order, mode, previousOrder });
  } catch (error) {
    console.error("Order email failed", error);
    return { sent: false, skipped: false, reason: "send-error" };
  }
}

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
    const email = await notifyOrder(partner, order, "created");

    return res.status(201).json({ order, delivery, email });
  }

  if (req.method === "PUT") {
    const { orderId, partnerId, code, items } = req.body || {};
    let nextPartnerId = partnerId;
    let partnerForEmail = null;

    if (!isAdmin(req)) {
      const partner = await getPartnerByCredentials(partnerId, code);
      if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });
      nextPartnerId = partner.id;
      partnerForEmail = partner;
    } else if (!partnerId) {
      return res.status(400).json({ error: "Partenaire requis" });
    }

    if (!orderId) return res.status(400).json({ error: "Commande requise" });

    try {
      const previousOrders = await getOrders({ partnerId: nextPartnerId });
      const previousOrder = previousOrders.find((order) => order.id === orderId);
      const order = await updateOrder({
        orderId,
        partnerId: nextPartnerId,
        items: Array.isArray(items) ? items : []
      });
      if (!partnerForEmail) {
        const partners = await getPartners();
        partnerForEmail = partners.find((partner) => partner.id === nextPartnerId);
      }
      const email = await notifyOrder(partnerForEmail, order, "updated", previousOrder);
      return res.status(200).json({ order, email });
    } catch (error) {
      const status = error.message === "Commande introuvable" ? 404 : 400;
      return res.status(status).json({ error: error.message || "Modification refusee" });
    }
  }

  if (req.method === "DELETE") {
    const { orderId, partnerId, code } = req.body || {};
    let nextPartnerId = partnerId;
    let partnerForEmail = null;
    const adminRequest = isAdmin(req);

    if (!adminRequest) {
      const partner = await getPartnerByCredentials(partnerId, code);
      if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });
      nextPartnerId = partner.id;
      partnerForEmail = partner;
    } else if (!partnerId) {
      return res.status(400).json({ error: "Partenaire requis" });
    }

    if (!orderId) return res.status(400).json({ error: "Commande requise" });

    try {
      const order = await cancelOrder({ orderId, partnerId: nextPartnerId });
      if (!partnerForEmail) {
        const partners = await getPartners();
        partnerForEmail = partners.find((partner) => partner.id === nextPartnerId);
      }
      const email = await notifyOrder(partnerForEmail, order, adminRequest ? "cancelled" : "cancelled-by-client");
      return res.status(200).json({ order, email });
    } catch (error) {
      const status = error.message === "Commande introuvable" ? 404 : 400;
      return res.status(status).json({ error: error.message || "Suppression refusee" });
    }
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  return res.status(405).json({ error: "Methode non autorisee" });
};
