const { deleteProduct, getOrders, getPartnerByCredentials, getProductAllocations, getProducts, upsertProduct } = require("@/lib/db");
const { requireAdmin } = require("@/lib/auth");
const { getNextDelivery } = require("@/lib/schedule");

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const includeHidden = req.query.includeHidden === "true";
    if (includeHidden && !requireAdmin(req, res)) return;

    let priceListId = req.query.priceListId;
    let partner;
    if (!includeHidden && req.query.partnerId) {
      partner = await getPartnerByCredentials(req.query.partnerId, req.query.code);
      if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });
      priceListId = partner.priceListId;
    }

    let products = await getProducts({ includeHidden, priceListId });
    if (partner) {
      const deliveryDate = getNextDelivery().deliveryDate;
      const allocations = await getProductAllocations({ partnerId: partner.id, deliveryDate });
      if (allocations.length) {
        const orders = await getOrders({ partnerId: partner.id, deliveryDate });
        const orderedByProduct = new Map();
        for (const order of orders) {
          for (const item of order.items) {
            orderedByProduct.set(item.productId, (orderedByProduct.get(item.productId) || 0) + Number(item.quantity));
          }
        }
        const allocationByProduct = new Map(allocations.map((item) => [item.productId, Number(item.quantity)]));
        products = products
          .filter((product) => allocationByProduct.has(product.id))
          .map((product) => ({
            ...product,
            stock: Math.max(0, allocationByProduct.get(product.id) - (orderedByProduct.get(product.id) || 0)),
            clientAllocation: true
          }))
          .filter((product) => product.stock > 0);
      }
    }
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

  if (req.method === "DELETE") {
    if (!requireAdmin(req, res)) return;
    const { id } = req.body || {};
    try {
      const deleted = await deleteProduct(id);
      return res.status(200).json({ product: deleted });
    } catch (error) {
      const status = error.message === "Produit introuvable" ? 404 : 400;
      return res.status(status).json({ error: error.message || "Suppression refusee" });
    }
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Methode non autorisee" });
};
