const { deleteProductCategory, renameProductCategory } = require("@/lib/db");
const { requireAdmin } = require("@/lib/auth");

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method === "PATCH") {
    const currentName = String(req.body?.currentName || "").trim();
    const nextName = String(req.body?.nextName || "").trim().replace(/\s+/g, " ");
    if (!currentName || !nextName) return res.status(400).json({ error: "Catégorie et nouveau nom requis" });
    const category = await renameProductCategory({ currentName, nextName });
    return res.status(200).json({ category });
  }

  if (req.method === "DELETE") {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Catégorie requise" });
    const category = await deleteProductCategory(name);
    return res.status(200).json({ category });
  }

  res.setHeader("Allow", "PATCH, DELETE");
  return res.status(405).json({ error: "Méthode non autorisée" });
}
