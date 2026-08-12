const {
  deleteBasketTemplate,
  getBasketTemplates,
  getPartnerByCredentials,
  upsertBasketTemplate
} = require("@/lib/db");
const { isAdmin, requireAdmin } = require("@/lib/auth");

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      if (isAdmin(req)) {
        const baskets = await getBasketTemplates({ includeInactive: true });
        return res.status(200).json({ baskets });
      }
      const partner = await getPartnerByCredentials(req.query.partnerId, req.query.code);
      if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });
      const baskets = await getBasketTemplates({ partnerId: partner.id });
      return res.status(200).json({ baskets });
    } catch (error) {
      console.error("Basket loading failed", error);
      return res.status(500).json({ error: "Chargement des paniers indisponible" });
    }
  }

  if (!requireAdmin(req, res)) return;

  if (req.method === "POST") {
    try {
      const basket = await upsertBasketTemplate(req.body || {});
      return res.status(200).json({ basket });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Panier refusé" });
    }
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Panier requis" });
    const basket = await deleteBasketTemplate(id);
    return res.status(200).json({ basket });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Méthode non autorisée" });
}
