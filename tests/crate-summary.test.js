const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCrateSummary, countSaladCratesByType } = require("../lib/crate-summary");

test("les abréviations LPA et LS restent reconnues comme des laitues", () => {
  const rows = buildCrateSummary([
    {
      partnerId: "satoriz-chambery",
      partnerName: "Satoriz Chambéry",
      items: [{ productId: "laitue-plein-air-batavia-piece", productName: "LPA Batavia", unit: "piece", quantity: 14 }]
    },
    {
      partnerId: "epicerie-du-coin",
      partnerName: "Épicerie du Coin",
      items: [{ productId: "laitue-serre-rougette-piece", productName: "LS Rougette", unit: "piece", quantity: 25 }]
    }
  ]);

  assert.deepEqual(rows.map(({ name, type, capacity, quantity, fullCrates, remainder }) => (
    { name, type, capacity, quantity, fullCrates, remainder }
  )), [
    { name: "LPA Batavia", type: "rouge", capacity: 6, quantity: 14, fullCrates: 2, remainder: 2 },
    { name: "LS Rougette", type: "verte", capacity: 12, quantity: 25, fullCrates: 2, remainder: 1 }
  ]);
  assert.deepEqual(countSaladCratesByType(rows), { rouge: 3, verte: 3 });
});

test("un changement de nom affiché ne change pas le calcul des caisses", () => {
  const fullName = buildCrateSummary([{
    partnerId: "satoriz-la-ravoire",
    items: [{ productId: "laitue-plein-air-batavia-piece", productName: "Laitue plein air - Batavia", unit: "piece", quantity: 12 }]
  }]);
  const abbreviated = buildCrateSummary([{
    partnerId: "satoriz-la-ravoire",
    items: [{ productId: "laitue-plein-air-batavia-piece", productName: "LPA - Batavia", originalProductName: "Laitue plein air - Batavia", unit: "piece", quantity: 12 }]
  }]);

  assert.equal(fullName[0].fullCrates, 2);
  assert.equal(fullName[0].remainder, 0);
  assert.equal(abbreviated[0].fullCrates, fullName[0].fullCrates);
  assert.equal(abbreviated[0].remainder, fullName[0].remainder);
});

test("les autres conditionnements conservent leurs capacités", () => {
  const rows = buildCrateSummary([{
    partnerId: "client",
    items: [
      { productId: "tomate-ronde", productName: "Tomate ronde", unit: "kg", quantity: 15 },
      { productId: "tomate-ancienne", productName: "Tomate ancienne", unit: "kg", quantity: 17 },
      { productId: "aubergine", productName: "Aubergine", unit: "kg", quantity: 41 },
      { productId: "haricot-vert", productName: "Haricot vert", unit: "kg", quantity: 20 },
      { productId: "courgette", productName: "Courgette", unit: "kg", quantity: 51 }
    ]
  }]);
  const byId = new Map(rows.map((row) => [row.name, row]));

  assert.deepEqual([byId.get("Tomate ronde").capacity, byId.get("Tomate ronde").fullCrates, byId.get("Tomate ronde").remainder], [7, 2, 1]);
  assert.deepEqual([byId.get("Tomate ancienne").capacity, byId.get("Tomate ancienne").fullCrates, byId.get("Tomate ancienne").remainder], [8, 2, 1]);
  assert.deepEqual([byId.get("Aubergine").capacity, byId.get("Aubergine").fullCrates, byId.get("Aubergine").remainder], [20, 2, 1]);
  assert.deepEqual([byId.get("Haricot vert").capacity, byId.get("Haricot vert").fullCrates, byId.get("Haricot vert").remainder], [19, 1, 1]);
  assert.deepEqual([byId.get("Courgette").capacity, byId.get("Courgette").fullCrates, byId.get("Courgette").remainder], [12.5, 4, 1]);
});
