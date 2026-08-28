const {
  deleteBasketTemplate,
  getBasketTemplates,
  getPartnerByCredentials,
  getPartners,
  getProducts,
  upsertBasketTemplate
} = require("@/lib/db");
const { isAdmin, requireAdmin } = require("@/lib/auth");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method === "GET") {
    try {
      if (isAdmin(req)) {
        const baskets = await getBasketTemplates({ includeInactive: true });
        const partners = await getPartners();
        const partnerById = new Map(partners.map((partner) => [partner.id, partner]));
        const catalogs = new Map();
        await Promise.all(partners.map(async (partner) => {
          if (!catalogs.has(partner.priceListId)) catalogs.set(partner.priceListId, await getProducts({ includeHidden: true, priceListId: partner.priceListId }));
        }));
        return res.status(200).json({ baskets: baskets.map((basket) => {
          const partner = partnerById.get(basket.partnerId);
          const productById = new Map((catalogs.get(partner?.priceListId) || []).map((product) => [product.id, product]));
          return { ...basket, items: basket.items.map((item) => {
            const product = productById.get(item.productId);
            return { ...item, productName: product?.name || item.productId, unit: product?.unit || inferUnitFromProductId(item.productId), unitPrice: Number(product?.price || 0) };
          }) };
        }) });
      }
      const partner = await getPartnerByCredentials(req.query.partnerId, req.headers["x-partner-code"] || req.query.code);
      if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });
      const baskets = await getBasketTemplates({ partnerId: partner.id });
      const products = await getProducts({ includeHidden: true, priceListId: partner.priceListId });
      const productById = new Map(products.map((product) => [product.id, product]));
      return res.status(200).json({ baskets: baskets.map((basket) => ({
        ...basket,
        items: basket.items.map((item) => {
          const product = productById.get(item.productId);
          return {
            ...item,
            productName: product?.name || item.productId,
            unit: product?.unit || inferUnitFromProductId(item.productId),
            unitPrice: Number(product?.price || 0)
          };
        })
      })) });
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

function inferUnitFromProductId(productId) {
  if (String(productId).endsWith("-kg")) return "kg";
  if (String(productId).endsWith("-piece")) return "piece";
  return "";
}
