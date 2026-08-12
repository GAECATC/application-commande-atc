const SEASONS = ["printemps", "ete", "automne", "hiver"];

const SEASON_KEYWORDS = {
  printemps: [
    "ail frais", "ail botte", "asperge", "bette", "blette", "carotte botte", "cebette", "chou de printemps",
    "epinard", "fenouil", "laitue", "mesclum", "navet botte", "oignon botte", "petit pois", "pdt primeur",
    "pdt nouvelle", "persil", "poireau", "radis botte"
  ],
  ete: [
    "ail", "aubergine", "basilic", "bette", "blette", "carotte", "celeri branche", "concombre", "courgette",
    "fenouil", "haricot", "laitue", "melon", "mesclum", "oignon", "pasteque", "pdt nouvelle", "pdt primeur",
    "persil", "poivron", "tomate"
  ],
  automne: [
    "ail", "betterave", "bette", "blette", "carotte", "celeri", "chicoree", "chou", "courge", "epinard",
    "fenouil", "mache", "navet", "oignon", "panais", "patate douce", "pdt", "poireau", "potimarron",
    "radis", "rutabaga", "topinambour"
  ],
  hiver: [
    "ail", "betterave", "carotte", "celeri rave", "chicoree", "chou", "courge", "epinard", "mache", "navet",
    "oignon", "panais", "patate douce", "pdt", "poireau", "potimarron", "radis noir", "rutabaga", "topinambour"
  ]
};

const NON_FRESH_KEYWORDS = ["biere", "chips", "confiture", "conserve", "ketchup", "pesto", "pickles", "tartinade"];

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isFreshProduce(product) {
  const text = normalize(`${product.category} ${product.name}`);
  return !NON_FRESH_KEYWORDS.some((keyword) => text.includes(keyword));
}

function getProductSeasons(product) {
  const name = normalize(product.name);
  return SEASONS.filter((season) => SEASON_KEYWORDS[season].some((keyword) => name.includes(keyword)));
}

module.exports = { getProductSeasons, isFreshProduce, SEASONS };
