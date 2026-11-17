const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { buildOrderReplyEmail } = require("../lib/mailer");

const order = { id: "order-1", partnerId: "partner-1", deliveryDate: "2026-11-18", comment: "Petits choux <500g> ?" };
const partner = { id: "partner-1", name: "Boutique <test>" };

test("la réponse par mail conserve le contexte et échappe le HTML", () => {
  const message = "Oui <script>alert(1)</script>\nMerci & à bientôt";
  const email = buildOrderReplyEmail({ partner, order, message });
  assert.ok(email.text.includes(message));
  assert.ok(email.text.includes(order.comment));
  assert.ok(email.subject.includes("18 novembre 2026"));
  assert.ok(email.html.includes("&lt;script&gt;"));
  assert.ok(email.html.includes("&lt;500g&gt;"));
  assert.ok(!email.html.includes("<script>"));
});

async function requestReply({ admin = true, body = {}, mailResult = { sent: true }, mailError, orders = [order] } = {}) {
  const sent = [];
  const source = fs.readFileSync(require.resolve("../pages/api/orders.js"), "utf8")
    .replace("export default async function handler", "async function handler");
  const mocks = {
    "@/lib/db": { getOrders: async ({ partnerId }) => orders.filter((item) => item.partnerId === partnerId), getPartners: async () => [partner] },
    "@/lib/auth": { isAdmin: () => admin },
    "@/lib/schedule": {},
    "@/lib/mailer": { classifyMailError: () => "smtp-timeout", sendOrderReply: async (args) => { if (mailError) throw mailError; sent.push(args); return mailResult; } },
    "@/lib/order-comment": require("../lib/order-comment"),
    "@/lib/order-email-policy": require("../lib/order-email-policy")
  };
  const context = vm.createContext({ require: (name) => { assert.ok(mocks[name], name); return mocks[name]; } });
  vm.runInContext(`${source}\nthis.handler = handler;`, context);
  const result = {};
  const res = { setHeader() {}, status(code) { result.status = code; return this; }, json(data) { result.data = data; } };
  await context.handler({ method: "POST", body: { action: "reply-comment", orderId: order.id, partnerId: partner.id, message: " Oui, possible. ", ...body } }, res);
  return { ...result, sent };
}

test("seul un administrateur peut envoyer une réponse", async () => {
  const result = await requestReply({ admin: false });
  assert.equal(result.status, 401);
  assert.equal(result.sent.length, 0);
});

test("une réponse cible la commande du bon client et ne modifie aucune donnée", async () => {
  const result = await requestReply();
  assert.equal(result.status, 200);
  assert.equal(result.sent.length, 1);
  assert.equal(result.sent[0].order, order);
  assert.equal(result.sent[0].partner, partner);
  assert.equal(result.sent[0].message, "Oui, possible.");
  const wrongClient = await requestReply({ body: { partnerId: "other-client" } });
  assert.equal(wrongClient.status, 404);
  assert.equal(wrongClient.sent.length, 0);
});

test("les réponses vides, trop longues et sans commentaire sont refusées", async () => {
  for (const message of ["   ", "a".repeat(1001), {}, null]) {
    const result = await requestReply({ body: { message } });
    assert.equal(result.status, 400);
    assert.equal(result.sent.length, 0);
  }
  const result = await requestReply({ orders: [{ ...order, comment: "" }] });
  assert.equal(result.status, 400);
  assert.equal(result.sent.length, 0);
});

test("une absence de destinataire ou une panne SMTP ne produit pas de succès", async () => {
  const missing = await requestReply({ mailResult: { sent: false, reason: "missing-recipient" } });
  assert.equal(missing.status, 502);
  assert.match(missing.data.error, /adresse/);
  const timeout = await requestReply({ mailError: new Error("timeout") });
  assert.equal(timeout.status, 502);
  assert.match(timeout.data.error, /doublon/);
});
