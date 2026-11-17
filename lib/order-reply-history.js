const { randomUUID } = require("node:crypto");

// La trace est durable avant l'envoi. Une interruption laisse un état explicite,
// sans annoncer à tort un succès ni relancer automatiquement le mail.
async function sendReplyWithHistory({ order, partner, message, createReply, updateStatus, sendMail }) {
  const reply = {
    id: randomUUID(), message, comment: order.comment,
    recipient: partner.id === "client-test" && process.env.ORDER_TEST_EMAIL ? process.env.ORDER_TEST_EMAIL : partner.email || "",
    createdAt: new Date().toISOString(), emailStatus: "pending"
  };
  try {
    await createReply({ orderId: order.id, partnerId: partner.id, reply });
  } catch {
    return { status: 503, error: "La réponse n’a pas pu être enregistrée. Aucun mail envoyé. Vérifiez que le stockage des réponses a été installé." };
  }
  let email;
  try {
    email = await sendMail({ partner, order, message });
    reply.emailStatus = email.sent ? "sent" : "failed";
  } catch {
    email = { sent: false, reason: "unconfirmed" };
    reply.emailStatus = "unknown";
  }
  try {
    await updateStatus({ orderId: order.id, replyId: reply.id, emailStatus: reply.emailStatus });
  } catch {
    return { status: 502, reply: { ...reply, emailStatus: "pending" }, email,
      error: "La réponse est conservée, mais son statut n’a pas pu être enregistré. Vérifiez la messagerie avant tout nouvel envoi." };
  }
  const error = email.sent ? undefined : email.reason === "missing-recipient"
    ? "Réponse conservée, mais aucune adresse e-mail n’est renseignée pour ce client."
    : email.reason === "missing-smtp-config" ? "Réponse conservée, mais le service d’envoi des e-mails n’est pas configuré."
      : "Réponse conservée, mais l’envoi n’a pas été confirmé. Vérifiez la messagerie avant de réessayer pour éviter un doublon.";
  return { status: email.sent ? 200 : 502, reply, email, error };
}

module.exports = { sendReplyWithHistory };
