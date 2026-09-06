const { getPreparationChecks, setPreparationCheck } = require("@/lib/db");
const { requireAdmin } = require("@/lib/auth");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (!requireAdmin(req, res)) return;
  const deliveryDate = String(req.query.deliveryDate || req.body?.deliveryDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return res.status(400).json({ error: "Date de livraison invalide" });
  try {
    if (req.method === "GET") return res.status(200).json({ checkedKeys: await getPreparationChecks(deliveryDate) });
    if (req.method === "POST") {
      const itemKey = String(req.body?.itemKey || "");
      if (!itemKey || itemKey.length > 500) return res.status(400).json({ error: "Ligne de préparation invalide" });
      return res.status(200).json(await setPreparationCheck({ deliveryDate, itemKey, checked: req.body?.checked === true }));
    }
  } catch (error) {
    return res.status(400).json({ error: error.message || "Checklist impossible à enregistrer" });
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Méthode non autorisée" });
}
