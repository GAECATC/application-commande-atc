const { getPartnerByCredentials, getProducts, upsertProduct } = require("@/lib/db");
const { requireAdmin } = require("@/lib/auth");

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const includeHidden = req.query.includeHidden === "true";
    if (includeHidden && !requireAdmin(req, res)) return;

    let priceListId = req.query.priceListId;
    if (!includeHidden && req.query.partnerId) {
      const partner = await getPartnerByCredentials(req.query.partnerId, req.query.code);
      if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });
      priceListId = partner.priceListId;
    }

    const products = await getProducts({ includeHidden, priceListId });
    return res.status(200).json({ products });
  }

  if (req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    const product = req.body || {};
    const id = product.id || slugify(product.name);
    if (!id || !product.name) return res.status(400).json({ error: "Nom produit requis" });
    const payload = {
      id,
      name: product.name,
      category: product.category,
      unit: product.unit,
      price: Number(product.price || 0),
      stock: Number(product.stock || 0),
      sortOrder: Number(product.sortOrder || 100),
      priceListId: product.priceListId
    };
    if (Object.hasOwn(product, "active")) payload.active = Boolean(product.active);

    const saved = await upsertProduct(payload);
    return res.status(200).json({ product: saved });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Methode non autorisee" });
};
