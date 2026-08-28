const { deleteClientGroup, getClientGroups, upsertClientGroup } = require("@/lib/db");
const { requireAdmin } = require("@/lib/auth");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === "GET") return res.status(200).json({ groups: await getClientGroups() });
    if (req.method === "POST") return res.status(200).json({ group: await upsertClientGroup(req.body || {}) });
    if (req.method === "DELETE") {
      if (!req.body?.id) return res.status(400).json({ error: "Groupe requis" });
      return res.status(200).json({ group: await deleteClientGroup(req.body.id) });
    }
  } catch (error) {
    return res.status(400).json({ error: error.message || "Gestion du groupe impossible" });
  }
  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Méthode non autorisée" });
}
