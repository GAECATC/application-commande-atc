const { deleteProduct, deleteProductPrice, getAvailabilityMessage, getOrders, getPartnerByCredentials, getPartners, getProductAllocations, getProductPrices, getProducts, upsertProduct, upsertProductPrice } = require("@/lib/db");
const { isAdmin, requireAdmin } = require("@/lib/auth");
const { getNextPartnerDelivery } = require("@/lib/schedule");
const { isProductVisibleInAvailability } = require("@/lib/availability-products");

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
        partner = await getPartnerByCredentials(req.query.partnerId, req.headers["x-partner-code"] || req.query.code);
      }
      if (!partner) return res.status(401).json({ error: "Connexion partenaire requise" });
      priceListId = partner.priceListId;
    }

    let products = await getProducts({ includeHidden, priceListId });
    let delivery;
    if (partner) {
      delivery = getNextPartnerDelivery(partner.id);
      const deliveryDate = delivery.deliveryDate;
      const allocations = await getProductAllocations({ partnerId: partner.id, deliveryDate, inheritPrevious: true });
      if (allocations.length) {
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
          .filter((product) => isProductVisibleInAvailability(product, allocationByProduct))
          .map((product) => {
            const allocationQuantity = Number(allocationByProduct.get(product.id)?.quantity || 0);
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
    const availabilityMessage = partner && delivery ? await getAvailabilityMessage({ partnerId: partner.id, deliveryDate: delivery.deliveryDate }) : "";
    return res.status(200).json({ products, delivery, availabilityMessage });
  }

  if (req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    const product = req.body || {};
    const id = product.id || slugify(product.name);
    if (!id || !product.name) return res.status(400).json({ error: "Nom produit requis" });
    const price = Number(product.price);
    if (product.priceListId && (!Number.isFinite(price) || price < 0)) return res.status(400).json({ error: `Prix invalide pour « ${product.name} »` });
    const payload = {
      id,
      name: product.name,
      category: product.category,
      unit: product.unit,
      stock: Number(product.stock || 0),
      sortOrder: Number(product.sortOrder || 100)
    };
    // Dans l'administration, l'appartenance à une grille est portée par la ligne
    // product_prices. Une référence ajoutée à une grille doit rester active dans le
    // catalogue maître, sans qu'un retrait d'une autre grille puisse la désactiver.
    if (product.priceListId && product.listed !== false) payload.active = true;
    else if (!product.priceListId && Object.hasOwn(product, "active")) payload.active = Boolean(product.active);

    try {
      const saved = await upsertProduct(payload);
      if (product.priceListId) {
        // Enregistrer aussi le tarif d'un produit hors grille, sans le rendre visible.
        await upsertProductPrice(product.priceListId, id, price);
        if (product.listed === false) await deleteProductPrice(product.priceListId, id);
        const recorded = (await getProductPrices(product.priceListId)).find((item) => item.productId === id);
        if (!recorded || Number(recorded.price) !== price || recorded.listed !== (product.listed !== false)) {
          return res.status(500).json({ error: `L'enregistrement de « ${product.name} » n'a pas pu être confirmé. Actualisez avant de réessayer.` });
        }
      }
      return res.status(200).json({ product: saved });
    } catch (error) {
      return res.status(500).json({ error: `Le serveur n'a pas pu enregistrer « ${product.name} ». Aucune confirmation n'a été reçue.`, code: error.code || "SAVE_FAILED" });
    }
  }

  if (req.method === "PATCH") {
    if (!requireAdmin(req, res)) return;
    const { id, priceListId, listed } = req.body || {};
    if (!id || !priceListId || typeof listed !== "boolean") return res.status(400).json({ error: "Produit, grille et sélection requis" });
    try {
      if (listed) {
        const prices = await getProductPrices(priceListId);
        const existing = prices.find((item) => item.productId === id);
        await upsertProductPrice(priceListId, id, existing ? existing.price : Number(req.body.price || 0));
      } else {
        await deleteProductPrice(priceListId, id);
      }
      const recorded = (await getProductPrices(priceListId)).find((item) => item.productId === id);
      if (listed && !recorded?.listed) return res.status(500).json({ error: "L'ajout à la grille n'a pas pu être confirmé. Actualisez avant de réessayer." });
      if (!listed && recorded?.listed) return res.status(500).json({ error: "Le retrait de la grille n'a pas pu être confirmé. Actualisez avant de réessayer." });
      return res.status(200).json({ id, priceListId, listed });
    } catch (error) {
      return res.status(500).json({ error: "Le serveur n'a pas pu modifier la grille. La modification n'a pas été confirmée.", code: error.code || "GRID_UPDATE_FAILED" });
    }
  }

  if (req.method === "DELETE") {
    if (!requireAdmin(req, res)) return;
    const { id, priceListId } = req.body || {};
    try {
      const deleted = priceListId
        ? await deleteProductPrice(priceListId, id)
        : await deleteProduct(id);
      return res.status(200).json({ product: deleted });
    } catch (error) {
      const status = error.message === "Produit introuvable" ? 404 : 400;
      return res.status(status).json({ error: error.message || "Suppression refusee" });
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Methode non autorisee" });
};
