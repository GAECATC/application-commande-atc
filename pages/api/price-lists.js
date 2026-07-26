const { createPriceList } = require("@/lib/db");
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

  res.setHeader("Allow", "POST");
  return res.status(405).json({ error: "Méthode non autorisée" });
}
