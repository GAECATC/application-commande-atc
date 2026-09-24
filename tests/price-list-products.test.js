const test = require("node:test");
const assert = require("node:assert/strict");
const { attachPrices } = require("../lib/db");
const { buildProductsQuery, normalizeProduct } = require("../lib/mysql-db");

const products = [
  { id: "carotte", name: "Carotte", active: true },
  { id: "tomate", name: "Tomate", active: true }
];

const prices = [
  { priceListId: "epicerie", productId: "carotte", price: 2.5 },
  { priceListId: "satoriz", productId: "tomate", price: 3.8 }
];

test("une grille publique ne contient que ses propres références", () => {
  assert.deepEqual(
    attachPrices(products, prices, "satoriz"),
    [{ id: "tomate", name: "Tomate", active: true, price: 3.8, listed: true }]
  );
});

test("l'administration distingue une référence absente sans la supprimer du catalogue", () => {
  assert.deepEqual(
    attachPrices(products, prices, "satoriz", true),
    [
      { id: "carotte", name: "Carotte", active: true, price: 0, listed: false },
      { id: "tomate", name: "Tomate", active: true, price: 3.8, listed: true }
    ]
  );
});

test("retirer une référence conserve son prix et ne modifie pas les autres grilles", () => {
  const withoutSatorizTomato = prices.map((price) =>
    price.priceListId === "satoriz" && price.productId === "tomate" ? { ...price, listed: false } : price
  );

  assert.equal(attachPrices(products, withoutSatorizTomato, "satoriz").length, 0);
  assert.deepEqual(attachPrices(products, withoutSatorizTomato, "satoriz", true)[1], {
    id: "tomate", name: "Tomate", active: true, price: 3.8, listed: false
  });
  assert.deepEqual(
    attachPrices(products, withoutSatorizTomato, "epicerie"),
    [{ id: "carotte", name: "Carotte", active: true, price: 2.5, listed: true }]
  );
});

test("une référence cochée dans la grille reste disponible malgré son ancien statut inactif", () => {
  const oldProducts = [{ id: "chicoree", name: "Chicorée", active: false }];
  const oldPrices = [{ priceListId: "epicerie", productId: "chicoree", price: 3.68 }];

  assert.deepEqual(attachPrices(oldProducts, oldPrices, "epicerie"), [
    { id: "chicoree", name: "Chicorée", active: true, price: 3.68, listed: true }
  ]);
  assert.deepEqual(attachPrices(oldProducts, oldPrices, "satoriz"), []);
});

test("la requête MySQL de la grille n'écarte pas les références à cause de l'ancien statut actif", () => {
  const priced = buildProductsQuery({ priceListId: "epicerie" });
  assert.match(priced.sql, /inner join product_prices/);
  assert.match(priced.sql, /pp\.listed = 1/);
  assert.doesNotMatch(priced.sql, /where p\.active = 1/);
  assert.deepEqual(priced.params, ["epicerie"]);
  assert.equal(normalizeProduct({ id: "chicoree", active: 0, listed: 1 }).active, true);

  const general = buildProductsQuery();
  assert.match(general.sql, /where p\.active = 1/);
});
