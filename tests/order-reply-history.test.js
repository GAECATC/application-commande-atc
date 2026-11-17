const test = require("node:test");
const assert = require("node:assert/strict");
const { sendReplyWithHistory } = require("../lib/order-reply-history");

function setup(overrides = {}) {
  const events = [];
  const records = [];
  const args = {
    order: { id: "o1", comment: "Petits choux ?" },
    partner: { id: "p1", email: "test@example.invalid" }, message: "Oui.",
    createReply: async ({ reply }) => { events.push("saved"); records.push(structuredClone(reply)); },
    sendMail: async () => { events.push("mail"); return { sent: true }; },
    updateStatus: async ({ emailStatus }) => { events.push(emailStatus); records[0].emailStatus = emailStatus; },
    ...overrides
  };
  return { args, events, records };
}

test("la réponse et le commentaire d'origine sont conservés avant le mail", async () => {
  const { args, events, records } = setup();
  const result = await sendReplyWithHistory(args);
  assert.deepEqual(events, ["saved", "mail", "sent"]);
  assert.equal(result.status, 200);
  assert.equal(records[0].comment, args.order.comment);
  assert.equal(records[0].message, args.message);
  assert.equal(records[0].recipient, args.partner.email);
  assert.ok(Number.isFinite(Date.parse(records[0].createdAt)));
});

test("aucun mail ne part si la conservation échoue", async () => {
  const { args, events } = setup({ createReply: async () => { throw new Error("storage unavailable"); } });
  const result = await sendReplyWithHistory(args);
  assert.equal(result.status, 503);
  assert.deepEqual(events, []);
  assert.equal(result.reply, undefined);
});

test("un refus d'envoi reste conservé avec l'état non envoyé", async () => {
  const { args, records } = setup({ sendMail: async () => ({ sent: false, reason: "missing-recipient" }) });
  const result = await sendReplyWithHistory(args);
  assert.equal(result.status, 502);
  assert.equal(records[0].emailStatus, "failed");
  assert.equal(result.reply.message, "Oui.");
});

test("une panne SMTP garde la réponse sans renvoi automatique", async () => {
  let attempts = 0;
  const { args, records } = setup({ sendMail: async () => { attempts++; throw new Error("timeout"); } });
  const result = await sendReplyWithHistory(args);
  assert.equal(attempts, 1);
  assert.equal(records[0].emailStatus, "unknown");
  assert.match(result.error, /doublon/);
});

test("une panne après acceptation SMTP ne masque pas la trace ni l'incertitude du statut", async () => {
  const { args, records } = setup({ updateStatus: async () => { throw new Error("storage unavailable"); } });
  const result = await sendReplyWithHistory(args);
  assert.equal(result.status, 502);
  assert.equal(result.email.sent, true);
  assert.equal(records[0].emailStatus, "pending");
  assert.equal(result.reply.emailStatus, "pending");
  assert.match(result.error, /statut/);
});

test("une réponse à plusieurs contacts conserve les destinataires et le statut partiel", async () => {
  const { args, records } = setup({
    partner: { id: "p1", email: "a@example.fr, b@example.fr" },
    sendMail: async () => ({ sent: false, acceptedCount: 1, rejectedCount: 1, reason: "recipient-rejected" })
  });
  const result = await sendReplyWithHistory(args);
  assert.equal(result.status, 502);
  assert.equal(records[0].recipient, "a@example.fr, b@example.fr");
  assert.equal(records[0].emailStatus, "partial");
});
