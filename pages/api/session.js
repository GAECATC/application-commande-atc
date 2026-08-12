const { getNextDelivery } = require("@/lib/schedule");
const { getPriceLists } = require("@/lib/db");
const { isAdmin } = require("@/lib/auth");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Methode non autorisee" });
  }

  const payload = { delivery: getNextDelivery() };
  if (isAdmin(req)) {
    payload.priceLists = await getPriceLists();
  }

  return res.status(200).json(payload);
};
