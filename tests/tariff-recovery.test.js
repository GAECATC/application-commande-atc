const test = require("node:test");
const assert = require("node:assert/strict");
const { planTariffRecovery } = require("../lib/tariff-recovery");

test("la reprise ne remplace ni un tarif manuel ni un ancien prix conservé hors grille", () => {
  const reference = { "Tarif épicerie": [
    { name: "Ail frais BIO", unit: "Kg", price: 8.8 },
    { name: "Courgette BIO", unit: "Kg", price: 2.6 },
    { name: "Tomate BIO", unit: "Kg", price: 3 },
    { name: "Poivron BIO", unit: "Kg", price: 4 }
  ] };
  const lists = [{ id: "epicerie", name: "Tarif épicerie" }];
  const products = [
    { id: "ail", name: "Ail frais", unit: "kg" },
    { id: "courgette", name: "Courgette", unit: "kg" },
    { id: "tomate", name: "Tomate", unit: "kg" },
    { id: "poivron", name: "Poivron", unit: "kg" },
    { id: "manuel", name: "Ajout manuel", unit: "kg" }
  ];
  const prices = [
    { price_list_id: "epicerie", product_id: "courgette", price: "2.80", listed: 1 },
    { price_list_id: "epicerie", product_id: "tomate", price: "3.50", listed: 0 },
    { price_list_id: "epicerie", product_id: "poivron", price: "0", listed: 0 },
    { price_list_id: "epicerie", product_id: "manuel", price: "9", listed: 1 }
  ];
  const [plan] = planTariffRecovery(reference, lists, products, prices);
  assert.deepEqual(plan.restore.map((item) => [item.productId, item.price]), [["ail", 8.8], ["poivron", 4]]);
  assert.equal(plan.preserved, 1);
  assert.equal(plan.review.length, 1);
});

test("une dénomination ambiguë n'est jamais restaurée automatiquement", () => {
  const [plan] = planTariffRecovery(
    { Paniers: [{ name: "Chicorée BIO", unit: "Kg", price: 4.2 }] },
    [{ id: "paniers", name: "Paniers" }],
    [{ id: "a", name: "Chicorée", unit: "kg" }, { id: "b", name: "chicorée", unit: "kg" }],
    []
  );
  assert.equal(plan.restore.length, 0);
  assert.equal(plan.review.length, 1);
});
