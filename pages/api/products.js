const { deleteProduct, getOrders, getPartnerByCredentials, getPartners, getProductAllocations, getProducts, upsertProduct } = require("@/lib/db");
const { isAdmin, requireAdmin } = require("@/lib/auth");
const { getNextPartnerDelivery } = require("@/lib/schedule");

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
    res.setHeader("Cache-Control", "no-store, max-age=0");
    const includeHidden = req.query.includeHidden === "true";
    if (includeHidden && !requireAdmin(req, res)) return;

    let priceListId = req.query.priceListId;
    let partner;
    if (!includeHidden && req.query.partnerId) {
      if (isAdmin(req)) {
        const partners = await getPartners();
        partner = partners.find((item) => item.id === req.query.partnerId && item.active);
      } else {
        partner = await getPartnerByCredentials(req.query.partnerId, req.query.code);
      }
      if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });
      priceListId = partner.priceListId;
    }

    let products = await getProducts({ includeHidden, priceListId });
    let delivery;
    if (partner) {
      delivery = getNextPartnerDelivery(partner.id);
      const deliveryDate = delivery.deliveryDate;
      const allocations = await getProductAllocations({ partnerId: partner.id, deliveryDate });
      if (allocations.length) {
        // Une liste personnelle remplace la visibilité générale et doit aussi inclure
        // les produits qui n'ont pas encore de prix explicite dans cette grille.
        products = await getProducts({ includeHidden: true, priceListId: partner.priceListId });
        const orders = await getOrders({ partnerId: partner.id, deliveryDate });
        const orderedByProduct = new Map();
        for (const order of orders) {
          for (const item of order.items) {
            orderedByProduct.set(item.productId, (orderedByProduct.get(item.productId) || 0) + Number(item.quantity));
          }
        }
        const allocationByProduct = new Map(allocations.map((item) => [item.productId, item]));
        products = products
          .filter((product) => allocationByProduct.get(product.id)?.visible !== false && allocationByProduct.has(product.id))
          .map((product) => {
            const allocationQuantity = Number(allocationByProduct.get(product.id).quantity);
            return {
              ...product,
              stock: allocationQuantity > 0
                ? Math.max(0, allocationQuantity - (orderedByProduct.get(product.id) || 0))
                : 0,
              clientAllocation: true,
              clientUnlimited: allocationQuantity <= 0
            };
          })
          .filter((product) => product.clientUnlimited || product.stock > 0);
      }
    }
    return res.status(200).json({ products, delivery });
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
