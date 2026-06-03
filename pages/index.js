import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export default function ClientPortal({ initialSession }) {
  const [session, setSession] = useState(initialSession);
  const [products, setProducts] = useState([]);
  const [partnerId, setPartnerId] = useState("");
  const [code, setCode] = useState("");
  const [partner, setPartner] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState("grid");

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
    return products.reduce((acc, product) => {
      acc[product.category] = acc[product.category] || [];
      acc[product.category].push(product);
      return acc;
    }, {});
  }, [products]);

  const total = products.reduce((sum, product) => sum + (Number(quantities[product.id]) || 0) * product.price, 0);

  async function loadProducts(nextPartnerId, nextCode) {
    const response = await fetch(`/api/products?partnerId=${encodeURIComponent(nextPartnerId)}&code=${encodeURIComponent(nextCode)}`);
    const data = await response.json();
    if (!response.ok) {
      setProducts([]);
      setMessage(data.error || "Impossible de charger le catalogue.");
      return;
    }
    setProducts(data.products || []);
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
    await loadProducts(partnerId, code);
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
      });
    } catch {
      localStorage.removeItem("atc-partner");
    }
  }, []);

  async function submitOrder() {
    setLoading(true);
    setMessage("");
    const items = Object.entries(quantities).map(([productId, quantity]) => ({ productId, quantity: Number(quantity) }));
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId, code, items })
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return setMessage(data.error || "Commande refusee.");
    setQuantities({});
    setMessage(`Commande enregistrée pour le ${formatDate(data.delivery.deliveryDate)}.`);
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
              <p className="eyebrow">{partner.name}</p>
              <h2>Catalogue</h2>
            </div>
            <div className="actions">
              <div className="segmented" aria-label="Affichage catalogue">
                <button
                  className={viewMode === "grid" ? "active" : ""}
                  type="button"
                  onClick={() => setViewMode("grid")}
                >
                  Blocs
                </button>
                <button
                  className={viewMode === "list" ? "active" : ""}
                  type="button"
                  onClick={() => setViewMode("list")}
                >
                  Lignes
                </button>
              </div>
              <button className="ghost" onClick={() => { localStorage.removeItem("atc-partner"); setPartner(null); setProducts([]); }}>
                Déconnexion
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
                      <span className="stock">Disponible: {product.stock} {unitLabel(product.unit)}</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={product.stock}
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
            <div>
              <strong>Total estime</strong>
              <span>{currency.format(total)}</span>
            </div>
            <button className="primary" disabled={loading || total <= 0} onClick={submitOrder}>
              {loading ? "Envoi..." : "Valider la commande"}
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

function unitLabel(unit) {
  return ({ kg: "kg", piece: "pièce", unite: "unité", carton: "carton" })[unit] || unit;
}
