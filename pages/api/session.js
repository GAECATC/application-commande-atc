const { getNextDelivery } = require("@/lib/schedule");
const { getPartners, getPriceLists } = require("@/lib/db");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Methode non autorisee" });
  }

  const [partners, priceLists] = await Promise.all([getPartners(), getPriceLists()]);
  return res.status(200).json({
    delivery: getNextDelivery(),
    partners: partners.filter((partner) => partner.active).map(({ id, name }) => ({ id, name })),
    priceLists
  });
};
