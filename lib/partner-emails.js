// Le champ historique partners.email est conservé (varchar(255) en MySQL).
const MAX_PARTNER_EMAILS_LENGTH = 255;

function parseEmailList(value) {
  if (typeof value !== "string") return [];
  const seen = new Set();
  return value.split(/[,;\r\n]+/).map((email) => email.trim()).filter((email) => {
    const key = email.toLowerCase();
    if (!email || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePartnerEmails(value) {
  if (typeof value !== "string") throw new Error("Liste d’adresses e-mail invalide");
  const emails = parseEmailList(value);
  if (emails.some((email) => email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(email))) {
    throw new Error("Une des adresses e-mail du client est invalide");
  }
  const normalized = emails.join(", ");
  if (normalized.length > MAX_PARTNER_EMAILS_LENGTH) throw new Error("La liste des adresses e-mail dépasse 255 caractères. Réduisez le nombre d’adresses.");
  return normalized;
}

function selectPartnerEmails(partner, requested) {
  const allowed = parseEmailList(normalizePartnerEmails(partner?.email || ""));
  if (requested === undefined) return allowed;
  if (!Array.isArray(requested) || !requested.length || requested.some((email) => typeof email !== "string")) {
    throw new Error("Sélectionnez au moins une adresse e-mail pour ce client");
  }
  const selected = parseEmailList(requested.join(","));
  if (!selected.length || selected.some((email) => !allowed.some((saved) => saved.toLowerCase() === email.toLowerCase()))) {
    throw new Error("Une adresse sélectionnée n’appartient pas à ce client. Enregistrez les clients puis actualisez la sélection.");
  }
  return allowed.filter((saved) => selected.some((email) => saved.toLowerCase() === email.toLowerCase()));
}

function orderEmailRecipients(partner) {
  return partner?.id === "client-test" && process.env.ORDER_TEST_EMAIL
    ? parseEmailList(normalizePartnerEmails(process.env.ORDER_TEST_EMAIL)) : selectPartnerEmails(partner);
}

module.exports = { MAX_PARTNER_EMAILS_LENGTH, parseEmailList, normalizePartnerEmails, selectPartnerEmails, orderEmailRecipients };
