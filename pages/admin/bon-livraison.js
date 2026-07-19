import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import Link from "next/link";

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export default function DeliveryNote() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState([]);
  const [partners, setPartners] = useState([]);
  const [message, setMessage] = useState("Chargement...");

  const orderId = router.query.orderId;

  useEffect(() => {
    if (!router.isReady) return;
    const saved = localStorage.getItem("atc-admin-password") || "";
    setPassword(saved);
    if (!saved) {
      setMessage("Connexion admin requise. Retournez sur l'admin, connectez-vous, puis rouvrez ce bon.");
      return;
    }
    loadDeliveryNote(saved);
  }, [router.isReady, orderId]);

  async function loadDeliveryNote(adminPassword) {
    const headers = { "x-admin-password": adminPassword };
    const [ordersRes, partnersRes] = await Promise.all([
      fetch("/api/orders?history=true", { headers }),
      fetch("/api/partners", { headers })
    ]);

    const ordersData = await ordersRes.json();
    const partnersData = await partnersRes.json();
    if (!ordersRes.ok) return setMessage(ordersData.error || "Impossible de charger la commande.");
    if (!partnersRes.ok) return setMessage(partnersData.error || "Impossible de charger le client.");

    setOrders(ordersData.orders || []);
    setPartners(partnersData.partners || []);
    setMessage("");
  }

  const order = useMemo(
    () => orders.find((item) => item.id === orderId),
    [orders, orderId]
  );
  const partner = useMemo(
    () => partners.find((item) => item.id === order?.partnerId),
    [partners, order]
  );

  if (message) {
    return (
      <main className="delivery-note-shell">
        <p>{message}</p>
        <Link className="link-button" href="/admin">Retour admin</Link>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="delivery-note-shell">
        <p>Commande introuvable.</p>
        <Link className="link-button" href="/admin">Retour admin</Link>
      </main>
    );
  }

  const lines = order.items || [];

  return (
    <main className="delivery-note-shell">
      <div className="delivery-note-actions no-print">
        <Link className="ghost" href="/admin">Retour admin</Link>
        <button className="primary" type="button" onClick={() => window.print()}>Imprimer / PDF</button>
      </div>

      <article className="delivery-note">
        <header className="delivery-note-header">
          <div className="delivery-note-brand">
            <Image src="/logo-atc.jpg" alt="GAEC A Travers Champs" width={80} height={75} priority />
            <div>
              <p>GAEC A Travers Champs</p>
              <small>Bon de livraison a recopier dans E-Fac</small>
            </div>
          </div>
          <div className="delivery-note-title">
            <h1>Bon de livraison</h1>
            <p>{formatDeliveryDate(order.deliveryDate)}</p>
          </div>
        </header>

        <section className="delivery-note-meta">
          <div>
            <h2>Client</h2>
            <p><strong>{partner?.billingName || order.partnerName || partner?.name || order.partnerId}</strong></p>
            {partner?.billingAddress ? <p className="preserve-lines">{partner.billingAddress}</p> : <p>Adresse non renseignee</p>}
            {partner?.siret ? <p>SIRET : {partner.siret}</p> : null}
            {partner?.vatNumber ? <p>TVA : {partner.vatNumber}</p> : null}
          </div>
          <div>
            <h2>References</h2>
            <dl>
              <dt>Date de commande</dt>
              <dd>{formatDateTime(order.createdAt)}</dd>
              <dt>Date de livraison</dt>
              <dd>{formatDeliveryDate(order.deliveryDate)}</dd>
              <dt>Reference ATC</dt>
              <dd>{shortId(order.id)}</dd>
              <dt>Statut</dt>
              <dd>{statusLabel(order.status)}</dd>
            </dl>
          </div>
        </section>
        {order.comment && <p className="order-comment"><strong>Commentaire client :</strong> {order.comment}</p>}

        <table className="delivery-note-table">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Categorie</th>
              <th>Quantite</th>
              <th>Unite</th>
              <th>Prix HT</th>
              <th>Total HT</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((item) => (
              <tr key={item.id}>
                <td>{item.productName}</td>
                <td>{item.category}</td>
                <td className="numeric">{formatNumber(item.quantity)}</td>
                <td>{unitLabel(item.unit)}</td>
                <td className="numeric">{currency.format(item.unitPrice)}</td>
                <td className="numeric">{currency.format(item.quantity * item.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>Total HT a saisir</td>
              <td className="numeric">{currency.format(order.total)}</td>
            </tr>
          </tfoot>
        </table>

        <section className="delivery-note-copybox">
          <h2>Infos rapides pour E-Fac</h2>
          <div>
            <span>Client</span>
            <strong>{partner?.billingName || order.partnerName || partner?.name || order.partnerId}</strong>
          </div>
          <div>
            <span>Date</span>
            <strong>{formatShortDate(order.deliveryDate)}</strong>
          </div>
          <div>
            <span>Montant HT</span>
            <strong>{currency.format(order.total)}</strong>
          </div>
        </section>
      </article>
    </main>
  );
}

function formatDeliveryDate(value) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date(`${value}T12:00:00`)) : "";
}

function formatShortDate(value) {
  return value ? new Intl.DateTimeFormat("fr-FR").format(new Date(`${value}T12:00:00`)) : "";
}

function formatDateTime(value) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "";
}

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

function shortId(value) {
  return String(value || "").slice(0, 8).toUpperCase();
}

function statusLabel(status) {
  return ({ active: "A valider", validated: "Valide", cancelled: "Supprime" })[status] || status;
}

function unitLabel(unit) {
  return ({ kg: "kg", piece: "piece", unite: "unite", carton: "carton" })[unit] || unit;
}
