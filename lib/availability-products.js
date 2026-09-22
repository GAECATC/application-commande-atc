function isProductVisibleInAvailability(product, allocationByProduct) {
  if (!product.active || product.listed === false) return false;
  const allocation = allocationByProduct.get(product.id);
  return allocation ? allocation.visible !== false : true;
}

module.exports = { isProductVisibleInAvailability };
