const PRODUCT_CATEGORIES = [
  "Légumes racines",
  "Légumes fruits",
  "Légumes feuilles",
  "Courges",
  "Choux",
  "Poireaux",
  "Aromates et condiments",
  "Autres légumes",
  "Produits transformés",
  "Bières"
];

function searchableName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesOneOf(name, terms) {
  return terms.some((term) => name.includes(term));
}

function inferProductCategory(productName) {
  const name = searchableName(productName);

  if (includesOneOf(name, ["biere", "ipa", "blonde", "ambree"])) return "Bières";
  if (includesOneOf(name, ["confiture", "conserve", "chips", "tartinade", "pickles", "pesto", "coulis", "ketchup"])) {
    return "Produits transformés";
  }
  if (includesOneOf(name, [
    "aubergine", "concombre", "courgette", "haricot", "melon", "pasteque", "poivron", "tomate"
  ])) return "Légumes fruits";
  if (includesOneOf(name, ["courge", "potimarron", "butternut", "patidou"])) return "Courges";
  if (includesOneOf(name, ["chou", "choux", "pak choi"])) return "Choux";
  if (name.includes("poireau")) return "Poireaux";
  if (includesOneOf(name, ["ail", "echal", "oignon", "cebette", "basilic", "persil", "coriandre"])) {
    return "Aromates et condiments";
  }
  if (includesOneOf(name, [
    "betterave", "carotte", "celeri rave", "navet", "panais", "patate douce", "pdt", "pomme de terre",
    "radis", "rutabaga", "topinambour"
  ])) return "Légumes racines";
  if (includesOneOf(name, [
    "laitue", "bette", "blette", "mache", "mescl", "epinard", "chicoree"
  ])) return "Légumes feuilles";

  return "Autres légumes";
}

function resolveProductCategory(product) {
  const category = String(product?.category || "").trim();
  return category && category !== "Légumes" ? category : inferProductCategory(product?.name);
}

module.exports = { PRODUCT_CATEGORIES, inferProductCategory, resolveProductCategory };
