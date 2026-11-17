export default function PartnerEmailsEditor({ value = "", onChange, label = "E-mails du client" }) {
  const addresses = value.split(/[,;\r\n]/).map((email) => email.trimStart());
  const update = (index, email) => onChange(addresses.map((current, position) => position === index ? email : current).join("\n"));
  return <div className="partner-emails-editor">
    {addresses.map((email, index) => <div className="partner-email-line" key={index}>
      <input type="email" aria-label={`${label} — adresse ${index + 1}`} placeholder="email client" value={email} onChange={(event) => update(index, event.target.value)} />
      {addresses.length > 1 && <button className="ghost" type="button" aria-label={`Retirer l’adresse ${index + 1}`} onClick={() => onChange(addresses.filter((_, position) => position !== index).join("\n"))}>×</button>}
    </div>)}
    <button className="ghost" type="button" onClick={() => onChange(`${addresses.join("\n")}\n`)}>Ajouter une adresse</button>
    <small>255 caractères maximum au total.</small>
  </div>;
}
