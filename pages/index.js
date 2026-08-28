import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
const { PRODUCT_CATEGORIES } = require("@/lib/product-categories");
const { MAX_ORDER_COMMENT_LENGTH } = require("@/lib/order-comment");

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export default function ClientPortal({ initialSession }) {
  const [session, setSession] = useState(initialSession);
  const [products, setProducts] = useState([]);
  const [baskets, setBaskets] = useState([]);
  const [basketQuantities, setBasketQuantities] = useState({});
  const [partnerId, setPartnerId] = useState("");
  const [code, setCode] = useState("");
  const [partner, setPartner] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [orders, setOrders] = useState([]);
  const [editingOrder, setEditingOrder] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const catalogRef = useRef(null);

  useEffect(() => {
    if (initialSession) return;
    async function load() {
      const sessionRes = await fetch("/api/session");
      const sessionData = await sessionRes.json();
      setSession(sessionData);
    }
    load().catch(() => setMessage("Impossible de charger le catalogue."));
  }, [initialSession]);

  const grouped = useMemo(() => {
    const groups = products.reduce((acc, product) => {
      acc[product.category] = acc[product.category] || [];
      acc[product.category].push(product);
      return acc;
    }, {});
    for (const categoryProducts of Object.values(groups)) {
      categoryProducts.sort((productA, productB) =>
        productA.name.localeCompare(productB.name, "fr", { sensitivity: "base", numeric: true })
      );
    }
    return Object.fromEntries(
      Object.entries(groups).sort(([categoryA], [categoryB]) => {
        const indexA = PRODUCT_CATEGORIES.indexOf(categoryA);
        const indexB = PRODUCT_CATEGORIES.indexOf(categoryB);
        if (indexA === -1 && indexB === -1) return categoryA.localeCompare(categoryB, "fr");
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      })
    );
  }, [products]);

  const basketTotal = baskets.reduce((sum, basket) => {
    const count = Number(basketQuantities[basket.id] || 0);
    return sum + count * basket.items.reduce((basketSum, item) => {
      const product = products.find((entry) => entry.id === item.productId);
      return basketSum + Number(item.quantity) * Number(item.unitPrice ?? product?.price ?? 0);
    }, 0);
  }, 0);
  const total = products.reduce((sum, product) => sum + (Number(quantities[product.id]) || 0) * product.price, 0) + basketTotal;
  const selectedItems = products
    .map((product) => ({ ...product, quantity: Number(quantities[product.id]) || 0 }))
    .filter((product) => product.quantity > 0);

  async function loadProducts(nextPartnerId, nextCode) {
    const response = await fetch(`/api/products?partnerId=${encodeURIComponent(nextPartnerId)}`, { headers: { "x-partner-code": nextCode } });
    const data = await response.json();
    if (!response.ok) {
      setProducts([]);
      setMessage(data.error || "Impossible de charger le catalogue.");
      return;
    }
    setProducts(data.products || []);
    setAvailabilityMessage(data.availabilityMessage || "");
    if (data.delivery) {
      setSession((current) => ({ ...(current || {}), delivery: data.delivery }));
    }
  }

  async function loadOrders(nextPartnerId, nextCode) {
    const response = await fetch(`/api/orders?partnerId=${encodeURIComponent(nextPartnerId)}`, { headers: { "x-partner-code": nextCode } });
    const data = await response.json();
    if (!response.ok) {
      setOrders([]);
      setMessage(data.error || "Impossible de charger les commandes.");
      return;
    }
    setOrders(data.orders || []);
  }

  async function loadBaskets(nextPartnerId, nextCode) {
    try {
      const response = await fetch(`/api/baskets?partnerId=${encodeURIComponent(nextPartnerId)}`, { headers: { "x-partner-code": nextCode } });
      const data = await response.json();
      setBaskets(response.ok ? (data.baskets || []) : []);
    } catch {
      setBaskets([]);
    }
  }

  async function login(event) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "partner", partnerId, code })
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Connexion refusee.");
    setPartner(data.partner);
    localStorage.setItem("atc-partner", JSON.stringify({ partnerId, code, partner: data.partner }));
    await Promise.all([loadProducts(partnerId, code), loadOrders(partnerId, code), loadBaskets(partnerId, code)]);
  }

  useEffect(() => {
    const saved = localStorage.getItem("atc-partner");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      queueMicrotask(() => {
        setPartnerId(parsed.partnerId);
        setCode(parsed.code);
        setPartner(parsed.partner);
        loadProducts(parsed.partnerId, parsed.code);
        loadOrders(parsed.partnerId, parsed.code);
        loadBaskets(parsed.partnerId, parsed.code);
      });
    } catch {
      localStorage.removeItem("atc-partner");
    }
  }, []);

  async function submitOrder() {
    setLoading(true);
    setMessage("");
    const mergedQuantities = Object.fromEntries(Object.entries(quantities).map(([productId, quantity]) => [productId, Number(quantity) || 0]));
    for (const basket of baskets) {
      const count = Number(basketQuantities[basket.id] || 0);
      if (count <= 0) continue;
      for (const item of basket.items) {
        mergedQuantities[item.productId] = (mergedQuantities[item.productId] || 0) + Number(item.quantity) * count;
      }
    }
    const items = Object.entries(mergedQuantities).map(([productId, quantity]) => ({ productId, quantity }));
    const basketSelections = baskets
      .map((basket) => ({ basketId: basket.id, quantity: Number(basketQuantities[basket.id] || 0) }))
      .filter((basket) => basket.quantity > 0);
    const isEditing = Boolean(editingOrder);
    const response = await fetch("/api/orders", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: editingOrder?.id, partnerId, code, items, comment, basketSelections })
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return setMessage(data.error || "Commande refusee.");
    setQuantities({});
    setBasketQuantities({});
    setComment("");
    setCommentOpen(false);
    setEditingOrder(null);
    await loadOrders(partnerId, code);
    const deliveryDate = data.delivery?.deliveryDate || data.order?.deliveryDate;
    setMessage(`${isEditing ? "Commande modifiée" : "Commande enregistrée"} pour le ${formatDate(deliveryDate)}.`);
  }

  function editOrder(order) {
    const nextQuantities = {};
    for (const item of order.items) {
      nextQuantities[item.productId] = String(item.quantity);
    }
    setEditingOrder(order);
    setQuantities(nextQuantities);
    setComment(order.comment || "");
    setCommentOpen(Boolean(order.comment));
    setMessage("");
    requestAnimationFrame(() => {
      catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function clearDraft() {
    setEditingOrder(null);
    setQuantities({});
    setBasketQuantities({});
    setComment("");
    setCommentOpen(false);
    setMessage("");
  }

  async function deleteOrder(order) {
    if (!window.confirm("Supprimer cette commande ?")) return;

    setLoading(true);
    setMessage("");
    const response = await fetch("/api/orders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id, partnerId, code })
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return setMessage(data.error || "Suppression refusee.");

    if (editingOrder?.id === order.id) clearDraft();
    await loadOrders(partnerId, code);
    setMessage("Commande supprimée.");
  }

  if (!session) return <main className="shell"><p>Chargement...</p></main>;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-lockup">
          <Image className="brand-logo" src="/logo-atc.jpg" alt="GAEC à travers champs" width={80} height={75} priority />
          <div>
          <h1>Portail commandes pro</h1>
          </div>
        </div>
        <Link className="link-button" href="/admin">Admin</Link>
      </header>

      <section className="status-band">
        <div>
          <span className="badge">{session.delivery.label}</span>
          <h2>Livraison prévue le {formatDate(session.delivery.deliveryDate)}</h2>
          <p>Commande attendue au plus tard {session.delivery.cutoffLabel}.</p>
        </div>
      </section>

      {!partner ? (
        <form className="panel login-panel" onSubmit={login}>
          <h2>Connexion partenaire</h2>
          <label>
            Identifiant
            <input
              value={partnerId}
              onChange={(event) => setPartnerId(event.target.value)}
              placeholder="Identifiant"
              autoComplete="username"
            />
          </label>
          <label>
            Code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Code"
              autoComplete="current-password"
            />
          </label>
          <button className="primary" type="submit">Se connecter</button>
          {message && <p className="notice">{message}</p>}
        </form>
      ) : (
        <>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Client</p>
              <h2>{partner.name}</h2>
            </div>
            <div className="actions">
              <Link className="link-button" href="/historique">Historique des commandes</Link>
              <button className="ghost" onClick={() => { localStorage.removeItem("atc-partner"); setPartner(null); setProducts([]); setOrders([]); clearDraft(); }}>
                Déconnexion
              </button>
            </div>
          </div>

          {availabilityMessage && <section className="panel client-availability-message">
            <p className="eyebrow">Message de la ferme</p>
            <p>{availabilityMessage}</p>
          </section>}

          <section className="panel order-recap">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{editingOrder ? "Modification en cours" : "Commande en cours"}</p>
                <h2>Récapitulatif</h2>
              </div>
              {editingOrder && <button className="ghost" type="button" onClick={clearDraft}>Annuler</button>}
            </div>
            {editingOrder && (
              <div className="edit-guidance">
                <strong>Modification en cours</strong>
                <span>Ajustez les quantités directement dans le catalogue ci-dessous, puis cliquez sur “Enregistrer les modifications”.</span>
                <a href="#catalogue">↓ Catalogue</a>
              </div>
            )}
            {selectedItems.length ? (
              <ul className="recap-list">
                {selectedItems.map((item) => (
                  <li key={item.id}>
                    <span>{item.name}</span>
                    <strong>{formatNumber(item.quantity)} {unitLabel(item.unit)}</strong>
                    <small>{currency.format(item.quantity * item.price)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aucun produit sélectionné.</p>
            )}
          </section>

          {baskets.length > 0 && !editingOrder && (
            <section className="panel basket-order-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Paniers composés</p>
                  <h2>Commander des paniers</h2>
                  <p className="section-note">Indiquez uniquement le nombre de paniers souhaité. Les quantités de produits sont calculées automatiquement.</p>
                </div>
              </div>
              <div className="basket-client-grid">
                {baskets.map((basket) => (
                  <article className="basket-client-card" key={basket.id}>
                    <div className="basket-client-content">
                      <div className="basket-client-heading">
                        <h3>{basket.name}</h3>
                        <strong>{currency.format(basket.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice || 0), 0))} / panier</strong>
                      </div>
                      <div className="basket-client-items">
                        {basket.items.map((item) => {
                          const product = products.find((entry) => entry.id === item.productId);
                          const unit = item.unit || product?.unit;
                          const unitPrice = Number(item.unitPrice ?? product?.price ?? 0);
                          return <div className="basket-client-item" key={item.productId}>
                            <span className="basket-item-name">{item.productName || product?.name || item.productId}</span>
                            <span className="basket-item-quantity">{formatNumber(item.quantity)} {unitLabel(unit)}</span>
                            <span className="basket-item-unit-price">{currency.format(unitPrice)} / {unitLabel(unit)}</span>
                            <strong>{currency.format(Number(item.quantity) * unitPrice)}</strong>
                          </div>;
                        })}
                      </div>
                    </div>
                    <div className="basket-client-order-row">
                      <label>
                        Nombre de paniers
                        <input type="number" min="0" step="1" value={basketQuantities[basket.id] || ""} onChange={(event) => setBasketQuantities((current) => ({ ...current, [basket.id]: event.target.value }))} />
                      </label>
                      {Number(basketQuantities[basket.id] || 0) > 0 && <strong className="basket-client-subtotal">Sous-total : {currency.format(Number(basketQuantities[basket.id]) * basket.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice || 0), 0))}</strong>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="panel order-recap">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Commande enregistrée</p>
                <h2>Vos commandes en cours</h2>
              </div>
              <button className="ghost" type="button" onClick={() => loadOrders(partnerId, code)}>Actualiser</button>
            </div>
            {orders.length ? (
              <div className="orders-list">
                {orders.map((order) => (
                  <article className="order-card" key={order.id}>
                    <div>
                      <strong>Commande du {new Date(order.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</strong>
                      <span>Livraison {formatDate(order.deliveryDate)}</span>
                    </div>
                    <ul>
                      {order.items.map((item) => (
                        <li key={item.id}>{formatNumber(item.quantity)} {unitLabel(item.unit)} - {item.productName}</li>
                      ))}
                    </ul>
                    {order.comment && <p className="order-comment"><strong>Commentaire :</strong> {order.comment}</p>}
                    <div className="order-actions">
                      <strong>{currency.format(order.total)}</strong>
                      <button className="ghost" type="button" onClick={() => editOrder(order)}>Modifier</button>
                      <button className="danger" type="button" onClick={() => deleteOrder(order)}>Supprimer</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p>Aucune commande enregistrée pour le moment.</p>
            )}
          </section>

          <div className="section-heading catalog-heading" id="catalogue" ref={catalogRef}>
            <div>
              <p className="eyebrow">Catalogue</p>
              <h2>Produits disponibles</h2>
            </div>
            <div className="segmented" aria-label="Affichage catalogue">
              <button
                className={viewMode === "list" ? "active" : ""}
                type="button"
                onClick={() => setViewMode("list")}
              >
                Lignes
              </button>
              <button
                className={viewMode === "grid" ? "active" : ""}
                type="button"
                onClick={() => setViewMode("grid")}
              >
                Blocs
              </button>
            </div>
          </div>

          {Object.entries(grouped).map(([category, items]) => (
            <section key={category} className="catalog-section">
              <h3>{category}</h3>
              <div className={viewMode === "list" ? "product-list" : "product-grid"}>
                {items.map((product) => (
                  <article className="product-card" key={product.id}>
                    <div>
                      <h4>{product.name}</h4>
                      <p>{currency.format(product.price)} / {unitLabel(product.unit)}</p>
                      <span className="stock">{stockLabel(product)}</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={hasStockLimit(product) ? product.stock : undefined}
                      step={product.unit === "kg" ? "0.5" : "1"}
                      value={quantities[product.id] || ""}
                      onChange={(event) => setQuantities((current) => ({ ...current, [product.id]: event.target.value }))}
                      aria-label={`Quantite ${product.name}`}
                    />
                  </article>
                ))}
              </div>
            </section>
          ))}

          <aside className="checkout">
            <div className={`order-comment-field ${commentOpen ? "open" : ""}`}>
              <button className="comment-toggle ghost" type="button" onClick={() => setCommentOpen((current) => !current)}>
                💬 {comment ? "Modifier le commentaire" : "Ajouter un commentaire"}
              </button>
              <label className="order-comment-editor">
                Commentaire pour votre commande <small>(facultatif)</small>
                <textarea
                  value={comment}
                  maxLength={MAX_ORDER_COMMENT_LENGTH}
                  rows="3"
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Exemple : merci de préparer les produits dans deux cagettes séparées."
                />
                <small>{comment.length}/{MAX_ORDER_COMMENT_LENGTH} caractères</small>
              </label>
            </div>
            <div className="checkout-total">
              <strong>Total estimé</strong>
              <span>{currency.format(total)}</span>
            </div>
            <button className="primary" disabled={loading || total <= 0} onClick={submitOrder}>
              {loading ? "Envoi..." : editingOrder ? "Enregistrer les modifications" : "Valider la commande"}
            </button>
          </aside>
          {message && <p className="notice">{message}</p>}
        </>
      )}
    </main>
  );
}

export async function getServerSideProps() {
  const { getNextDelivery } = require("@/lib/schedule");

  return {
    props: {
      initialSession: {
        delivery: getNextDelivery()
      }
    }
  };
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

function hasStockLimit(product) {
  return Number(product.stock) > 0;
}

function stockLabel(product) {
  if (!hasStockLimit(product)) return "Disponibilité : à volonté";
  return `Disponibilité : ${formatNumber(product.stock)} ${unitLabel(product.unit)}`;
}
