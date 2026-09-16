const test = require("node:test");
const assert = require("node:assert/strict");
const { attachPrices } = require("../lib/db");

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

test("retirer une référence d'une grille ne modifie pas les autres grilles", () => {
  const withoutSatorizTomato = prices.filter(
    (price) => price.priceListId !== "satoriz" || price.productId !== "tomate"
  );

  assert.equal(attachPrices(products, withoutSatorizTomato, "satoriz").length, 0);
  assert.deepEqual(
    attachPrices(products, withoutSatorizTomato, "epicerie"),
    [{ id: "carotte", name: "Carotte", active: true, price: 2.5, listed: true }]
  );
});
