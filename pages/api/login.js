const { getPartnerByCredentials } = require("@/lib/db");
const { isAdmin } = require("@/lib/auth");
const { checkLoginRateLimit } = require("@/lib/rate-limit");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Methode non autorisee" });
  }

  const { type, partnerId, code, password } = req.body || {};
  const rateLimit = checkLoginRateLimit(req, type === "admin" ? "admin" : "partner");
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    return res.status(429).json({ error: "Trop de tentatives. Réessayez dans quelques minutes." });
  }

  if (type === "admin") {
    const fakeReq = { headers: { "x-admin-password": password } };
    if (!isAdmin(fakeReq)) {
      rateLimit.recordFailure();
      return res.status(401).json({ error: "Mot de passe admin invalide" });
    }
    rateLimit.clear();
    return res.status(200).json({ ok: true, role: "admin" });
  }

  const partner = await getPartnerByCredentials(partnerId, code);
  if (!partner) {
    rateLimit.recordFailure();
    return res.status(401).json({ error: "Identifiants partenaire invalides" });
  }
  rateLimit.clear();
  return res.status(200).json({
    ok: true,
    role: "partner",
    partner: { id: partner.id, name: partner.name, priceListId: partner.priceListId }
  });
};
