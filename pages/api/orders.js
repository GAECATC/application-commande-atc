const { cancelOrder, createOrder, getBasketTemplates, getOrders, getPartnerByCredentials, getPartners, getProducts, updateOrder, validateOrder, validateProductAllocations } = require("@/lib/db");
const { getNextPartnerDelivery } = require("@/lib/schedule");
const { isAdmin } = require("@/lib/auth");
const { sendAdminOrderAlert, sendOrderConfirmation } = require("@/lib/mailer");
const { MAX_ORDER_COMMENT_LENGTH, normalizeOrderComment } = require("@/lib/order-comment");

async function notifyOrder(partner, order, mode, previousOrder) {
  try {
    return await sendOrderConfirmation({ partner, order, mode, previousOrder });
  } catch (error) {
    console.error("Order email failed", error);
    return { sent: false, skipped: false, reason: "send-error" };
  }
}

async function notifyAdmin(partner, order, mode, previousOrder) {
  try {
    return await sendAdminOrderAlert({ partner, order, mode, previousOrder });
  } catch (error) {
    console.error("Admin order email failed", error);
    return { sent: false, skipped: false, reason: "send-error" };
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const includeInactive = req.query.history === "true";

    if (isAdmin(req)) {
      const orders = await getOrders({ deliveryDate: req.query.deliveryDate, includeInactive });
      const partners = await getPartners();
      const partnerById = new Map(partners.map((partner) => [partner.id, partner.name]));
      return res.status(200).json({
        orders: orders.map((order) => ({ ...order, partnerName: partnerById.get(order.partnerId) || order.partnerId }))
      });
    }

    const partner = await getPartnerByCredentials(req.query.partnerId, req.query.code);
    if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });

    const orders = await getOrders({ deliveryDate: req.query.deliveryDate, partnerId: partner.id, includeInactive });
    return res.status(200).json({ orders });
  }

  if (req.method === "POST") {
    const { partnerId, code, items, comment, basketSelections } = req.body || {};
    if (String(comment || "").length > MAX_ORDER_COMMENT_LENGTH) return res.status(400).json({ error: "Commentaire trop long" });
    const partner = await getPartnerByCredentials(partnerId, code);
    if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });

    const delivery = getNextPartnerDelivery(partner.id);
    const cleanItems = Array.isArray(items) ? items : [];
    const basketSnapshots = await buildBasketSnapshots(partner, basketSelections);
    await validateProductAllocations({ partnerId: partner.id, deliveryDate: delivery.deliveryDate, items: cleanItems });
    const order = await createOrder({
      partnerId: partner.id,
      deliveryDate: delivery.deliveryDate,
      harvestDay: delivery.harvestDay,
      items: cleanItems,
      comment: normalizeOrderComment(comment),
      basketSnapshots
    });
    const email = await notifyOrder(partner, order, "created");
    const adminEmail = await notifyAdmin(partner, order, "created");

    return res.status(201).json({ order, delivery, email, adminEmail });
  }

  if (req.method === "PUT") {
    const { orderId, partnerId, code, items, comment } = req.body || {};
    if (comment !== undefined && String(comment || "").length > MAX_ORDER_COMMENT_LENGTH) return res.status(400).json({ error: "Commentaire trop long" });
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
      const previousOrders = await getOrders({ partnerId: nextPartnerId });
      const previousOrder = previousOrders.find((order) => order.id === orderId);
      if (!previousOrder) return res.status(404).json({ error: "Commande introuvable" });
      const cleanItems = Array.isArray(items) ? items : [];
      await validateProductAllocations({
        partnerId: nextPartnerId,
        deliveryDate: previousOrder.deliveryDate,
        items: cleanItems,
        excludeOrderId: orderId
      });
      const order = await updateOrder({
        orderId,
        partnerId: nextPartnerId,
        items: cleanItems,
        comment: comment === undefined ? undefined : normalizeOrderComment(comment)
      });
      if (!partnerForEmail) {
        const partners = await getPartners();
        partnerForEmail = partners.find((partner) => partner.id === nextPartnerId);
      }
      const mode = adminRequest ? "updated" : "updated-by-client";
      const email = await notifyOrder(partnerForEmail, order, mode, previousOrder);
      const adminEmail = adminRequest ? null : await notifyAdmin(partnerForEmail, order, mode, previousOrder);
      return res.status(200).json({ order, email, adminEmail });
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
      const mode = adminRequest ? "cancelled" : "cancelled-by-client";
      const email = await notifyOrder(partnerForEmail, order, mode);
      const adminEmail = adminRequest ? null : await notifyAdmin(partnerForEmail, order, mode);
      return res.status(200).json({ order, email, adminEmail });
    } catch (error) {
      const status = error.message === "Commande introuvable" ? 404 : 400;
      return res.status(status).json({ error: error.message || "Suppression refusee" });
    }
  }

  if (req.method === "PATCH") {
    if (!isAdmin(req)) return res.status(401).json({ error: "Acces admin refuse" });
    const { orderId, partnerId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: "Commande requise" });
    if (!partnerId) return res.status(400).json({ error: "Partenaire requis" });

    try {
      const order = await validateOrder({ orderId, partnerId });
      const partners = await getPartners();
      const partnerForEmail = partners.find((partner) => partner.id === partnerId);
      const email = await notifyOrder(partnerForEmail, order, "validated");
      return res.status(200).json({ order, email });
    } catch (error) {
      const status = error.message === "Commande introuvable" ? 404 : 400;
      return res.status(status).json({ error: error.message || "Validation refusee" });
    }
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE, PATCH");
  return res.status(405).json({ error: "Methode non autorisee" });
};

async function buildBasketSnapshots(partner, selections) {
  const requested = (Array.isArray(selections) ? selections : [])
    .map((selection) => ({ basketId: String(selection.basketId || ""), quantity: Math.floor(Number(selection.quantity || 0)) }))
    .filter((selection) => selection.basketId && selection.quantity > 0);
  if (!requested.length) return [];
  const [templates, products] = await Promise.all([
    getBasketTemplates({ partnerId: partner.id }),
    getProducts({ includeHidden: true, priceListId: partner.priceListId })
  ]);
  const templateById = new Map(templates.map((template) => [template.id, template]));
  const productById = new Map(products.map((product) => [product.id, product]));
  return requested.map((selection) => {
    const template = templateById.get(selection.basketId);
    if (!template) throw new Error("Panier introuvable ou indisponible");
    const items = template.items.map((item) => {
      const product = productById.get(item.productId);
      if (!product) throw new Error(`Produit du panier introuvable : ${item.productId}`);
      return { productId: product.id, productName: product.name, unit: product.unit, quantity: Number(item.quantity), unitPrice: Number(product.price || 0) };
    });
    return {
      basketId: template.id, name: template.name, quantity: selection.quantity, items,
      unitPrice: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    };
  });
}
