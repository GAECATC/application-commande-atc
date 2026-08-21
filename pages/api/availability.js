const {
  getOrders,
  getAvailabilityMessage,
  getPartners,
  getPartnerByCredentials,
  getProductAllocations,
  replaceProductAllocations,
  saveAvailabilityMessage
} = require("@/lib/db");
const { sendAvailabilityNotice } = require("@/lib/mailer");
const { isAdmin } = require("@/lib/auth");
const { getNextPartnerDelivery } = require("@/lib/schedule");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const partnerId = req.query.partnerId || req.body?.partnerId;
  if (!partnerId) return res.status(400).json({ error: "Client requis" });
  const deliveryDate = req.query.deliveryDate
    || req.body?.deliveryDate
    || getNextPartnerDelivery(partnerId).deliveryDate;

  if (req.method === "GET") {
    if (!isAdmin(req)) {
      const partner = await getPartnerByCredentials(partnerId, req.query.code);
      if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });
    }
    const currentAllocations = await getProductAllocations({ partnerId, deliveryDate });
    const allocations = currentAllocations.length
      ? currentAllocations
      : await getProductAllocations({ partnerId, deliveryDate, inheritPrevious: true });
    const orders = await getOrders({ partnerId, deliveryDate });
    const message = await getAvailabilityMessage({ partnerId, deliveryDate });
    const orderedByProduct = {};
    for (const order of orders) {
      for (const item of order.items) {
        orderedByProduct[item.productId] = (orderedByProduct[item.productId] || 0) + Number(item.quantity);
      }
    }
    return res.status(200).json({
      deliveryDate,
      configured: currentAllocations.length > 0,
      inherited: currentAllocations.length === 0 && allocations.length > 0,
      allocations,
      message,
      orderedByProduct
    });
  }

  if (req.method === "POST") {
    if (!isAdmin(req)) return res.status(401).json({ error: "Accès admin refusé" });
    const rawAllocations = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
    const allocations = rawAllocations
      .filter((item) => item.productId && Number.isFinite(Number(item.quantity)) && Number(item.quantity) >= 0)
      .map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        visible: item.visible !== false
      }));
    try {
      const saved = await replaceProductAllocations({ partnerId, deliveryDate, allocations });
      const message = String(req.body?.message || "").trim().slice(0, 2000);
      await saveAvailabilityMessage({ partnerId, deliveryDate, message });
      const partner = (await getPartners()).find((item) => item.id === partnerId);
      let email = { sent: false, skipped: true };
      if (req.body?.sendEmail !== false) {
        try {
          email = await sendAvailabilityNotice({ partner, deliveryDate, message });
        } catch (mailError) {
          email = { sent: false, skipped: false, error: mailError.message || "Envoi du mail impossible" };
        }
      }
      return res.status(200).json({ allocations: saved, message, email });
    } catch (error) {
      const missingTable = error.code === "ER_NO_SUCH_TABLE";
      return res.status(400).json({ error: missingTable ? "Table des disponibilités non installée" : error.message });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Méthode non autorisée" });
}
