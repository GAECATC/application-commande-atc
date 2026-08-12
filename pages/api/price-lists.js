const { createPriceList, deletePriceList, renamePriceList } = require("@/lib/db");
const { requireAdmin } = require("@/lib/auth");

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method === "POST") {
    const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
    const id = slugify(name);
    if (!name || !id) return res.status(400).json({ error: "Nom de grille tarifaire requis" });

    try {
      const priceList = await createPriceList({ id, name });
      return res.status(201).json({ priceList });
    } catch (error) {
      const duplicate = error.code === "ER_DUP_ENTRY"
        || error.code === "23505"
        || error.code === "PRICE_LIST_EXISTS";
      return res.status(duplicate ? 409 : 400).json({
        error: duplicate ? "Cette grille tarifaire existe déjà" : (error.message || "Création refusée")
      });
    }
  }

  if (req.method === "PATCH") {
    const id = String(req.body?.id || "");
    const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
    if (!id || !name) return res.status(400).json({ error: "Grille et nouveau nom requis" });
    try {
      const priceList = await renamePriceList({ id, name });
      return res.status(200).json({ priceList });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Modification refusée" });
    }
  }

  if (req.method === "DELETE") {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Grille tarifaire requise" });
    try {
      const priceList = await deletePriceList(id);
      return res.status(200).json({ priceList });
    } catch (error) {
      const inUse = error.code === "ER_ROW_IS_REFERENCED_2" || error.code === "23503" || error.code === "PRICE_LIST_IN_USE";
      return res.status(inUse ? 409 : 400).json({
        error: inUse
          ? "Cette grille est affectée à au moins un client. Changez d’abord sa grille tarifaire."
          : (error.message || "Suppression refusée")
      });
    }
  }

  res.setHeader("Allow", "POST, PATCH, DELETE");
  return res.status(405).json({ error: "Méthode non autorisée" });
}
