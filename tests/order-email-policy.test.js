const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldSendOrderUpdateEmail } = require("../lib/order-email-policy");

test("une modification admin n'envoie pas de mail sans demande explicite", () => {
  assert.equal(shouldSendOrderUpdateEmail({ adminRequest: true }), false);
  assert.equal(shouldSendOrderUpdateEmail({ adminRequest: true, sendEmail: false }), false);
  assert.equal(shouldSendOrderUpdateEmail({ adminRequest: true, sendEmail: true }), true);
});

test("une modification faite par le client conserve sa confirmation", () => {
  assert.equal(shouldSendOrderUpdateEmail({ adminRequest: false }), true);
});
