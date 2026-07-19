import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export default function ClientHistory() {
  const [partner, setPartner] = useState(null);
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState("Chargement...");

  useEffect(() => {
    queueMicrotask(async () => {
      const saved = localStorage.getItem("atc-partner");
      if (!saved) {
        setMessage("Connectez-vous au portail client pour consulter votre historique.");
        return;
      }

      try {
        const session = JSON.parse(saved);
        setPartner(session.partner);
        const response = await fetch(`/api/orders?history=true&partnerId=${encodeURIComponent(session.partnerId)}&code=${encodeURIComponent(session.code)}`);
        const data = await response.json();
        if (!response.ok) {
          setOrders([]);
          setMessage(data.error || "Impossible de charger l'historique.");
          return;
        }
        setOrders(data.orders || []);
        setMessage("");
      } catch {
        localStorage.removeItem("atc-partner");
        setMessage("Session client invalide. Reconnectez-vous au portail client.");
      }
    });
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-lockup">
          <Image className="brand-logo" src="/logo-atc.jpg" alt="GAEC à travers champs" width={80} height={75} priority />
          <div>
            <p className="eyebrow">{partner?.name || "Client"}</p>
            <h1>Historique des commandes</h1>
          </div>
        </div>
        <Link className="link-button" href="/">Retour commande</Link>
      </header>

      <section className="panel">
        {message ? <p className="notice">{message}</p> : <OrderList orders={orders} />}
      </section>
    </main>
  );
}

function OrderList({ orders }) {
  if (!orders.length) return <p>Aucune commande enregistrée.</p>;

  return (
    <div className="orders-list">
      {orders.map((order) => (
        <article className="order-card" key={order.id}>
          <div>
            <strong>Commande du {new Date(order.createdAt).toLocaleString("fr-FR")}</strong>
            <span>Livraison {formatDate(order.deliveryDate)}</span>
            <span className={`status-pill ${order.status}`}>{statusLabel(order.status)}</span>
          </div>
          <ul>
            {order.items.map((item) => (
              <li key={item.id}>{formatNumber(item.quantity)} {unitLabel(item.unit)} - {item.productName}</li>
            ))}
          </ul>
          {order.comment && <p className="order-comment"><strong>Commentaire :</strong> {order.comment}</p>}
          <strong>{currency.format(order.total)}</strong>
        </article>
      ))}
    </div>
  );
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date(`${value}T12:00:00`)) : "";
}

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

function unitLabel(unit) {
  return ({ kg: "kg", piece: "pièce", unite: "unité", carton: "carton" })[unit] || unit;
}

function statusLabel(status) {
  return ({ active: "En cours", cancelled: "Annulée", validated: "Validée" })[status] || status;
}
