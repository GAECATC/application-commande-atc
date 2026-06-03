import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const emptyProduct = { name: "", category: "Légumes", unit: "kg", price: 0, stock: 0, active: true, sortOrder: 100 };

export default function Admin() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [priceLists, setPriceLists] = useState([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState("");
  const [draft, setDraft] = useState(emptyProduct);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [orderDraft, setOrderDraft] = useState({});
  const [message, setMessage] = useState("");

  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-admin-password": password }), [password]);

  useEffect(() => {
    const saved = localStorage.getItem("atc-admin-password");
    if (saved) queueMicrotask(() => setPassword(saved));
  }, []);

  async function login(event) {
    event.preventDefault();
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "admin", password })
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Connexion refusee.");
    localStorage.setItem("atc-admin-password", password);
    setAuthenticated(true);
    await loadAdminData(password);
  }

  async function loadAdminData(pass = password, forcedPriceListId = selectedPriceListId) {
    const adminHeaders = { "x-admin-password": pass };
    const sessionRes = await fetch("/api/session", { headers: adminHeaders });
    const sessionData = await sessionRes.json();
    const nextPriceLists = sessionData.priceLists || [];
    const nextPriceListId = forcedPriceListId || nextPriceLists[0]?.id || "";
    const [productRes, summaryRes] = await Promise.all([
      fetch(`/api/products?includeHidden=true&priceListId=${encodeURIComponent(nextPriceListId)}`, { headers: adminHeaders }),
      fetch("/api/summary", { headers: adminHeaders })
    ]);
    const productData = await productRes.json();
    const summaryData = await summaryRes.json();
    setPriceLists(nextPriceLists);
    setSelectedPriceListId(nextPriceListId);
    setProducts(productData.products || []);
    setSummary(summaryData);
  }

  async function saveProduct(product) {
    const response = await fetch("/api/products", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...product, priceListId: selectedPriceListId })
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Produit refuse.");
    setMessage("Catalogue mis a jour.");
    setDraft(emptyProduct);
    await loadAdminData();
  }

  function startEditOrder(order) {
    setEditingOrderId(order.id);
    setOrderDraft(Object.fromEntries(order.items.map((item) => [item.productId, String(item.quantity)])));
  }

  async function saveOrder(order) {
    const items = order.items.map((item) => ({
      productId: item.productId,
      quantity: Number(orderDraft[item.productId] || 0)
    }));
    const response = await fetch("/api/orders", {
      method: "PUT",
      headers,
      body: JSON.stringify({ orderId: order.id, partnerId: order.partnerId, items })
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Modification refusee.");
    setEditingOrderId(null);
    setOrderDraft({});
    setMessage("Commande modifiee.");
    await loadAdminData();
  }

  if (!authenticated) {
    return (
      <main className="shell">
        <header className="topbar">
          <div className="brand-lockup">
            <Image className="brand-logo" src="/logo-atc.jpg" alt="GAEC à travers champs" width={80} height={75} priority />
            <div>
            <p className="eyebrow">Ferme ATC</p>
            <h1>Espace administrateur</h1>
            </div>
          </div>
          <Link className="link-button" href="/">Portail client</Link>
        </header>
        <form className="panel login-panel" onSubmit={login}>
          <h2>Connexion admin</h2>
          <label>
            Mot de passe
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="primary" type="submit">Se connecter</button>
          {message && <p className="notice">{message}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="shell admin-shell">
      <header className="topbar no-print">
        <div className="brand-lockup">
          <Image className="brand-logo" src="/logo-atc.jpg" alt="GAEC à travers champs" width={80} height={75} priority />
          <div>
          <p className="eyebrow">Ferme ATC</p>
          <h1>Tableau de bord</h1>
          </div>
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => loadAdminData()}>Actualiser</button>
          <button className="primary" onClick={() => window.print()}>Imprimer / PDF</button>
        </div>
      </header>

      <section className="print-report">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Récapitulatif des récoltes</p>
            <h2>Total à préparer pour le {summary ? formatDate(summary.deliveryDate) : ""}</h2>
          </div>
          <span className="badge">{summary?.orders?.length || 0} commandes</span>
        </div>

        <div className="summary-grid">
          {summary?.totals?.length ? summary.totals.map((item) => (
            <article className="summary-row" key={`${item.productId}-${item.unit}`}>
              <span>{item.productName}</span>
              <strong>{formatNumber(item.quantity)} {unitLabel(item.unit)}</strong>
              <small>{item.category}</small>
            </article>
          )) : <p>Aucune commande en cours pour cette récolte.</p>}
        </div>

        <h3>Commandes par client</h3>
        <div className="orders-list">
          {summary?.orders?.map((order) => (
            <article className="order-card" key={order.id}>
              <div>
                <strong>{order.partnerName}</strong>
                <span>{new Date(order.createdAt).toLocaleString("fr-FR")}</span>
              </div>
              <ul>
                {order.items.map((item) => (
                  <li key={item.id}>{formatNumber(item.quantity)} {unitLabel(item.unit)} - {item.productName}</li>
                ))}
              </ul>
              {editingOrderId === order.id ? (
                <div className="order-edit no-print">
                  {order.items.map((item) => (
                    <label key={item.id}>
                      {item.productName}
                      <input
                        type="number"
                        min="0"
                        step={item.unit === "kg" ? "0.5" : "1"}
                        value={orderDraft[item.productId] || ""}
                        onChange={(event) => setOrderDraft((current) => ({ ...current, [item.productId]: event.target.value }))}
                      />
                    </label>
                  ))}
                  <div className="order-actions">
                    <button className="primary" type="button" onClick={() => saveOrder(order)}>Enregistrer</button>
                    <button className="ghost" type="button" onClick={() => setEditingOrderId(null)}>Annuler</button>
                  </div>
                </div>
              ) : (
                <div className="order-actions">
                  <strong>{currency.format(order.total)}</strong>
                  <button className="ghost no-print" type="button" onClick={() => startEditOrder(order)}>Modifier</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="panel no-print">
        <div className="section-heading">
          <div>
            <h2>Catalogue</h2>
            <label className="compact-label">
              Grille tarifaire
              <select
                value={selectedPriceListId}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setSelectedPriceListId(nextValue);
                  queueMicrotask(() => loadAdminData(password, nextValue));
                }}
              >
                {priceLists.map((priceList) => (
                  <option key={priceList.id} value={priceList.id}>{priceList.name}</option>
                ))}
              </select>
            </label>
          </div>
          {message && <p className="notice">{message}</p>}
        </div>
        <div className="product-editor product-editor-header">
          <span>Dénomination</span>
          <span>Type</span>
          <span>Unité</span>
          <span>Prix</span>
          <span>Volume disponible</span>
          <span>Visible</span>
          <span>Action</span>
        </div>
        <div className="admin-products">
          {products.map((product) => (
            <ProductEditor key={product.id} product={product} onSave={saveProduct} />
          ))}
        </div>
      </section>

      <section className="panel no-print">
        <h2>Ajouter un produit</h2>
        <ProductForm value={draft} onChange={setDraft} onSubmit={() => saveProduct(draft)} />
      </section>
    </main>
  );
}

function ProductEditor({ product, onSave }) {
  const [value, setValue] = useState(product);
  return <ProductForm value={value} onChange={setValue} onSubmit={() => onSave(value)} />;
}

function ProductForm({ value, onChange, onSubmit }) {
  function patch(field, nextValue) {
    onChange({ ...value, [field]: nextValue });
  }

  return (
    <div className="product-editor">
      <input value={value.name} onChange={(event) => patch("name", event.target.value)} placeholder="Nom" />
      <select value={value.category} onChange={(event) => patch("category", event.target.value)}>
        <option>Légumes</option>
        <option>Bières</option>
      </select>
      <select value={value.unit} onChange={(event) => patch("unit", event.target.value)}>
        <option value="kg">kg</option>
        <option value="piece">pièce</option>
        <option value="unite">unité</option>
        <option value="carton">carton</option>
      </select>
      <input type="number" step="0.01" value={value.price} onChange={(event) => patch("price", Number(event.target.value))} placeholder="Prix" />
      <input type="number" step="1" value={value.stock} onChange={(event) => patch("stock", Number(event.target.value))} placeholder="Stock" />
      <label className="toggle">
        <input type="checkbox" checked={value.active} onChange={(event) => patch("active", event.target.checked)} />
        Visible
      </label>
      <button className="primary" onClick={onSubmit}>Enregistrer</button>
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
