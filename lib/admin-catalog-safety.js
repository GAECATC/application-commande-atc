function canSaveCatalog({ dirtyCount, saving, pendingCount, loading = false }) {
  return dirtyCount > 0 && !saving && !loading && pendingCount === 0;
}

function isCompleteAdminSnapshot({ priceLists, products, groups, partners }) {
  return [priceLists, products, groups, partners].every(Array.isArray);
}

module.exports = { canSaveCatalog, isCompleteAdminSnapshot };
