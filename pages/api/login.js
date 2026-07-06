const { getPartnerByCredentials } = require("@/lib/db");
const { isAdmin } = require("@/lib/auth");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Methode non autorisee" });
  }

  const { type, partnerId, code, password } = req.body || {};

  if (type === "admin") {
    const fakeReq = { headers: { "x-admin-password": password } };
    if (!isAdmin(fakeReq)) return res.status(401).json({ error: "Mot de passe admin invalide" });
    return res.status(200).json({ ok: true, role: "admin" });
  }

  const partner = await getPartnerByCredentials(partnerId, code);
  if (!partner) return res.status(401).json({ error: "Identifiants partenaire invalides" });
  return res.status(200).json({
    ok: true,
    role: "partner",
    partner: { id: partner.id, name: partner.name, priceListId: partner.priceListId }
  });
};
