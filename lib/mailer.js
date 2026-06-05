const nodemailer = require("nodemailer");

function getMailConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.ORDER_EMAIL_FROM || user;

  if (!host || !user || !pass || !from) return null;
  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from
  };
}

function formatCurrency(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date(`${value}T12:00:00`));
}

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

function unitLabel(unit) {
  return ({ kg: "kg", piece: "pièce", unite: "unité", carton: "carton" })[unit] || unit;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildOrderEmail({ partner, order, mode = "created" }) {
  const actionLabel = mode === "updated" ? "modification" : "commande";
  const intro = mode === "updated"
    ? "Votre commande a bien été modifiée."
    : "Votre commande a bien été prise en compte.";

  const lines = order.items.map(
    (item) => `- ${item.productName}: ${formatNumber(item.quantity)} ${unitLabel(item.unit)}`
  );

  const text = [
    `Bonjour ${partner.name},`,
    "",
    intro,
    "",
    `Livraison prévue le ${formatDate(order.deliveryDate)}.`,
    "",
    "Récapitulatif:",
    ...lines,
    "",
    `Total estimé: ${formatCurrency(order.total)}`,
    "",
    "Merci pour votre commande.",
    "",
    "À Travers Champs"
  ].join("\n");

  const htmlLines = order.items.map(
    (item) => `<li>${escapeHtml(item.productName)}: <strong>${formatNumber(item.quantity)} ${unitLabel(item.unit)}</strong></li>`
  ).join("");

  const html = `
    <p>Bonjour ${escapeHtml(partner.name)},</p>
    <p>${intro}</p>
    <p>Livraison prévue le <strong>${formatDate(order.deliveryDate)}</strong>.</p>
    <p>Récapitulatif:</p>
    <ul>${htmlLines}</ul>
    <p>Total estimé: <strong>${formatCurrency(order.total)}</strong></p>
    <p>Merci pour votre commande.</p>
    <p>À Travers Champs</p>
  `;

  return {
    subject: `Confirmation de ${actionLabel} - À Travers Champs`,
    text,
    html
  };
}

async function sendOrderConfirmation({ partner, order, mode }) {
  const to = partner?.id === "client-test" && process.env.ORDER_TEST_EMAIL
    ? process.env.ORDER_TEST_EMAIL
    : partner?.email;

  if (!to) return { sent: false, skipped: true, reason: "missing-recipient" };

  const config = getMailConfig();
  if (!config) return { sent: false, skipped: true, reason: "missing-smtp-config" };

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth
  });

  const message = buildOrderEmail({ partner, order, mode });
  await transporter.sendMail({
    from: config.from,
    to,
    subject: message.subject,
    text: message.text,
    html: message.html
  });

  return { sent: true, skipped: false };
}

module.exports = { buildOrderEmail, sendOrderConfirmation };
