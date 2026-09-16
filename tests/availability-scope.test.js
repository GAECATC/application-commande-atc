const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveAvailabilitySource } = require("../lib/availability-scope");

test("la liste de la livraison est prioritaire", () => {
  const delivery = [{ productId: "tomate", quantity: 10 }];
  const habitual = [{ productId: "carotte", quantity: 5 }];
  assert.deepEqual(resolveAvailabilitySource(delivery, habitual, []), {
    allocations: delivery,
    source: "delivery"
  });
});

test("la liste habituelle revient après une exception", () => {
  const habitual = [{ productId: "carotte", quantity: 5 }];
  const previousException = [{ productId: "tomate", quantity: 10 }];
  assert.deepEqual(resolveAvailabilitySource([], habitual, previousException), {
    allocations: habitual,
    source: "habitual"
  });
});

test("l'ancienne liste n'est utilisée que pendant la transition", () => {
  const previous = [{ productId: "poireau", quantity: 8 }];
  assert.deepEqual(resolveAvailabilitySource([], [], previous), {
    allocations: previous,
    source: "previous"
  });
  assert.deepEqual(resolveAvailabilitySource([], [], []), {
    allocations: [],
    source: "general"
  });
});
