function resolveAvailabilitySource(currentAllocations, habitualAllocations, previousAllocations) {
  if (currentAllocations.length) return { allocations: currentAllocations, source: "delivery" };
  if (habitualAllocations.length) return { allocations: habitualAllocations, source: "habitual" };
  if (previousAllocations.length) return { allocations: previousAllocations, source: "previous" };
  return { allocations: [], source: "general" };
}

module.exports = { resolveAvailabilitySource };
