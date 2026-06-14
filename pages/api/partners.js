const { getPartners, upsertPartner } = require("@/lib/db");
const { requireAdmin } = require("@/lib/auth");

function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = async function handler(req, res) {
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

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Methode non autorisee" });
};
