import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export default function AdminHistory() {
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState("Chargement...");

  const ordersByPartner = useMemo(() => {
    const groups = new Map();
    for (const order of orders) {
      const key = order.partnerName || order.partnerId;
      const group = groups.get(key) || [];
      group.push(order);
      groups.set(key, group);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [orders]);

  const loadHistory = useCallback(async (pass) => {
    const response = await fetch("/api/orders?history=true", {
      headers: { "x-admin-password": pass }
    });
    const data = await response.json();
    if (!response.ok) {
      setOrders([]);
      setMessage(data.error || "Impossible de charger l'historique.");
      return;
    }
    setOrders(data.orders || []);
    setMessage("");
  }, []);

  useEffect(() => {
    queueMicrotask(async () => {
      const saved = localStorage.getItem("atc-admin-password");
      if (!saved) {
        setMessage("Connectez-vous à l'espace administrateur pour consulter l'historique.");
        return;
      }

      setPassword(saved);
      await loadHistory(saved);
    });
  }, [loadHistory]);

  return (
    <main className="shell admin-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <Image className="brand-logo" src="/logo-atc.jpg" alt="GAEC à travers champs" width={80} height={75} priority />
          <div>
            <p className="eyebrow">Administration</p>
            <h1>Historique des commandes</h1>
          </div>
        </div>
        <div className="actions">
          <button className="ghost" type="button" onClick={() => loadHistory(password)}>Actualiser</button>
          <Link className="link-button" href="/admin">Retour admin</Link>
        </div>
      </header>

      <section className="panel">
        {message ? (
          <p className="notice">{message}</p>
        ) : ordersByPartner.length ? (
          <div className="history-groups">
            {ordersByPartner.map(([partnerName, partnerOrders]) => (
              <section className="history-group" key={partnerName}>
                <div className="section-heading">
                  <h2>{partnerName}</h2>
                  <span className="badge">{partnerOrders.length} commande{partnerOrders.length > 1 ? "s" : ""}</span>
                </div>
                <div className="orders-list">
                  {partnerOrders.map((order) => (
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
                      <strong>{currency.format(order.total)}</strong>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p>Aucune commande enregistrée.</p>
        )}
      </section>
    </main>
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
