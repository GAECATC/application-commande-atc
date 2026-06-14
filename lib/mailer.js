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

function unitLabel(unit, quantity = 1) {
  const labels = {
    kg: "kg",
    piece: Number(quantity) > 1 ? "pièces" : "pièce",
    unite: Number(quantity) > 1 ? "unités" : "unité",
    carton: Number(quantity) > 1 ? "cartons" : "carton"
  };
  return labels[unit] || unit;
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
  return `${item.productName}: ${formatNumber(item.quantity)} ${unitLabel(item.unit, item.quantity)} - ${formatCurrency(item.quantity * item.unitPrice)}`;
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
      changes.push(`- ${previousItem.productName}: supprimé (${formatNumber(previousItem.quantity)} ${unitLabel(previousItem.unit, previousItem.quantity)} - ${formatCurrency(previousItem.quantity * previousItem.unitPrice)})`);
    } else if (Number(previousItem.quantity) !== Number(nextItem.quantity)) {
      changes.push(`- ${previousItem.productName}: ${formatNumber(previousItem.quantity)} ${unitLabel(previousItem.unit, previousItem.quantity)} - ${formatCurrency(previousItem.quantity * previousItem.unitPrice)} -> ${formatNumber(nextItem.quantity)} ${unitLabel(nextItem.unit, nextItem.quantity)} - ${formatCurrency(nextItem.quantity * nextItem.unitPrice)}`);
    }
  }

  for (const nextItem of order.items) {
    if (!previousByProductId.has(nextItem.productId)) {
      changes.push(`- ${nextItem.productName}: ajouté (${formatNumber(nextItem.quantity)} ${unitLabel(nextItem.unit, nextItem.quantity)} - ${formatCurrency(nextItem.quantity * nextItem.unitPrice)})`);
    }
  }

  return changes.length ? changes : ["- Aucun changement de quantité détecté."];
}

function signatureText() {
  return [
    "Ferme À Travers Champs",
    "ferme@atraverschamps73.fr",
    "1215 Route de Verel de Montbel",
    "73330 Domessin",
    "www.atraverschamps73.fr"
  ];
}

function signatureHtml() {
  const logoUrl = process.env.ORDER_EMAIL_LOGO_URL || "https://commandes.atraverschamps73.fr/logo-email.jpg";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #d8dfce;padding-top:16px;">
      <tr>
        <td style="padding-right:22px;vertical-align:middle;">
          <img src="${logoUrl}" alt="À Travers Champs" width="130" style="display:block;width:130px;height:auto;border:0;">
        </td>
        <td style="vertical-align:middle;font-family:Arial, sans-serif;line-height:1.35;">
          <p style="margin:0 0 5px;color:#164225;font-size:18px;font-weight:700;">Ferme À Travers Champs</p>
          <p style="margin:0 0 3px;"><a href="mailto:ferme@atraverschamps73.fr" style="color:#ff7824;text-decoration:none;">ferme@atraverschamps73.fr</a></p>
          <p style="margin:0;color:#5d6a58;">1215 Route de Verel de Montbel<br>73330 Domessin</p>
          <p style="margin:5px 0 0;"><a href="https://atraverschamps73.fr" style="color:#ff7824;text-decoration:none;">www.atraverschamps73.fr</a></p>
        </td>
      </tr>
    </table>
  `;
}

function buildOrderEmail({ partner, order, previousOrder, mode = "created" }) {
  const isCancelled = mode === "cancelled" || mode === "cancelled-by-client";
  const isUpdated = mode === "updated" || mode === "updated-by-client";
  const actionLabel = isCancelled
    ? "suppression de commande"
    : isUpdated
      ? "modification de commande"
      : "commande";
  const intro = mode === "cancelled-by-client"
    ? "Nous vous confirmons que votre commande a bien été supprimée."
    : mode === "cancelled"
      ? "Votre commande a été supprimée par l'équipe À Travers Champs."
    : mode === "updated-by-client"
      ? "Votre modification a bien été prise en compte."
    : mode === "updated"
      ? "Votre commande a été modifiée par l'équipe À Travers Champs."
      : "Votre commande a bien été prise en compte.";
  const recapLabel = isCancelled ? "Commande supprimée:" : "Récapitulatif:";
  const closing = isCancelled
    ? "Nous sommes à votre disposition si vous souhaitez passer une nouvelle commande."
    : "Merci pour votre commande.";
  const previousLines = previousOrder ? orderLines(previousOrder) : [];
  const lines = orderLines(order);
  const changes = isUpdated ? buildChangeSummary(previousOrder, order) : [];

  const textParts = [
    `Bonjour ${partner.name},`,
    "",
    intro,
    "",
    `Livraison prévue le ${formatDate(order.deliveryDate)}.`,
    "",
  ];

  if (isUpdated && previousOrder) {
    textParts.push(
      "Commande initiale:",
      ...previousLines,
      "",
      `Total: ${formatCurrency(previousOrder.total)}`,
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

  const totalLabel = isUpdated ? "Nouveau total" : isCancelled ? "Total de la commande supprimée" : "Total estimé";
  textParts.push("", `${totalLabel}: ${formatCurrency(order.total)}`, "", closing, "", ...signatureText());
  const text = textParts.join("\n");

  const htmlLines = order.items.map(
    (item) => `<li>${escapeHtml(item.productName)}: <strong>${formatNumber(item.quantity)} ${unitLabel(item.unit, item.quantity)} - ${formatCurrency(item.quantity * item.unitPrice)}</strong></li>`
  ).join("");
  const previousHtmlLines = previousOrder ? previousOrder.items.map(
    (item) => `<li>${escapeHtml(item.productName)}: <strong>${formatNumber(item.quantity)} ${unitLabel(item.unit, item.quantity)} - ${formatCurrency(item.quantity * item.unitPrice)}</strong></li>`
  ).join("") : "";
  const changeHtmlLines = changes.map((change) => `<li>${escapeHtml(change.replace(/^- /, ""))}</li>`).join("");

  const html = `
    <p>Bonjour ${escapeHtml(partner.name)},</p>
    <p>${intro}</p>
    <p>Livraison prévue le <strong>${formatDate(order.deliveryDate)}</strong>.</p>
    ${isUpdated && previousOrder ? `
      <p><strong>Commande initiale:</strong></p>
      <ul>${previousHtmlLines}</ul>
      <p>Total: <strong>${formatCurrency(previousOrder.total)}</strong></p>
      <p><strong>Modifications:</strong></p>
      <ul>${changeHtmlLines}</ul>
      <p><strong>Commande modifiée:</strong></p>
      <ul>${htmlLines}</ul>
    ` : `
      <p>${recapLabel}</p>
      <ul>${htmlLines}</ul>
    `}
    <p>${totalLabel}: <strong>${formatCurrency(order.total)}</strong></p>
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
