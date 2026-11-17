const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { normalizePartnerEmails, parseEmailList, selectPartnerEmails } = require("../lib/partner-emails");

const partner = { id: "p1", name: "Boutique", email: "commande@example.fr, livraison@example.fr" };
const order = { deliveryDate: "2026-11-19", items: [], total: 0 };

test("une adresse existante reste compatible et une liste se normalise sans doublon", () => {
  assert.equal(normalizePartnerEmails("ancien@example.fr"), "ancien@example.fr");
  assert.equal(normalizePartnerEmails(" commande@example.fr;\nlivraison@example.fr\nCOMMANDE@example.fr "), partner.email);
  assert.equal(normalizePartnerEmails(""), "");
  assert.deepEqual(parseEmailList(partner.email), ["commande@example.fr", "livraison@example.fr"]);
});

test("les adresses invalides et les listes trop longues sont refusées avant stockage", () => {
  for (const value of ["a@example.fr, invalide", "a@example.fr\r\nBcc:b@example.fr", "Nom <a@example.fr>", "a@..fr", {}, ["a@example.fr"]]) {
    assert.throws(() => normalizePartnerEmails(value));
  }
  const longList = Array.from({ length: 20 }, (_, index) => `adresse${index}@example.fr`).join(", ");
  assert.throws(() => normalizePartnerEmails(longList), /255/);
});

test("la sélection vide ne se transforme jamais en envoi à tous", () => {
  assert.deepEqual(selectPartnerEmails(partner), parseEmailList(partner.email));
  assert.deepEqual(selectPartnerEmails(partner, ["livraison@example.fr"]), ["livraison@example.fr"]);
  assert.throws(() => selectPartnerEmails(partner, []));
  assert.throws(() => selectPartnerEmails(partner, ["autre@example.fr"]));
  assert.throws(() => selectPartnerEmails(partner, "livraison@example.fr"));
});

function loadMailer({ rejected = [], override = "" } = {}) {
  const sourcePath = require.resolve("../lib/mailer");
  const localRequire = createRequire(sourcePath);
  const sent = [];
  const env = { SMTP_HOST: "smtp.invalid", SMTP_USER: "test", SMTP_PASSWORD: "fake-test-value", ORDER_TEST_EMAIL: override };
  // Le module destinataires partage uniquement cet environnement synthétique.
  const emailContext = vm.createContext({ module: { exports: {} }, process: { env } });
  vm.runInContext(fs.readFileSync(require.resolve("../lib/partner-emails"), "utf8"), emailContext);
  const context = vm.createContext({
    module: { exports: {} }, process: { env }, Intl,
    require: (name) => name === "nodemailer" ? {
      createTransport: () => ({ sendMail: async (mail) => { sent.push(mail); return { accepted: mail.to.filter((email) => !rejected.includes(email)), rejected }; } })
    } : name === "./partner-emails" ? emailContext.module.exports : localRequire(name)
  });
  vm.runInContext(fs.readFileSync(sourcePath, "utf8"), context);
  return { mailer: context.module.exports, sent };
}

test("les confirmations et réponses sont adressées à tous les contacts du même client", async () => {
  const { mailer, sent } = loadMailer();
  await mailer.sendOrderConfirmation({ partner, order, mode: "created" });
  await mailer.sendOrderReply({ partner, order, message: "Oui." });
  assert.equal(sent.length, 2);
  for (const mail of sent) assert.deepEqual(Array.from(mail.to), parseEmailList(partner.email));
});

test("la disponibilité part uniquement aux adresses cochées", async () => {
  const { mailer, sent } = loadMailer();
  await mailer.sendAvailabilityNotice({ partner, deliveryDate: order.deliveryDate, message: "Bonjour", recipients: ["livraison@example.fr"] });
  assert.deepEqual(Array.from(sent[0].to), ["livraison@example.fr"]);
  await assert.rejects(() => mailer.sendAvailabilityNotice({ partner, deliveryDate: order.deliveryDate, recipients: [] }));
  assert.equal(sent.length, 1);
});

test("la redirection du client de test reste isolée des vrais contacts pour les commandes", async () => {
  const { mailer, sent } = loadMailer({ override: "test@example.invalid" });
  await mailer.sendOrderConfirmation({ partner: { ...partner, id: "client-test" }, order });
  assert.deepEqual(Array.from(sent[0].to), ["test@example.invalid"]);
});

test("un refus SMTP partiel ne produit pas un faux succès global", async () => {
  const { mailer } = loadMailer({ rejected: ["livraison@example.fr"] });
  const result = await mailer.sendOrderConfirmation({ partner, order });
  assert.equal(result.sent, false);
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.rejectedCount, 1);
});

async function availabilityRequest(recipients, admin = true) {
  const sent = [];
  const sourcePath = require.resolve("../pages/api/availability.js");
  const mocks = {
    "@/lib/db": { getPartners: async () => [partner], getAvailabilityMessage: async () => "Bonjour" },
    "@/lib/auth": { isAdmin: () => admin },
    "@/lib/schedule": {},
    "@/lib/availability-scope": {},
    "@/lib/partner-emails": require("../lib/partner-emails"),
    "@/lib/mailer": { classifyMailError: () => "smtp-unknown", sendAvailabilityNotice: async (args) => { sent.push(args); return { sent: true }; } }
  };
  const context = vm.createContext({ module: { exports: {} }, require: (name) => { assert.ok(mocks[name], name); return mocks[name]; } });
  vm.runInContext(fs.readFileSync(sourcePath, "utf8").replace("export default async function handler", "async function handler") + "\nthis.handler = handler;", context);
  const result = {};
  const res = { setHeader() {}, status(code) { result.status = code; return this; }, json(data) { result.data = data; } };
  await context.handler({ method: "POST", query: {}, body: { action: "send-email", partnerId: partner.id, deliveryDate: order.deliveryDate, recipients } }, res);
  return { ...result, sent };
}

test("l'API refuse les adresses étrangères, la sélection vide et les envois non admin", async () => {
  for (const recipients of [[], ["autre@example.fr"], null]) {
    const result = await availabilityRequest(recipients);
    assert.equal(result.status, 400);
    assert.equal(result.sent.length, 0);
  }
  const result = await availabilityRequest(["livraison@example.fr"], false);
  assert.equal(result.status, 401);
  assert.equal(result.sent.length, 0);
});

test("l'API transmet le seul destinataire choisi et préserve l'ancien appel sans sélection", async () => {
  const selected = await availabilityRequest(["livraison@example.fr"]);
  assert.equal(selected.status, 200);
  assert.deepEqual(Array.from(selected.sent[0].recipients), ["livraison@example.fr"]);
  const legacy = await availabilityRequest(undefined);
  assert.equal(legacy.status, 200);
  assert.deepEqual(Array.from(legacy.sent[0].recipients), parseEmailList(partner.email));
});
