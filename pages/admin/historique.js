import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export default function AdminHistory() {
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState("Chargement...");
  const [printDeliveryDate, setPrintDeliveryDate] = useState("");

  const ordersByDeliveryDate = useMemo(() => {
    const groups = new Map();
    for (const order of orders) {
      const key = order.deliveryDate;
      const group = groups.get(key) || { orders: [], totals: new Map() };
      group.orders.push(order);
      if (order.status !== "cancelled") {
        for (const item of order.items) {
          const totalKey = `${item.productId}:${item.unit}`;
          const current = group.totals.get(totalKey) || {
            productId: item.productId,
            productName: item.productName,
            category: item.category,
            unit: item.unit,
            quantity: 0
          };
          current.quantity += Number(item.quantity);
          group.totals.set(totalKey, current);
        }
      }
      groups.set(key, group);
    }
    return Array.from(groups.entries())
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([deliveryDate, group]) => ({
        deliveryDate,
        orders: group.orders.sort((orderA, orderB) =>
          (orderA.partnerName || orderA.partnerId).localeCompare(orderB.partnerName || orderB.partnerId, "fr")
        ),
        totals: Array.from(group.totals.values()).sort((itemA, itemB) =>
          (itemA.category || "").localeCompare(itemB.category || "", "fr")
          || itemA.productName.localeCompare(itemB.productName, "fr")
        )
      }));
  }, [orders]);

  useEffect(() => {
    const resetPrintSelection = () => setPrintDeliveryDate("");
    window.addEventListener("afterprint", resetPrintSelection);
    return () => window.removeEventListener("afterprint", resetPrintSelection);
  }, []);

  function printDelivery(deliveryDate) {
    setPrintDeliveryDate(deliveryDate);
    window.setTimeout(() => window.print(), 0);
  }

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
      <header className="topbar no-print">
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

      <section className="panel history-print-report">
        {message ? (
          <p className="notice">{message}</p>
        ) : ordersByDeliveryDate.length ? (
          <div className="history-delivery-groups">
            {ordersByDeliveryDate.map((deliveryGroup) => {
              const effectiveOrders = deliveryGroup.orders.filter((order) => order.status !== "cancelled");
              return (
              <section
                className={`history-delivery-group ${printDeliveryDate && printDeliveryDate !== deliveryGroup.deliveryDate ? "print-excluded" : ""}`}
                key={deliveryGroup.deliveryDate}
              >
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Récapitulatif de livraison</p>
                    <h2>{formatDate(deliveryGroup.deliveryDate)}</h2>
                  </div>
                  <div className="actions">
                    <span className="badge">
                      {effectiveOrders.length} commande{effectiveOrders.length > 1 ? "s" : ""}
                    </span>
                    <button className="primary no-print" type="button" onClick={() => printDelivery(deliveryGroup.deliveryDate)}>
                      Imprimer cette livraison
                    </button>
                  </div>
                </div>

                <h3>Totaux à préparer</h3>
                <div className="summary-grid">
                  {deliveryGroup.totals.length ? deliveryGroup.totals.map((item) => (
                    <article className="summary-row" key={`${item.productId}-${item.unit}`}>
                      <span>{item.productName}</span>
                      <strong>{formatNumber(item.quantity)} {unitLabel(item.unit)}</strong>
                      <small>{item.category}</small>
                    </article>
                  )) : <p>Aucune quantité à préparer pour cette livraison.</p>}
                </div>

                <h3>Commandes par client</h3>
                <div className="orders-list">
                  {deliveryGroup.orders.map((order) => (
                    <article className="order-card" key={order.id}>
                      <div>
                        <strong>{order.partnerName || order.partnerId}</strong>
                        <strong>Commande du {new Date(order.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</strong>
                        <span className={`status-pill ${order.status}`}>{statusLabel(order.status)}</span>
                      </div>
                      <ul>
                        {order.items.map((item) => (
                          <li key={item.id}>{formatNumber(item.quantity)} {unitLabel(item.unit)} - {item.productName}</li>
                        ))}
                      </ul>
                      {order.comment && <p className="order-comment"><strong>Commentaire client :</strong> {order.comment}</p>}
                      <div className="history-order-footer">
                        <strong>{currency.format(order.total)}</strong>
                        {order.status === "validated" && <Link className="ghost no-print" href={`/admin/bon-livraison?orderId=${encodeURIComponent(order.id)}`} target="_blank">
                          Réimprimer le bon de livraison
                        </Link>}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              );
            })}
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
