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

function itemLabel(item) {
  return `${item.productName}: ${formatNumber(item.quantity)} ${unitLabel(item.unit)}`;
}

function orderLines(order) {
  return order.items.map((item) => `- ${itemLabel(item)}`);
}

function buildChangeSummary(previousOrder, order) {
  if (!previousOrder) return [];

  const previousByProductId = new Map(previousOrder.items.map((item) => [item.productId, item]));
  const nextByProductId = new Map(order.items.map((item) => [item.productId, item]));
  const changes = [];

  for (const previousItem of previousOrder.items) {
    const nextItem = nextByProductId.get(previousItem.productId);
    if (!nextItem) {
      changes.push(`- ${previousItem.productName}: supprimé (${formatNumber(previousItem.quantity)} ${unitLabel(previousItem.unit)})`);
    } else if (Number(previousItem.quantity) !== Number(nextItem.quantity)) {
      changes.push(`- ${previousItem.productName}: ${formatNumber(previousItem.quantity)} ${unitLabel(previousItem.unit)} -> ${formatNumber(nextItem.quantity)} ${unitLabel(nextItem.unit)}`);
    }
  }

  for (const nextItem of order.items) {
    if (!previousByProductId.has(nextItem.productId)) {
      changes.push(`- ${nextItem.productName}: ajouté (${formatNumber(nextItem.quantity)} ${unitLabel(nextItem.unit)})`);
    }
  }

  if (Number(previousOrder.total) !== Number(order.total)) {
    changes.push(`- Total: ${formatCurrency(previousOrder.total)} -> ${formatCurrency(order.total)}`);
  }

  return changes.length ? changes : ["- Aucun changement de quantité détecté."];
}

function signatureText() {
  return [
    "À Travers Champs",
    "Ferme maraîchère",
    "ferme@atraverschamps73.fr",
    "https://atraverschamps73.fr"
  ];
}

function signatureHtml() {
  return `
    <hr style="border:0;border-top:1px solid #d8dfce;margin:24px 0 14px;">
    <p style="margin:0;"><strong>À Travers Champs</strong><br>
    Ferme maraîchère<br>
    <a href="mailto:ferme@atraverschamps73.fr">ferme@atraverschamps73.fr</a><br>
    <a href="https://atraverschamps73.fr">atraverschamps73.fr</a></p>
  `;
}

function buildOrderEmail({ partner, order, previousOrder, mode = "created" }) {
  const actionLabel = mode === "cancelled"
    ? "suppression de commande"
    : mode === "updated"
      ? "modification de commande"
      : "commande";
  const intro = mode === "cancelled"
    ? "Votre commande a été supprimée par l'équipe À Travers Champs."
    : mode === "updated"
      ? "Votre commande a été modifiée par l'équipe À Travers Champs."
      : "Votre commande a bien été prise en compte.";
  const recapLabel = mode === "cancelled" ? "Commande supprimée:" : "Récapitulatif:";
  const closing = mode === "cancelled"
    ? "Si besoin, contactez-nous directement pour ajuster une nouvelle commande."
    : "Merci pour votre commande.";
  const previousLines = previousOrder ? orderLines(previousOrder) : [];
  const lines = orderLines(order);
  const changes = mode === "updated" ? buildChangeSummary(previousOrder, order) : [];

  const textParts = [
    `Bonjour ${partner.name},`,
    "",
    intro,
    "",
    `Livraison prévue le ${formatDate(order.deliveryDate)}.`,
    "",
  ];

  if (mode === "updated" && previousOrder) {
    textParts.push(
      "Commande initiale:",
      ...previousLines,
      "",
      `Ancien total: ${formatCurrency(previousOrder.total)}`,
      "",
      "Modifications:",
      ...changes,
      "",
      "Commande modifiée:",
      ...lines
    );
  } else {
    textParts.push(recapLabel, ...lines);
  }

  textParts.push("", `Total estimé: ${formatCurrency(order.total)}`, "", closing, "", ...signatureText());
  const text = textParts.join("\n");

  const htmlLines = order.items.map(
    (item) => `<li>${escapeHtml(item.productName)}: <strong>${formatNumber(item.quantity)} ${unitLabel(item.unit)}</strong></li>`
  ).join("");
  const previousHtmlLines = previousOrder ? previousOrder.items.map(
    (item) => `<li>${escapeHtml(item.productName)}: <strong>${formatNumber(item.quantity)} ${unitLabel(item.unit)}</strong></li>`
  ).join("") : "";
  const changeHtmlLines = changes.map((change) => `<li>${escapeHtml(change.replace(/^- /, ""))}</li>`).join("");

  const html = `
    <p>Bonjour ${escapeHtml(partner.name)},</p>
    <p>${intro}</p>
    <p>Livraison prévue le <strong>${formatDate(order.deliveryDate)}</strong>.</p>
    ${mode === "updated" && previousOrder ? `
      <p><strong>Commande initiale:</strong></p>
      <ul>${previousHtmlLines}</ul>
      <p>Ancien total: <strong>${formatCurrency(previousOrder.total)}</strong></p>
      <p><strong>Modifications:</strong></p>
      <ul>${changeHtmlLines}</ul>
      <p><strong>Commande modifiée:</strong></p>
      <ul>${htmlLines}</ul>
    ` : `
      <p>${recapLabel}</p>
      <ul>${htmlLines}</ul>
    `}
    <p>Total estimé: <strong>${formatCurrency(order.total)}</strong></p>
    <p>${closing}</p>
    ${signatureHtml()}
  `;

  return {
    subject: `Confirmation de ${actionLabel} - À Travers Champs`,
    text,
    html
  };
}

async function sendOrderConfirmation({ partner, order, previousOrder, mode }) {
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

  const message = buildOrderEmail({ partner, order, previousOrder, mode });
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
