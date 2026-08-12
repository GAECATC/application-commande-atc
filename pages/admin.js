import { useEffect, useMemo, useState } from "react";
const { PRODUCT_CATEGORIES } = require("@/lib/product-categories");
import Link from "next/link";
import Image from "next/image";

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const emptyPartner = { id: "", name: "", code: "", email: "", active: true, priceListId: "" };
const emptyProduct = { name: "", category: PRODUCT_CATEGORIES[0], unit: "kg", price: 0, stock: 0, active: true, sortOrder: 100 };
const emptyBasket = { id: "", name: "", partnerId: "", active: true, items: {} };

export default function Admin() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [products, setProducts] = useState([]);
  const [partners, setPartners] = useState([]);
  const [baskets, setBaskets] = useState([]);
  const [basketDraft, setBasketDraft] = useState(emptyBasket);
  const [savingBasket, setSavingBasket] = useState(false);
  const [summary, setSummary] = useState(null);
  const [priceLists, setPriceLists] = useState([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState("");
  const [draft, setDraft] = useState(emptyProduct);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [orderDraft, setOrderDraft] = useState({});
  const [dirtyProductIds, setDirtyProductIds] = useState([]);
  const [dirtyPartnerIds, setDirtyPartnerIds] = useState([]);
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [savingPartners, setSavingPartners] = useState(false);
  const [message, setMessage] = useState("");
  const [clientsOpen, setClientsOpen] = useState(false);
  const [newPartner, setNewPartner] = useState(emptyPartner);
  const [availabilityPartnerId, setAvailabilityPartnerId] = useState("");
  const [availabilityDeliveryDate, setAvailabilityDeliveryDate] = useState("");
  const [availabilityProducts, setAvailabilityProducts] = useState([]);
  const [allocationDraft, setAllocationDraft] = useState({});
  const [allocationVisibilityDraft, setAllocationVisibilityDraft] = useState({});
  const [savedAllocationProductIds, setSavedAllocationProductIds] = useState([]);
  const [orderedByProduct, setOrderedByProduct] = useState({});
  const [availabilityConfigured, setAvailabilityConfigured] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [customCategories, setCustomCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newPriceListName, setNewPriceListName] = useState("");
  const [savingPriceList, setSavingPriceList] = useState(false);
  const [categoryActionsOpen, setCategoryActionsOpen] = useState(false);
  const [priceListActionsOpen, setPriceListActionsOpen] = useState(false);

  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-admin-password": password }), [password]);
  const categoryOptions = useMemo(() => {
    const existingCategories = products.map((product) => product.category).filter(Boolean);
    const categories = Array.from(new Set([...PRODUCT_CATEGORIES, ...existingCategories, ...customCategories]));
    return categories.sort((categoryA, categoryB) => {
      const indexA = PRODUCT_CATEGORIES.indexOf(categoryA);
      const indexB = PRODUCT_CATEGORIES.indexOf(categoryB);
      if (indexA === -1 && indexB === -1) return categoryA.localeCompare(categoryB, "fr");
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [products, customCategories]);
  const catalogGroups = useMemo(() => {
    const groups = products.reduce((result, product) => {
      const category = product.category || "Autres";
      (result[category] ||= []).push(product);
      return result;
    }, {});
    for (const categoryProducts of Object.values(groups)) {
      categoryProducts.sort((productA, productB) =>
        productA.name.localeCompare(productB.name, "fr", { sensitivity: "base", numeric: true })
      );
    }
    return Object.entries(groups).sort(([categoryA], [categoryB]) => {
      const indexA = PRODUCT_CATEGORIES.indexOf(categoryA);
      const indexB = PRODUCT_CATEGORIES.indexOf(categoryB);
      if (indexA === -1 && indexB === -1) return categoryA.localeCompare(categoryB, "fr");
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [products]);

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
    const [productRes, summaryRes, partnerRes, basketRes] = await Promise.all([
      fetch(`/api/products?includeHidden=true&priceListId=${encodeURIComponent(nextPriceListId)}`, { headers: adminHeaders }),
      fetch("/api/summary", { headers: adminHeaders }),
      fetch("/api/partners", { headers: adminHeaders }),
      fetch("/api/baskets", { headers: adminHeaders })
    ]);
    const productData = await productRes.json();
    const summaryData = await summaryRes.json();
    const partnerData = await partnerRes.json();
    const basketData = await basketRes.json();
    setPriceLists(nextPriceLists);
    setSelectedPriceListId(nextPriceListId);
    setProducts(productData.products || []);
    setPartners((partnerData.partners || []).map((partner) => ({ ...partner, originalId: partner.id })));
    setBaskets(basketData.baskets || []);
    setDirtyProductIds([]);
    setDirtyPartnerIds([]);
    setSummary(summaryData);
  }

  function editBasket(basket) {
    setBasketDraft({
      id: basket.id,
      name: basket.name,
      partnerId: basket.partnerId,
      active: basket.active !== false,
      items: Object.fromEntries(basket.items.map((item) => [item.productId, String(item.quantity)]))
    });
  }

  async function saveBasket() {
    const items = Object.entries(basketDraft.items)
      .map(([productId, quantity]) => ({ productId, quantity: Number(quantity) }))
      .filter((item) => item.quantity > 0);
    setSavingBasket(true);
    const response = await fetch("/api/baskets", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...basketDraft, items })
    });
    const data = await response.json();
    setSavingBasket(false);
    if (!response.ok) return setMessage(data.error || "Enregistrement du panier refusé.");
    setBasketDraft(emptyBasket);
    setMessage("Panier enregistré.");
    await loadAdminData();
  }

  async function removeBasket(basket) {
    if (!window.confirm(`Supprimer le panier « ${basket.name} » ?`)) return;
    const response = await fetch("/api/baskets", { method: "DELETE", headers, body: JSON.stringify({ id: basket.id }) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Suppression du panier refusée.");
    if (basketDraft.id === basket.id) setBasketDraft(emptyBasket);
    setMessage("Panier supprimé.");
    await loadAdminData();
  }

  async function loadAvailability(partnerId, pass = password) {
    setAvailabilityPartnerId(partnerId);
    setAvailabilityDeliveryDate("");
    setAllocationDraft({});
    setAllocationVisibilityDraft({});
    setSavedAllocationProductIds([]);
    setOrderedByProduct({});
    setAvailabilityConfigured(false);
    if (!partnerId) return setAvailabilityProducts([]);

    const partner = partners.find((item) => item.id === partnerId);
    if (!partner) return;
    const adminHeaders = { "x-admin-password": pass };
    const [productRes, availabilityRes] = await Promise.all([
      fetch(`/api/products?includeHidden=true&priceListId=${encodeURIComponent(partner.priceListId)}`, { headers: adminHeaders }),
      fetch(`/api/availability?partnerId=${encodeURIComponent(partnerId)}`, { headers: adminHeaders })
    ]);
    const productData = await productRes.json();
    const availabilityData = await availabilityRes.json();
    if (!productRes.ok || !availabilityRes.ok) {
      setMessage(productData.error || availabilityData.error || "Disponibilités impossibles à charger.");
      return;
    }
    setAvailabilityProducts(productData.products || []);
    setAvailabilityDeliveryDate(availabilityData.deliveryDate || "");
    const savedAllocations = availabilityData.allocations || [];
    setAllocationDraft(Object.fromEntries(savedAllocations.map((item) => [
      item.productId,
      item.quantity > 0 ? String(item.quantity) : ""
    ])));
    setAllocationVisibilityDraft(
      availabilityData.configured
        ? Object.fromEntries((productData.products || []).map((product) => {
          const allocation = savedAllocations.find((item) => item.productId === product.id);
          return [product.id, Boolean(allocation && allocation.visible !== false)];
        }))
        : Object.fromEntries((productData.products || []).map((product) => [product.id, Boolean(product.active)]))
    );
    setSavedAllocationProductIds(savedAllocations.filter((item) => item.visible !== false).map((item) => item.productId));
    setOrderedByProduct(availabilityData.orderedByProduct || {});
    setAvailabilityConfigured(Boolean(availabilityData.configured));
  }

  async function saveAvailability() {
    if (!availabilityPartnerId || !availabilityDeliveryDate) return;
    const allocations = availabilityProducts.map((product) => ({
      productId: product.id,
      quantity: Number(allocationDraft[product.id] || 0),
      visible: Boolean(allocationVisibilityDraft[product.id])
    }));

    setSavingAvailability(true);
    const response = await fetch("/api/availability", {
      method: "POST",
      headers,
      body: JSON.stringify({ partnerId: availabilityPartnerId, deliveryDate: availabilityDeliveryDate, allocations })
    });
    const data = await response.json();
    setSavingAvailability(false);
    if (!response.ok) return setMessage(data.error || "Enregistrement des disponibilités refusé.");
    setMessage("Disponibilités client enregistrées.");
    await loadAvailability(availabilityPartnerId);
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

  function addCustomCategory(event) {
    event.preventDefault();
    const category = newCategoryName.trim().replace(/\s+/g, " ");
    if (!category) return setMessage("Saisissez un nom de catégorie.");
    const existingCategory = categoryOptions.find((item) => item.localeCompare(category, "fr", { sensitivity: "base" }) === 0);
    const selectedCategory = existingCategory || category;
    if (!existingCategory) setCustomCategories((current) => [...current, category]);
    setDraft((current) => ({ ...current, category: selectedCategory }));
    setNewCategoryName("");
    setMessage(existingCategory
      ? `La catégorie « ${existingCategory} » existe déjà et a été sélectionnée.`
      : `Catégorie « ${category} » ajoutée. Elle sera conservée avec le nouveau produit.`);
  }

  async function addPriceList(event) {
    event.preventDefault();
    const name = newPriceListName.trim().replace(/\s+/g, " ");
    if (!name) return setMessage("Saisissez un nom de grille tarifaire.");

    setSavingPriceList(true);
    const response = await fetch("/api/price-lists", {
      method: "POST",
      headers,
      body: JSON.stringify({ name })
    });
    const data = await response.json();
    setSavingPriceList(false);
    if (!response.ok) return setMessage(data.error || "Création de la grille refusée.");

    setNewPriceListName("");
    setMessage(`Grille « ${data.priceList.name} » créée. Saisissez maintenant ses prix.`);
    await loadAdminData(password, data.priceList.id);
  }

  async function renameSelectedPriceList() {
    const selected = priceLists.find((item) => item.id === selectedPriceListId);
    if (!selected) return;
    const name = window.prompt("Nouveau nom de la grille tarifaire :", selected.name)?.trim().replace(/\s+/g, " ");
    if (!name || name === selected.name) return setPriceListActionsOpen(false);
    const response = await fetch("/api/price-lists", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ id: selected.id, name })
    });
    const data = await response.json();
    setPriceListActionsOpen(false);
    if (!response.ok) return setMessage(data.error || "Modification de la grille refusée.");
    setMessage(`Grille renommée « ${data.priceList.name} ».`);
    await loadAdminData(password, selected.id);
  }

  async function deleteSelectedPriceList() {
    const selected = priceLists.find((item) => item.id === selectedPriceListId);
    if (!selected || !window.confirm(`Supprimer définitivement la grille « ${selected.name} » et tous ses prix ?`)) return;
    const response = await fetch("/api/price-lists", {
      method: "DELETE",
      headers,
      body: JSON.stringify({ id: selected.id })
    });
    const data = await response.json();
    setPriceListActionsOpen(false);
    if (!response.ok) return setMessage(data.error || "Suppression de la grille refusée.");
    setMessage(`Grille « ${selected.name} » supprimée.`);
    await loadAdminData(password, "");
  }

  async function renameSelectedCategory() {
    const currentName = draft.category;
    if (PRODUCT_CATEGORIES.includes(currentName)) {
      return setMessage("Les catégories d’origine sont protégées. Créez une nouvelle catégorie si nécessaire.");
    }
    const nextName = window.prompt("Nouveau nom de la catégorie :", currentName)?.trim().replace(/\s+/g, " ");
    if (!nextName || nextName === currentName) return setCategoryActionsOpen(false);
    const isPersisted = products.some((product) => product.category === currentName);
    if (isPersisted) {
      const response = await fetch("/api/categories", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ currentName, nextName })
      });
      const data = await response.json();
      if (!response.ok) return setMessage(data.error || "Modification de la catégorie refusée.");
    }
    setCustomCategories((current) => [...current.filter((item) => item !== currentName), nextName]);
    setDraft((current) => ({ ...current, category: nextName }));
    setCategoryActionsOpen(false);
    setMessage(`Catégorie renommée « ${nextName} ».`);
    if (isPersisted) await loadAdminData();
  }

  async function deleteSelectedCategory() {
    const name = draft.category;
    if (PRODUCT_CATEGORIES.includes(name)) {
      return setMessage("Les catégories d’origine sont protégées et ne peuvent pas être supprimées.");
    }
    const affectedProducts = products.filter((product) => product.category === name).length;
    const warning = affectedProducts
      ? `Supprimer la catégorie « ${name} » ? Ses ${affectedProducts} produit(s) seront reclassés dans « Autres ».`
      : `Supprimer la catégorie « ${name} » ?`;
    if (!window.confirm(warning)) return;
    if (affectedProducts) {
      const response = await fetch("/api/categories", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ name })
      });
      const data = await response.json();
      if (!response.ok) return setMessage(data.error || "Suppression de la catégorie refusée.");
    }
    setCustomCategories((current) => current.filter((item) => item !== name));
    setDraft((current) => ({ ...current, category: PRODUCT_CATEGORIES[0] }));
    setCategoryActionsOpen(false);
    setMessage(`Catégorie « ${name} » supprimée.`);
    if (affectedProducts) await loadAdminData();
  }

  function updateProductDraft(productId, nextProduct) {
    setProducts((current) => current.map((product) => product.id === productId ? nextProduct : product));
    setDirtyProductIds((current) => current.includes(productId) ? current : [...current, productId]);
  }

  async function saveCatalogChanges() {
    const dirtyProducts = products.filter((product) => dirtyProductIds.includes(product.id));
    if (!dirtyProducts.length) return;

    setSavingCatalog(true);
    for (const product of dirtyProducts) {
      const response = await fetch("/api/products", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...product, priceListId: selectedPriceListId })
      });
      const data = await response.json();
      if (!response.ok) {
        setSavingCatalog(false);
        return setMessage(data.error || "Catalogue refuse.");
      }
    }

    setSavingCatalog(false);
    setMessage("Catalogue mis a jour.");
    await loadAdminData();
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Supprimer le produit "${product.name}" ?`)) return;

    const response = await fetch("/api/products", {
      method: "DELETE",
      headers,
      body: JSON.stringify({ id: product.id })
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Suppression refusee.");

    setDirtyProductIds((current) => current.filter((id) => id !== product.id));
    setMessage("Produit supprime.");
    await loadAdminData();
  }

  function updatePartnerDraft(partnerKey, nextPartner) {
    setPartners((current) => current.map((partner) => (partner.originalId || partner.id) === partnerKey ? nextPartner : partner));
    setDirtyPartnerIds((current) => current.includes(partnerKey) ? current : [...current, partnerKey]);
  }

  function addPartnerDraft() {
    const partner = {
      ...newPartner,
      originalId: "",
      id: newPartner.id.trim(),
      name: newPartner.name.trim(),
      code: newPartner.code.trim(),
      email: newPartner.email.trim(),
      priceListId: newPartner.priceListId || selectedPriceListId || priceLists[0]?.id || "",
      active: newPartner.active !== false
    };

    if (!partner.id || !partner.name || !partner.code || !partner.priceListId) {
      return setMessage("Nom, identifiant, code et tarif sont obligatoires.");
    }
    if (partners.some((item) => item.id === partner.id)) {
      return setMessage("Cet identifiant client existe deja.");
    }

    setPartners((current) => [...current, partner].sort((a, b) => a.name.localeCompare(b.name)));
    setDirtyPartnerIds((current) => [...current, partner.id]);
    setNewPartner({ ...emptyPartner, priceListId: selectedPriceListId || priceLists[0]?.id || "" });
    setMessage("Nouveau client ajoute. Cliquez sur Enregistrer les clients pour valider.");
  }

  async function savePartnerChanges() {
    const dirtyPartners = partners.filter((partner) => dirtyPartnerIds.includes(partner.originalId || partner.id));
    if (!dirtyPartners.length) return;

    setSavingPartners(true);
    for (const partner of dirtyPartners) {
      const response = await fetch("/api/partners", {
        method: "POST",
        headers,
        body: JSON.stringify(partner)
      });
      const data = await response.json();
      if (!response.ok) {
        setSavingPartners(false);
        return setMessage(data.error || "Client refuse.");
      }
    }

    setSavingPartners(false);
    setMessage("Clients mis a jour.");
    await loadAdminData();
  }

  async function deletePartnerAccount(partner) {
    const partnerId = partner.originalId || partner.id;
    if (!window.confirm(`Supprimer définitivement le client « ${partner.name} » ?`)) return;

    if (!partner.originalId) {
      setPartners((current) => current.filter((item) => item.id !== partner.id));
      setDirtyPartnerIds((current) => current.filter((id) => id !== partner.id));
      setMessage("Nouveau client retiré.");
      return;
    }

    const response = await fetch("/api/partners", {
      method: "DELETE",
      headers,
      body: JSON.stringify({ id: partnerId })
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Suppression du client refusée.");

    if (availabilityPartnerId === partnerId) {
      setAvailabilityPartnerId("");
      setAvailabilityProducts([]);
      setAllocationDraft({});
      setAllocationVisibilityDraft({});
      setSavedAllocationProductIds([]);
    }
    setMessage("Client supprimé.");
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

  async function deleteOrder(order) {
    if (!window.confirm(`Supprimer la commande de ${order.partnerName} ?`)) return;

    const response = await fetch("/api/orders", {
      method: "DELETE",
      headers,
      body: JSON.stringify({ orderId: order.id, partnerId: order.partnerId })
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Suppression refusee.");

    if (editingOrderId === order.id) {
      setEditingOrderId(null);
      setOrderDraft({});
    }
    setMessage("Commande supprimee.");
    await loadAdminData();
  }

  async function validateAdminOrder(order) {
    if (!window.confirm(`Valider la commande de ${order.partnerName} ?`)) return;

    const response = await fetch("/api/orders", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ orderId: order.id, partnerId: order.partnerId })
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Validation refusee.");

    if (editingOrderId === order.id) {
      setEditingOrderId(null);
      setOrderDraft({});
    }
    setMessage("Commande validee.");
    window.open(`/admin/bon-livraison?orderId=${encodeURIComponent(order.id)}`, "_blank", "noopener,noreferrer");
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
          <Link className="link-button" href="/admin/historique">Historique des commandes</Link>
          <button className="ghost" onClick={() => loadAdminData()}>Actualiser</button>
          <button className="primary" onClick={() => window.print()}>Imprimer / PDF</button>
        </div>
      </header>

      <section className="print-report">
        {summary?.groups?.length ? summary.groups.map((deliverySummary) => (
          <section className="delivery-summary" key={deliverySummary.deliveryDate}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Récapitulatif des récoltes</p>
            <h2>Total à préparer pour le {formatDate(deliverySummary.deliveryDate)}</h2>
          </div>
          <span className="badge">{deliverySummary.orders.length} commandes</span>
        </div>

        <div className="summary-grid">
          {deliverySummary.totals.map((item) => (
            <article className="summary-row" key={`${item.productId}-${item.unit}`}>
              <span>{item.productName}</span>
              <strong>{formatNumber(item.quantity)} {unitLabel(item.unit)}</strong>
              <small>{item.category}</small>
            </article>
          ))}
        </div>

        <h3>Commandes par client</h3>
        <div className="orders-list">
          {deliverySummary.orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div>
                <strong>{order.partnerName}</strong>
                <span>{new Date(order.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</span>
              </div>
              <ul>
                {order.items.map((item) => (
                  <li key={item.id}>{formatNumber(item.quantity)} {unitLabel(item.unit)} - {item.productName}</li>
                ))}
              </ul>
              {order.comment && <p className="order-comment"><strong>Commentaire client :</strong> {order.comment}</p>}
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
                  <Link className="ghost no-print" href={`/admin/bon-livraison?orderId=${encodeURIComponent(order.id)}`} target="_blank">Bon livraison</Link>
                  <button className="primary no-print" type="button" onClick={() => validateAdminOrder(order)}>Valider</button>
                  <button className="danger no-print" type="button" onClick={() => deleteOrder(order)}>Supprimer</button>
                </div>
              )}
            </article>
          ))}
        </div>
          </section>
        )) : <p>Aucune commande en cours.</p>}
      </section>

      <section className="panel no-print basket-admin-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Composition automatique</p>
            <h2>Paniers</h2>
            <p className="section-note">Créez un panier type et affectez-le au client qui pourra le commander par quantité.</p>
          </div>
          <button className="primary" type="button" disabled={savingBasket} onClick={saveBasket}>
            {savingBasket ? "Enregistrement..." : basketDraft.id ? "Mettre à jour le panier" : "Créer le panier"}
          </button>
        </div>
        <div className="basket-admin-form">
          <label>Nom du panier<input value={basketDraft.name} onChange={(event) => setBasketDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex. Panier tomate" /></label>
          <label>Client<select value={basketDraft.partnerId} onChange={(event) => setBasketDraft((current) => ({ ...current, partnerId: event.target.value }))}>
            <option value="">Choisir un client</option>
            {partners.filter((partner) => partner.active).map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
          </select></label>
          <label className="toggle"><input type="checkbox" checked={basketDraft.active} onChange={(event) => setBasketDraft((current) => ({ ...current, active: event.target.checked }))} />Actif</label>
        </div>
        <div className="basket-product-editor">
          {[...products].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((product) => (
            <label key={product.id}>
              <span>{product.name}<small>{unitLabel(product.unit)} par panier</small></span>
              <input type="number" min="0" step={product.unit === "kg" ? "0.01" : "1"} value={basketDraft.items[product.id] || ""} onChange={(event) => setBasketDraft((current) => ({ ...current, items: { ...current.items, [product.id]: event.target.value } }))} />
            </label>
          ))}
        </div>
        {baskets.length > 0 && <div className="basket-admin-list">
          {baskets.map((basket) => <article key={basket.id}>
            <div><strong>{basket.name}</strong><span>{partners.find((partner) => partner.id === basket.partnerId)?.name || basket.partnerId} · {basket.items.length} produit(s) · {basket.active ? "Actif" : "Inactif"}</span></div>
            <div className="actions"><button className="ghost" type="button" onClick={() => editBasket(basket)}>Modifier</button><button className="danger" type="button" onClick={() => removeBasket(basket)}>Supprimer</button></div>
          </article>)}
        </div>}
      </section>

      <section className="panel no-print availability-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Livraison du {availabilityDeliveryDate ? formatDate(availabilityDeliveryDate) : "prochain créneau du client"}</p>
            <h2>Disponibilités par client</h2>
          </div>
          {availabilityPartnerId && (
            <button className="primary" type="button" disabled={savingAvailability} onClick={saveAvailability}>
              {savingAvailability ? "Enregistrement..." : "Enregistrer les disponibilités"}
            </button>
          )}
        </div>
        <label className="compact-label availability-client-select">
          Client
          <select value={availabilityPartnerId} onChange={(event) => loadAvailability(event.target.value)}>
            <option value="">Choisir un client</option>
            {partners.filter((partner) => partner.active).map((partner) => (
              <option key={partner.id} value={partner.id}>{partner.name}</option>
            ))}
          </select>
        </label>
        {availabilityPartnerId && (
          <>
            <p className="section-note">
              {availabilityConfigured
                ? "La case Visible détermine les produits proposés à ce client. Une limite vide ou égale à 0 signifie : à volonté."
                : "Ce client utilise encore la disponibilité générale. Adaptez les cases visibles et les limites, puis enregistrez sa liste personnelle."}
            </p>
            <div className="availability-actions">
              <button className="ghost" type="button" onClick={() => {
                setAllocationDraft(Object.fromEntries(
                  availabilityProducts.map((product) => [product.id, Number(product.stock) > 0 ? String(product.stock) : ""])
                ));
                setAllocationVisibilityDraft(Object.fromEntries(
                  availabilityProducts.map((product) => [product.id, Boolean(product.active)])
                ));
              }}>Utiliser les disponibilités générales</button>
              <button className="ghost" type="button" onClick={() => setAllocationVisibilityDraft(
                Object.fromEntries(availabilityProducts.map((product) => [product.id, true]))
              )}>Tout rendre visible</button>
              <button className="ghost" type="button" onClick={() => setAllocationVisibilityDraft(
                Object.fromEntries(availabilityProducts.map((product) => [product.id, false]))
              )}>Tout masquer</button>
            </div>
            <div className="availability-groups">
              {Object.entries([...availabilityProducts].sort((productA, productB) =>
                productA.name.localeCompare(productB.name, "fr", { sensitivity: "base", numeric: true })
              ).reduce((groups, product) => {
                (groups[product.category] ||= []).push(product);
                return groups;
              }, {})).map(([category, categoryProducts]) => (
                <section className="availability-group" key={category}>
                  <h3>{category}</h3>
                  {categoryProducts.map((product) => {
                    const ordered = Number(orderedByProduct[product.id] || 0);
                    const isSaved = savedAllocationProductIds.includes(product.id);
                    const isVisible = Boolean(allocationVisibilityDraft[product.id]);
                    return (
                      <div className={`availability-row ${isSaved ? "saved" : ""} ${isVisible ? "" : "hidden-product"}`} key={product.id}>
                        <span>{product.name}<small>{ordered ? `${formatNumber(ordered)} ${unitLabel(product.unit)} déjà commandé` : "Aucune commande"}</small></span>
                        <input
                          type="number"
                          min="0"
                          step={product.unit === "kg" ? "0.5" : "1"}
                          value={allocationDraft[product.id] ?? ""}
                          onChange={(event) => setAllocationDraft((current) => ({ ...current, [product.id]: event.target.value }))}
                          placeholder="À volonté"
                          aria-label={`Limite pour ${product.name}`}
                        />
                        <strong>{unitLabel(product.unit)}</strong>
                        <label className="availability-visible">
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={(event) => setAllocationVisibilityDraft((current) => ({
                              ...current,
                              [product.id]: event.target.checked
                            }))}
                          />
                          Visible
                        </label>
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="panel no-print">
        <div className="section-heading">
          <div>
            <button
              className="section-toggle clients-toggle"
              type="button"
              aria-expanded={clientsOpen}
              onClick={() => setClientsOpen((current) => !current)}
            >
              <h2>Clients</h2>
              <span className="clients-toggle-label">{clientsOpen ? "Masquer" : "Afficher"}</span>
              <svg className={`clients-chevron ${clientsOpen ? "open" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <p className="section-note">
              {partners.filter((partner) => !partner.email).length} email client manquant
            </p>
          </div>
          <button className="primary" type="button" disabled={!dirtyPartnerIds.length || savingPartners} onClick={savePartnerChanges}>
            {savingPartners ? "Enregistrement..." : `Enregistrer les clients${dirtyPartnerIds.length ? ` (${dirtyPartnerIds.length})` : ""}`}
          </button>
        </div>
        {clientsOpen && (
          <>
            <div className="partner-add-form">
              <input value={newPartner.name} onChange={(event) => setNewPartner((current) => ({ ...current, name: event.target.value }))} placeholder="Nom du client" />
              <input value={newPartner.id} onChange={(event) => setNewPartner((current) => ({ ...current, id: event.target.value }))} placeholder="Identifiant" />
              <input value={newPartner.code} onChange={(event) => setNewPartner((current) => ({ ...current, code: event.target.value }))} placeholder="Code client" />
              <input type="email" value={newPartner.email} onChange={(event) => setNewPartner((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
              <select value={newPartner.priceListId || selectedPriceListId} onChange={(event) => setNewPartner((current) => ({ ...current, priceListId: event.target.value }))}>
                {priceLists.map((priceList) => (
                  <option key={priceList.id} value={priceList.id}>{priceList.name}</option>
                ))}
              </select>
              <label className="toggle">
                <input type="checkbox" checked={newPartner.active} onChange={(event) => setNewPartner((current) => ({ ...current, active: event.target.checked }))} />
                Actif
              </label>
              <button className="ghost" type="button" onClick={addPartnerDraft}>Ajouter un client</button>
            </div>
            <div className="partner-editor partner-editor-header">
              <span>Nom du client</span>
              <span>Identifiant</span>
              <span>Code</span>
              <span>Email</span>
              <span>Tarif</span>
              <span>Actif</span>
              <span>Action</span>
            </div>
            <div className="admin-partners">
              {partners.map((partner) => (
                <PartnerEditor
                  key={partner.originalId || partner.id}
                  partner={partner}
                  priceLists={priceLists}
                  onChange={(nextPartner) => updatePartnerDraft(partner.originalId || partner.id, nextPartner)}
                  onDelete={() => deletePartnerAccount(partner)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="panel no-print">
        <div className="section-heading">
          <div>
            <h2>Catalogue</h2>
            <div className="managed-select">
              <label className="compact-label">
                Grille tarifaire
                <select
                  value={selectedPriceListId}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setSelectedPriceListId(nextValue);
                    setPriceListActionsOpen(false);
                    queueMicrotask(() => loadAdminData(password, nextValue));
                  }}
                >
                  {priceLists.map((priceList) => (
                    <option key={priceList.id} value={priceList.id}>{priceList.name}</option>
                  ))}
                </select>
              </label>
              <button className="more-actions-button" type="button" aria-label="Actions sur la grille tarifaire" onClick={() => setPriceListActionsOpen((open) => !open)}>⋯</button>
              {priceListActionsOpen && (
                <div className="management-menu">
                  <button type="button" onClick={renameSelectedPriceList}>Renommer</button>
                  <button className="danger-text" type="button" onClick={deleteSelectedPriceList}>Supprimer</button>
                </div>
              )}
            </div>
            <form className="new-price-list-form" onSubmit={addPriceList}>
              <label>
                Nouvelle grille tarifaire
                <span>
                  <input
                    value={newPriceListName}
                    onChange={(event) => setNewPriceListName(event.target.value)}
                    placeholder="Exemple : Restaurants 2026"
                  />
                  <button className="ghost" type="submit" disabled={savingPriceList}>
                    {savingPriceList ? "Création..." : "Créer la grille"}
                  </button>
                </span>
              </label>
              <small>La nouvelle grille affichera tous les produits avec un prix initial de 0 €.</small>
            </form>
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
        <div className="catalog-groups">
          {catalogGroups.map(([category, categoryProducts]) => (
            <section className="catalog-admin-group" key={category}>
              <h3>{category}<span>{categoryProducts.length} produit{categoryProducts.length > 1 ? "s" : ""}</span></h3>
              <div className="admin-products">
                {categoryProducts.map((product) => (
                  <ProductEditor
                    key={product.id}
                    product={product}
                    categories={categoryOptions}
                    onChange={(nextProduct) => updateProductDraft(product.id, nextProduct)}
                    onDelete={() => deleteProduct(product)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="admin-savebar">
          <div>
            <strong>Catalogue</strong>
            <span>{dirtyProductIds.length ? `${dirtyProductIds.length} modification${dirtyProductIds.length > 1 ? "s" : ""} en attente` : "Aucune modification en attente"}</span>
          </div>
          <button className="primary" type="button" disabled={!dirtyProductIds.length || savingCatalog} onClick={saveCatalogChanges}>
            {savingCatalog ? "Enregistrement..." : "Enregistrer le catalogue"}
          </button>
        </aside>
      </section>

      <section className="panel no-print">
        <h2>Ajouter un produit</h2>
        <form className="new-category-form" onSubmit={addCustomCategory}>
          <label>
            Nouvelle catégorie
            <span>
              <input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Exemple : Champignons"
              />
              <button className="ghost" type="submit">Créer la catégorie</button>
            </span>
          </label>
          <small>La catégorie sera enregistrée durablement dès qu’un produit l’utilisant sera enregistré.</small>
        </form>
        <div className="managed-category">
          <span>Gérer la catégorie sélectionnée : <strong>{draft.category}</strong></span>
          <button className="more-actions-button" type="button" aria-label="Actions sur la catégorie" onClick={() => setCategoryActionsOpen((open) => !open)}>⋯</button>
          {categoryActionsOpen && (
            <div className="management-menu">
              <button type="button" onClick={renameSelectedCategory}>Renommer</button>
              <button className="danger-text" type="button" onClick={deleteSelectedCategory}>Supprimer</button>
            </div>
          )}
        </div>
        <ProductForm
          value={draft}
          categories={categoryOptions}
          onChange={setDraft}
          onSubmit={() => saveProduct(draft)}
        />
      </section>
    </main>
  );
}

function ProductEditor({ product, categories, onChange, onDelete }) {
  return <ProductForm value={product} categories={categories} onChange={onChange} onDelete={onDelete} showSubmit={false} />;
}

function PartnerEditor({ partner, priceLists, onChange, onDelete }) {
  function patch(field, nextValue) {
    onChange({ ...partner, [field]: nextValue });
  }

  return (
    <div className={`partner-editor ${partner.email ? "" : "missing-email"}`}>
      <input value={partner.name} onChange={(event) => patch("name", event.target.value)} placeholder="Nom du client" />
      <input value={partner.id} onChange={(event) => patch("id", event.target.value.trim())} placeholder="Identifiant" />
      <input value={partner.code} onChange={(event) => patch("code", event.target.value.trim())} placeholder="Code client" />
      <input
        type="email"
        value={partner.email || ""}
        onChange={(event) => patch("email", event.target.value)}
        placeholder="email client"
      />
      <select value={partner.priceListId} onChange={(event) => patch("priceListId", event.target.value)}>
        {priceLists.map((priceList) => (
          <option key={priceList.id} value={priceList.id}>{priceList.name}</option>
        ))}
      </select>
      <label className="toggle">
        <input type="checkbox" checked={partner.active} onChange={(event) => patch("active", event.target.checked)} />
        Actif
      </label>
      <button className="danger" type="button" onClick={onDelete}>Supprimer</button>
    </div>
  );
}

function ProductForm({ value, categories, onChange, onSubmit, onDelete, showSubmit = true }) {
  function patch(field, nextValue) {
    onChange({ ...value, [field]: nextValue });
  }

  return (
    <div className="product-editor">
      <label className="product-field product-name-field">
        <span>Produit</span>
        <input value={value.name} onChange={(event) => patch("name", event.target.value)} placeholder="Nom" />
      </label>
      <label className="product-field product-category-field">
        <span>Catégorie</span>
        <select value={value.category} onChange={(event) => patch("category", event.target.value)}>
          {categories.map((category) => <option key={category}>{category}</option>)}
        </select>
      </label>
      <label className="product-field product-unit-field">
        <span>Unité</span>
        <select value={value.unit} onChange={(event) => patch("unit", event.target.value)}>
          <option value="kg">kg</option>
          <option value="piece">pièce</option>
          <option value="unite">unité</option>
          <option value="carton">carton</option>
        </select>
      </label>
      <label className="product-field product-price-field">
        <span>Prix</span>
        <span className="input-with-suffix">
          <input type="number" step="0.01" value={value.price} onChange={(event) => patch("price", Number(event.target.value))} placeholder="0,00" />
          <strong>€</strong>
        </span>
      </label>
      <label className="product-field product-stock-field">
        <span>Disponible</span>
        <span className="input-with-suffix">
          <input type="number" step="0.01" value={value.stock} onChange={(event) => patch("stock", Number(event.target.value))} placeholder="0" />
          <strong>{unitLabel(value.unit)}</strong>
        </span>
      </label>
      <label className="toggle product-visible-field">
        <input type="checkbox" checked={value.active} onChange={(event) => patch("active", event.target.checked)} />
        Visible
      </label>
      {onDelete && <button className="danger product-action-field" type="button" onClick={onDelete}>Supprimer</button>}
      {showSubmit && <button className="primary product-action-field" type="button" onClick={onSubmit}>Enregistrer</button>}
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
