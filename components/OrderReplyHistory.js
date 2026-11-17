export default function OrderReplyHistory({ replies = [] }) {
  if (!replies.length) return null;
  const labels = { sent: "Mail envoyé", failed: "Mail non envoyé", unknown: "Envoi non confirmé", pending: "Envoi en cours ou interrompu — à vérifier" };
  return <div className="order-reply-history">
    <strong>Réponses de la ferme</strong>
    {replies.map((reply) => <article className="order-reply-record" key={reply.id}>
      <div><time dateTime={reply.createdAt}>{new Date(reply.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</time> · <strong>{labels[reply.emailStatus] || "Envoi à vérifier"}</strong></div>
      <p>{reply.message}</p>
      {reply.comment && <details><summary>Commentaire auquel nous avons répondu</summary><p>{reply.comment}</p></details>}
    </article>)}
  </div>;
}
