const test = require("node:test");
const assert = require("node:assert/strict");
const { canSaveCatalog, isCompleteAdminSnapshot } = require("../lib/admin-catalog-safety");

test("le catalogue attend la fin du cochage avant d'enregistrer un prix", () => {
  assert.equal(canSaveCatalog({ dirtyCount: 1, saving: false, pendingCount: 1 }), false);
  assert.equal(canSaveCatalog({ dirtyCount: 1, saving: false, pendingCount: 0 }), true);
  assert.equal(canSaveCatalog({ dirtyCount: 1, saving: true, pendingCount: 0 }), false);
  assert.equal(canSaveCatalog({ dirtyCount: 1, saving: false, pendingCount: 0, loading: true }), false);
});

test("une réponse incomplète ne remplace pas les données administrateur", () => {
  const complete = { priceLists: [], products: [], groups: [], partners: [] };
  assert.equal(isCompleteAdminSnapshot(complete), true);
  assert.equal(isCompleteAdminSnapshot({ ...complete, products: undefined }), false);
  assert.equal(isCompleteAdminSnapshot({ ...complete, groups: null }), false);
});
