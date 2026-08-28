const { deletePartner, getPartners, upsertPartner } = require("@/lib/db");
const { requireAdmin } = require("@/lib/auth");

function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (!requireAdmin(req, res)) return;

  if (req.method === "GET") {
    const partners = await getPartners();
    return res.status(200).json({ partners });
  }

  if (req.method === "POST") {
    const partner = req.body || {};
    if (!partner.id || !partner.name || !partner.code || !partner.priceListId) {
      return res.status(400).json({ error: "Client incomplet" });
    }
    if (!isValidEmail(partner.email || "")) {
      return res.status(400).json({ error: "Email client invalide" });
    }

    const saved = await upsertPartner({
      id: partner.id,
      originalId: partner.originalId || partner.id,
      name: partner.name,
      code: partner.code,
      email: partner.email || "",
      billingName: partner.billingName || "",
      billingAddress: partner.billingAddress || "",
      siret: partner.siret || "",
      vatNumber: partner.vatNumber || "",
      active: partner.active !== false,
      priceListId: partner.priceListId
    });
    return res.status(200).json({ partner: saved });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Client requis" });
    try {
      const deleted = await deletePartner(id);
      return res.status(200).json({ partner: deleted });
    } catch (error) {
      return res.status(error.code === "CLIENT_HAS_ORDERS" ? 409 : 400).json({
        error: error.message || "Suppression refusée"
      });
    }
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Methode non autorisee" });
};
