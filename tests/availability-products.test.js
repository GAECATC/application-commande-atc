const test = require("node:test");
const assert = require("node:assert/strict");
const { isProductVisibleInAvailability } = require("../lib/availability-products");

test("une nouvelle référence de la grille est disponible même si la liste personnelle est plus ancienne", () => {
  const allocations = new Map([["ancien", { visible: true }]]);
  assert.equal(isProductVisibleInAvailability({ id: "nouveau", active: true, listed: true }, allocations), true);
});

test("un produit explicitement masqué reste masqué et un produit hors grille n'apparaît pas", () => {
  const allocations = new Map([["masque", { visible: false }]]);
  assert.equal(isProductVisibleInAvailability({ id: "masque", active: true, listed: true }, allocations), false);
  assert.equal(isProductVisibleInAvailability({ id: "hors-grille", active: true, listed: false }, allocations), false);
  assert.equal(isProductVisibleInAvailability({ id: "inactif", active: false, listed: true }, allocations), false);
});
