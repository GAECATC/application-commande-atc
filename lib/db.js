const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const mysqlDb = require("./mysql-db");
const { resolveProductCategory } = require("./product-categories");
const { normalizeOrderComment } = require("./order-comment");
const { buildBasketMetadataItems, isBasketMetadataItem, splitBasketMetadata } = require("./order-baskets");

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const SEED_FILE = path.join(DATA_DIR, "seed.json");

const CATALOG_MIGRATIONS = [
  {
    id: "2026-07-lettuce-varieties",
    products: [
      ["laitue-plein-air-batavia-blonde-piece", "Laitue plein air - Batavia blonde", 43, "laitue-piece"],
      ["laitue-plein-air-batavia-rouge-piece", "Laitue plein air - Batavia rouge", 43, "laitue-piece"],
      ["laitue-plein-air-feuille-chene-blonde-piece", "Laitue plein air - Feuille de chene blonde", 43, "laitue-piece"],
      ["laitue-plein-air-feuille-chene-rouge-piece", "Laitue plein air - Feuille de chene rouge", 43, "laitue-piece"],
      ["laitue-plein-air-rougette-piece", "Laitue plein air - Rougette", 43, "laitue-piece"],
      ["laitue-plein-air-iceberg-piece", "Laitue plein air - Iceberg", 43, "laitue-piece"],
      ["laitue-plein-air-frisee-piece", "Laitue plein air - Frisee", 43, "laitue-piece"],
      ["laitue-serre-batavia-blonde-piece", "Laitue serre - Batavia blonde", 44, "laitue-serre-piece"],
      ["laitue-serre-batavia-rouge-piece", "Laitue serre - Batavia rouge", 44, "laitue-serre-piece"],
      ["laitue-serre-feuille-chene-blonde-piece", "Laitue serre - Feuille de chene blonde", 44, "laitue-serre-piece"],
      ["laitue-serre-feuille-chene-rouge-piece", "Laitue serre - Feuille de chene rouge", 44, "laitue-serre-piece"],
      ["laitue-serre-rougette-piece", "Laitue serre - Rougette", 44, "laitue-serre-piece"],
      ["laitue-serre-iceberg-piece", "Laitue serre - Iceberg", 44, "laitue-serre-piece"],
      ["laitue-serre-frisee-piece", "Laitue serre - Frisee", 44, "laitue-serre-piece"]
    ]
  }
];

async function loadSeed() {
  const raw = await fs.readFile(SEED_FILE, "utf8");
  return JSON.parse(raw);
}

function hasSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function hasMySql() {
  return mysqlDb.hasMySql();
}

async function migrateLocal(db) {
  const seed = await loadSeed();
  let changed = false;
  const shouldUseSeedPartners = !db.partners?.length || !db.partners.every((partner) => partner.priceListId);
  const partnerById = new Map(seed.partners.map((partner) => [partner.id, partner]));
  if (!shouldUseSeedPartners) {
    for (const partner of db.partners) {
      const seedPartner = partnerById.get(partner.id);
      partnerById.set(partner.id, seedPartner ? { ...seedPartner, ...partner, email: partner.email ?? seedPartner.email ?? "" } : partner);
    }
  }

  const migrated = {
    priceLists: db.priceLists?.length ? db.priceLists : seed.priceLists,
    partners: shouldUseSeedPartners ? seed.partners : Array.from(partnerById.values()),
    products: db.products?.length && db.productPrices?.length ? db.products : seed.products,
    productPrices: db.productPrices?.length ? db.productPrices : seed.productPrices,
    productAllocations: db.productAllocations || [],
    basketTemplates: db.basketTemplates || [],
    basketTemplateItems: db.basketTemplateItems || [],
    clientGroups: db.clientGroups || [],
    clientGroupMembers: db.clientGroupMembers || [],
    availabilityMessages: db.availabilityMessages || [],
    orders: db.orders || [],
    orderItems: db.orderItems || [],
    appliedMigrations: db.appliedMigrations || []
  };

  const appliedMigrations = new Set(migrated.appliedMigrations);
  for (const migration of CATALOG_MIGRATIONS) {
    if (appliedMigrations.has(migration.id)) continue;

    for (const [id, name, sortOrder, sourceProductId] of migration.products) {
      if (!migrated.products.some((product) => product.id === id)) {
        migrated.products.push({
          id,
          name,
          category: "Légumes",
          unit: "piece",
          stock: 0,
          active: true,
          sortOrder
        });
        changed = true;
      }

      const sourcePrices = migrated.productPrices.filter((price) => price.productId === sourceProductId);
      for (const sourcePrice of sourcePrices) {
        const hasPrice = migrated.productPrices.some(
          (price) => price.productId === id && price.priceListId === sourcePrice.priceListId
        );
        if (!hasPrice) {
          migrated.productPrices.push({
            priceListId: sourcePrice.priceListId,
            productId: id,
            price: Number(sourcePrice.price)
          });
          changed = true;
        }
      }
    }

    appliedMigrations.add(migration.id);
    changed = true;
  }

  migrated.appliedMigrations = Array.from(appliedMigrations);
  Object.defineProperty(migrated, "__changed", { value: changed, enumerable: false });
  return migrated;
}

async function readLocal() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const migrated = await migrateLocal(JSON.parse(raw));
    if (migrated.__changed) await writeLocal(migrated);
    return migrated;
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    const seed = await loadSeed();
    const migrated = await migrateLocal(structuredClone(seed));
    await writeLocal(migrated);
    return migrated;
  }
}

async function writeLocal(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(db, null, 2));
  await fs.rename(tempFile, DATA_FILE);
}

async function supabaseFetch(pathname, options = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${pathname}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${response.status}: ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function normalizePartner(partner) {
  return {
    id: partner.id,
    name: partner.name,
    code: partner.code,
    email: partner.email || "",
    billingName: partner.billing_name ?? partner.billingName ?? "",
    billingAddress: partner.billing_address ?? partner.billingAddress ?? "",
    siret: partner.siret || "",
    vatNumber: partner.vat_number ?? partner.vatNumber ?? "",
    active: Boolean(partner.active),
    priceListId: partner.price_list_id ?? partner.priceListId
  };
}

function partnerToSupabase(partner) {
  return {
    id: partner.id,
    name: partner.name,
    code: partner.code,
    email: partner.email || "",
    billing_name: partner.billingName || "",
    billing_address: partner.billingAddress || "",
    siret: partner.siret || "",
    vat_number: partner.vatNumber || "",
    active: Boolean(partner.active),
    price_list_id: partner.priceListId
  };
}

function normalizeProduct(product) {
  return {
    id: product.id,
    name: product.name,
    category: resolveProductCategory(product),
    unit: product.unit,
    stock: Number(product.stock),
    active: product.active !== false,
    sortOrder: Number(product.sort_order ?? product.sortOrder ?? 0),
    price: Number(product.price ?? 0)
  };
}

function productToSupabase(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    unit: product.unit,
    stock: Number(product.stock),
    active: Boolean(product.active),
    sort_order: Number(product.sortOrder ?? product.sort_order ?? 0)
  };
}

function attachPrices(products, prices, priceListId, includeUnpriced = false) {
  const priceByProductId = new Map(
    prices
      .filter((price) => price.priceListId === priceListId)
      .map((price) => [price.productId, Number(price.price)])
  );

  return products
    .filter((product) => includeUnpriced || priceByProductId.has(product.id))
    .map((product) => ({ ...product, price: priceByProductId.get(product.id) ?? 0 }));
}

async function getPartners() {
  if (hasMySql()) return mysqlDb.getPartners();
  if (hasSupabase()) {
    const rows = await supabaseFetch("partners?select=*&order=name.asc");
    return rows.map(normalizePartner);
  }
  const db = await readLocal();
  return db.partners.map(normalizePartner);
}

async function upsertPartner(partner) {
  const originalId = partner.originalId || partner.id;
  const normalized = normalizePartner(partner);
  if (!normalized.id || !normalized.name || !normalized.code || !normalized.priceListId) {
    throw new Error("Client incomplet");
  }

  if (hasMySql()) return mysqlDb.upsertPartner({ ...normalized, originalId });

  if (hasSupabase()) {
    if (originalId !== normalized.id) {
      const orders = await getOrders({ partnerId: originalId, includeInactive: true });
      if (orders.length) throw new Error("La modification de l’identifiant nécessite MySQL");
      await supabaseFetch(`partners?id=eq.${originalId}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      });
    }
    const rows = await supabaseFetch("partners?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(partnerToSupabase(normalized))
    });
    return normalizePartner(rows[0]);
  }

  const db = await readLocal();
  const index = db.partners.findIndex((item) => item.id === originalId);
  const record = {
    id: normalized.id,
    name: normalized.name,
    code: normalized.code,
    email: normalized.email,
    billingName: normalized.billingName,
    billingAddress: normalized.billingAddress,
    siret: normalized.siret,
    vatNumber: normalized.vatNumber,
    active: normalized.active,
    priceListId: normalized.priceListId
  };
  if (index >= 0) db.partners[index] = record;
  else db.partners.push(record);
  if (originalId !== normalized.id) {
    for (const order of db.orders) {
      if (order.partnerId === originalId) order.partnerId = normalized.id;
    }
    for (const allocation of db.productAllocations || []) {
      if (allocation.partnerId === originalId) allocation.partnerId = normalized.id;
    }
  }

  await writeLocal(db);
  return normalized;
}

async function deletePartner(partnerId) {
  if (hasMySql()) return mysqlDb.deletePartner(partnerId);
  if (hasSupabase()) {
    const orders = await getOrders({ partnerId, includeInactive: true });
    if (orders.length) throw new Error("Ce client possède des commandes. Désactivez-le pour conserver son historique.");
    await supabaseFetch(`partners?id=eq.${partnerId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    return { id: partnerId };
  }
  const db = await readLocal();
  if (db.orders.some((order) => order.partnerId === partnerId)) {
    throw new Error("Ce client possède des commandes. Désactivez-le pour conserver son historique.");
  }
  const before = db.partners.length;
  db.partners = db.partners.filter((partner) => partner.id !== partnerId);
  if (db.partners.length === before) throw new Error("Client introuvable");
  db.productAllocations = (db.productAllocations || []).filter((item) => item.partnerId !== partnerId);
  await writeLocal(db);
  return { id: partnerId };
}

async function getPartnerByCredentials(id, code) {
  if (hasMySql()) return mysqlDb.getPartnerByCredentials(id, code);
  const partners = await getPartners();
  return partners.find((partner) => partner.id === id && partner.code === code && partner.active);
}

async function getPriceLists() {
  if (hasMySql()) return mysqlDb.getPriceLists();
  if (hasSupabase()) return supabaseFetch("price_lists?select=*&order=name.asc");
  const db = await readLocal();
  return db.priceLists;
}

async function createPriceList(priceList) {
  if (!priceList?.id || !priceList?.name) throw new Error("Grille tarifaire incomplète");
  if (hasMySql()) return mysqlDb.createPriceList(priceList);
  if (hasSupabase()) {
    const rows = await supabaseFetch("price_lists", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(priceList)
    });
    return rows[0];
  }
  const db = await readLocal();
  if (db.priceLists.some((item) => item.id === priceList.id || item.name.localeCompare(priceList.name, "fr", { sensitivity: "base" }) === 0)) {
    const error = new Error("Cette grille tarifaire existe déjà");
    error.code = "PRICE_LIST_EXISTS";
    throw error;
  }
  db.priceLists.push(priceList);
  await writeLocal(db);
  return priceList;
}

async function renamePriceList({ id, name }) {
  if (hasMySql()) return mysqlDb.renamePriceList({ id, name });
  if (hasSupabase()) {
    const rows = await supabaseFetch(`price_lists?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name })
    });
    if (!rows[0]) throw new Error("Grille tarifaire introuvable");
    return rows[0];
  }
  const db = await readLocal();
  const priceList = db.priceLists.find((item) => item.id === id);
  if (!priceList) throw new Error("Grille tarifaire introuvable");
  priceList.name = name;
  await writeLocal(db);
  return priceList;
}

async function deletePriceList(id) {
  if (hasMySql()) return mysqlDb.deletePriceList(id);
  if (hasSupabase()) {
    await supabaseFetch(`price_lists?id=eq.${id}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    return { id };
  }
  const db = await readLocal();
  if (db.partners.some((partner) => partner.priceListId === id)) {
    const error = new Error("Cette grille est utilisée par un client");
    error.code = "PRICE_LIST_IN_USE";
    throw error;
  }
  db.priceLists = db.priceLists.filter((item) => item.id !== id);
  db.productPrices = db.productPrices.filter((item) => item.priceListId !== id);
  await writeLocal(db);
  return { id };
}

async function renameProductCategory({ currentName, nextName }) {
  if (hasMySql()) return mysqlDb.renameProductCategory({ currentName, nextName });
  if (hasSupabase()) {
    const rows = await supabaseFetch(`products?category=eq.${encodeURIComponent(currentName)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ category: nextName })
    });
    return { currentName, nextName, updatedProducts: rows.length };
  }
  const db = await readLocal();
  let updatedProducts = 0;
  for (const product of db.products) {
    if (product.category === currentName) {
      product.category = nextName;
      updatedProducts += 1;
    }
  }
  await writeLocal(db);
  return { currentName, nextName, updatedProducts };
}

async function deleteProductCategory(name) {
  if (hasMySql()) return mysqlDb.deleteProductCategory(name);
  if (hasSupabase()) {
    const rows = await supabaseFetch(`products?category=eq.${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ category: "Autres" })
    });
    return { name, updatedProducts: rows.length };
  }
  const db = await readLocal();
  let updatedProducts = 0;
  for (const product of db.products) {
    if (product.category === name) {
      product.category = "Autres";
      updatedProducts += 1;
    }
  }
  await writeLocal(db);
  return { name, updatedProducts };
}

async function getProductPrices(priceListId) {
  if (hasMySql()) return mysqlDb.getProductPrices(priceListId);
  if (hasSupabase()) {
    const rows = await supabaseFetch(`product_prices?select=*&price_list_id=eq.${priceListId}`);
    return rows.map((row) => ({
      priceListId: row.price_list_id,
      productId: row.product_id,
      price: Number(row.price)
    }));
  }
  const db = await readLocal();
  return db.productPrices.filter((price) => price.priceListId === priceListId);
}

async function getProductAllocations({ partnerId, deliveryDate, inheritPrevious = false }) {
  if (hasMySql()) return mysqlDb.getProductAllocations({ partnerId, deliveryDate, inheritPrevious });
  if (hasSupabase()) {
    let rows = await supabaseFetch(
      `product_allocations?select=product_id,quantity,visible&partner_id=eq.${partnerId}&delivery_date=eq.${deliveryDate}`
    );
    if (!rows.length && inheritPrevious) {
      const previous = await supabaseFetch(
        `product_allocations?select=delivery_date&partner_id=eq.${partnerId}&delivery_date=lt.${deliveryDate}&order=delivery_date.desc&limit=1`
      );
      if (previous[0]?.delivery_date) rows = await supabaseFetch(
        `product_allocations?select=product_id,quantity,visible&partner_id=eq.${partnerId}&delivery_date=eq.${previous[0].delivery_date}`
      );
    }
    return rows.map((row) => ({
      productId: row.product_id,
      quantity: Number(row.quantity),
      visible: row.visible !== false
    }));
  }
  const db = await readLocal();
  let records = (db.productAllocations || []).filter((item) => item.partnerId === partnerId && item.deliveryDate === deliveryDate);
  if (!records.length && inheritPrevious) {
    const previousDate = (db.productAllocations || []).filter((item) => item.partnerId === partnerId && item.deliveryDate < deliveryDate)
      .map((item) => item.deliveryDate).sort().reverse()[0];
    records = previousDate ? (db.productAllocations || []).filter((item) => item.partnerId === partnerId && item.deliveryDate === previousDate) : [];
  }
  return records
    .map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity),
      visible: item.visible !== false
    }));
}

async function getAvailabilityMessage({ partnerId, deliveryDate }) {
  if (hasMySql()) return mysqlDb.getAvailabilityMessage({ partnerId, deliveryDate });
  if (hasSupabase()) {
    const rows = await supabaseFetch(`availability_messages?select=message&partner_id=eq.${partnerId}&delivery_date=eq.${deliveryDate}`);
    return rows[0]?.message || "";
  }
  const db = await readLocal();
  return (db.availabilityMessages || []).find((item) => item.partnerId === partnerId && item.deliveryDate === deliveryDate)?.message || "";
}

async function saveAvailabilityMessage({ partnerId, deliveryDate, message }) {
  const normalized = String(message || "").trim();
  if (hasMySql()) return mysqlDb.saveAvailabilityMessage({ partnerId, deliveryDate, message: normalized });
  if (hasSupabase()) {
    await supabaseFetch("availability_messages?on_conflict=delivery_date,partner_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ delivery_date: deliveryDate, partner_id: partnerId, message: normalized }) });
    return normalized;
  }
  const db = await readLocal();
  db.availabilityMessages = (db.availabilityMessages || []).filter((item) => !(item.partnerId === partnerId && item.deliveryDate === deliveryDate));
  db.availabilityMessages.push({ partnerId, deliveryDate, message: normalized });
  await writeLocal(db);
  return normalized;
}

async function getBasketTemplates({ partnerId, includeInactive = false } = {}) {
  if (hasMySql()) return mysqlDb.getBasketTemplates({ partnerId, includeInactive });
  if (hasSupabase()) {
    const filters = ["select=*", "order=name.asc"];
    if (partnerId) filters.push(`partner_id=eq.${encodeURIComponent(partnerId)}`);
    if (!includeInactive) filters.push("active=eq.true");
    const templates = await supabaseFetch(`basket_templates?${filters.join("&")}`);
    if (!templates.length) return [];
    const ids = templates.map((item) => item.id).join(",");
    const items = await supabaseFetch(`basket_template_items?select=*&basket_id=in.(${ids})&order=sort_order.asc`);
    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      partnerId: template.partner_id,
      active: Boolean(template.active),
      items: items.filter((item) => item.basket_id === template.id).map((item) => ({
        productId: item.product_id,
        quantity: Number(item.quantity),
        sortOrder: Number(item.sort_order || 0)
      }))
    }));
  }
  const db = await readLocal();
  return (db.basketTemplates || [])
    .filter((template) => (!partnerId || template.partnerId === partnerId) && (includeInactive || template.active !== false))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((template) => ({
      ...template,
      active: template.active !== false,
      items: (db.basketTemplateItems || [])
        .filter((item) => item.basketId === template.id)
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
        .map(({ basketId, ...item }) => item)
    }));
}

async function upsertBasketTemplate(template) {
  const record = {
    id: String(template.id || randomUUID()),
    name: String(template.name || "").trim(),
    partnerId: String(template.partnerId || ""),
    active: template.active !== false,
    items: (template.items || []).map((item, index) => ({
      productId: String(item.productId || ""),
      quantity: Number(item.quantity),
      sortOrder: index
    })).filter((item) => item.productId && item.quantity > 0)
  };
  if (!record.name || !record.partnerId || !record.items.length) throw new Error("Panier incomplet");
  if (hasMySql()) return mysqlDb.upsertBasketTemplate(record);
  if (hasSupabase()) {
    await supabaseFetch("basket_templates?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: record.id, name: record.name, partner_id: record.partnerId, active: record.active })
    });
    await supabaseFetch(`basket_template_items?basket_id=eq.${record.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await supabaseFetch("basket_template_items", {
      method: "POST",
      body: JSON.stringify(record.items.map((item) => ({ basket_id: record.id, product_id: item.productId, quantity: item.quantity, sort_order: item.sortOrder })))
    });
    return record;
  }
  const db = await readLocal();
  const index = (db.basketTemplates || []).findIndex((item) => item.id === record.id);
  const base = { id: record.id, name: record.name, partnerId: record.partnerId, active: record.active };
  if (index >= 0) db.basketTemplates[index] = base;
  else db.basketTemplates.push(base);
  db.basketTemplateItems = (db.basketTemplateItems || []).filter((item) => item.basketId !== record.id);
  db.basketTemplateItems.push(...record.items.map((item) => ({ basketId: record.id, ...item })));
  await writeLocal(db);
  return record;
}

async function deleteBasketTemplate(id) {
  if (hasMySql()) return mysqlDb.deleteBasketTemplate(id);
  if (hasSupabase()) {
    await supabaseFetch(`basket_templates?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return { id };
  }
  const db = await readLocal();
  db.basketTemplates = (db.basketTemplates || []).filter((item) => item.id !== id);
  db.basketTemplateItems = (db.basketTemplateItems || []).filter((item) => item.basketId !== id);
  await writeLocal(db);
  return { id };
}

async function getClientGroups() {
  if (hasMySql()) return mysqlDb.getClientGroups();
  if (hasSupabase()) {
    const [groups, members] = await Promise.all([
      supabaseFetch("client_groups?select=*&order=name.asc"),
      supabaseFetch("client_group_members?select=*")
    ]);
    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      memberIds: members.filter((member) => member.group_id === group.id).map((member) => member.partner_id)
    }));
  }
  const db = await readLocal();
  return (db.clientGroups || []).map((group) => ({
    ...group,
    memberIds: (db.clientGroupMembers || []).filter((member) => member.groupId === group.id).map((member) => member.partnerId)
  })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

async function upsertClientGroup(group) {
  if (hasMySql()) return mysqlDb.upsertClientGroup(group);
  const record = {
    id: String(group.id || randomUUID()),
    name: String(group.name || "").trim(),
    memberIds: Array.from(new Set((group.memberIds || []).map(String).filter(Boolean)))
  };
  if (!record.name || !record.memberIds.length) throw new Error("Nom du groupe et au moins un client requis");
  if (hasSupabase()) {
    await supabaseFetch("client_groups?on_conflict=id", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: record.id, name: record.name })
    });
    await supabaseFetch(`client_group_members?group_id=eq.${record.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await supabaseFetch("client_group_members", {
      method: "POST", body: JSON.stringify(record.memberIds.map((partnerId) => ({ group_id: record.id, partner_id: partnerId })))
    });
    return record;
  }
  const db = await readLocal();
  const index = (db.clientGroups || []).findIndex((item) => item.id === record.id);
  const base = { id: record.id, name: record.name };
  if (index >= 0) db.clientGroups[index] = base;
  else db.clientGroups.push(base);
  db.clientGroupMembers = (db.clientGroupMembers || []).filter((member) => member.groupId !== record.id);
  db.clientGroupMembers.push(...record.memberIds.map((partnerId) => ({ groupId: record.id, partnerId })));
  await writeLocal(db);
  return record;
}

async function deleteClientGroup(id) {
  if (hasMySql()) return mysqlDb.deleteClientGroup(id);
  if (hasSupabase()) {
    await supabaseFetch(`client_groups?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return { id };
  }
  const db = await readLocal();
  const before = db.clientGroups.length;
  db.clientGroups = db.clientGroups.filter((group) => group.id !== id);
  if (db.clientGroups.length === before) throw new Error("Groupe introuvable");
  db.clientGroupMembers = db.clientGroupMembers.filter((member) => member.groupId !== id);
  await writeLocal(db);
  return { id };
}

async function replaceProductAllocations({ partnerId, deliveryDate, allocations }) {
  if (hasMySql()) return mysqlDb.replaceProductAllocations({ partnerId, deliveryDate, allocations });
  if (hasSupabase()) {
    await supabaseFetch(`product_allocations?partner_id=eq.${partnerId}&delivery_date=eq.${deliveryDate}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    if (allocations.length) {
      await supabaseFetch("product_allocations", {
        method: "POST",
        body: JSON.stringify(allocations.map((item) => ({
          delivery_date: deliveryDate,
          partner_id: partnerId,
          product_id: item.productId,
          quantity: Number(item.quantity),
          visible: item.visible !== false
        })))
      });
    }
    return allocations;
  }
  const db = await readLocal();
  db.productAllocations = (db.productAllocations || []).filter(
    (item) => item.partnerId !== partnerId || item.deliveryDate !== deliveryDate
  );
  db.productAllocations.push(...allocations.map((item) => ({
    partnerId,
    deliveryDate,
    productId: item.productId,
    quantity: Number(item.quantity),
    visible: item.visible !== false
  })));
  await writeLocal(db);
  return allocations;
}

async function validateProductAllocations({ partnerId, deliveryDate, items, excludeOrderId }) {
  const allocations = await getProductAllocations({ partnerId, deliveryDate, inheritPrevious: true });
  if (!allocations.length) return;

  const allocationByProduct = new Map(allocations.map((item) => [item.productId, item]));
  const orders = await getOrders({ partnerId, deliveryDate });
  const alreadyOrdered = new Map();
  for (const order of orders) {
    if (order.id === excludeOrderId) continue;
    for (const item of order.items) {
      alreadyOrdered.set(item.productId, (alreadyOrdered.get(item.productId) || 0) + Number(item.quantity));
    }
  }

  for (const item of items) {
    const requested = Number(item.quantity || 0);
    if (requested <= 0) continue;
    const allocation = allocationByProduct.get(item.productId);
    if (!allocation || allocation.visible === false) {
      throw new Error("Ce produit n’est pas disponible pour ce client");
    }
    const allocated = Number(allocation.quantity);
    if (allocated <= 0) continue;
    const remaining = Math.max(0, allocated - (alreadyOrdered.get(item.productId) || 0));
    if (requested > remaining) throw new Error(`Disponibilité insuffisante pour ce produit (${remaining} restant)`);
  }
}

async function getProducts({ includeHidden = false, priceListId } = {}) {
  if (hasMySql()) return mysqlDb.getProducts({ includeHidden, priceListId });
  if (hasSupabase()) {
    const filter = includeHidden ? "" : "&active=eq.true";
    const rows = await supabaseFetch(`products?select=*${filter}&order=sort_order.asc`);
    const products = rows.map(normalizeProduct);
    if (!priceListId) return products;
    const prices = await getProductPrices(priceListId);
    return attachPrices(products, prices, priceListId, includeHidden);
  }

  const db = await readLocal();
  const products = db.products
    .map(normalizeProduct)
    .filter((product) => includeHidden || product.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (!priceListId) return products;
  return attachPrices(products, db.productPrices, priceListId, includeHidden);
}

async function upsertProduct(product) {
  if (hasMySql()) return mysqlDb.upsertProduct(product);
  const normalized = normalizeProduct(product);
  if (hasSupabase()) {
    if (!Object.hasOwn(product, "active")) {
      const existingRows = await supabaseFetch(`products?id=eq.${normalized.id}&select=active`);
      normalized.active = existingRows[0]?.active !== false;
    }
    const rows = await supabaseFetch("products?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(productToSupabase(normalized))
    });
    if (product.priceListId) {
      await upsertProductPrice(product.priceListId, normalized.id, Number(product.price));
    }
    return normalizeProduct(rows[0]);
  }

  const db = await readLocal();
  const index = db.products.findIndex((item) => item.id === normalized.id);
  if (!Object.hasOwn(product, "active") && index >= 0) {
    normalized.active = db.products[index].active !== false;
  }
  const productRecord = {
    id: normalized.id,
    name: normalized.name,
    category: normalized.category,
    unit: normalized.unit,
    stock: normalized.stock,
    active: normalized.active,
    sortOrder: normalized.sortOrder
  };
  if (index >= 0) db.products[index] = productRecord;
  else db.products.push(productRecord);

  if (product.priceListId) {
    const priceIndex = db.productPrices.findIndex(
      (item) => item.priceListId === product.priceListId && item.productId === normalized.id
    );
    const priceRecord = { priceListId: product.priceListId, productId: normalized.id, price: Number(product.price) };
    if (priceIndex >= 0) db.productPrices[priceIndex] = priceRecord;
    else db.productPrices.push(priceRecord);
  }

  await writeLocal(db);
  return normalized;
}

async function upsertProductPrice(priceListId, productId, price) {
  if (hasMySql()) return mysqlDb.upsertProductPrice(priceListId, productId, price);
  if (hasSupabase()) {
    await supabaseFetch("product_prices?on_conflict=price_list_id,product_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ price_list_id: priceListId, product_id: productId, price })
    });
    return;
  }

  const db = await readLocal();
  const index = db.productPrices.findIndex((item) => item.priceListId === priceListId && item.productId === productId);
  const record = { priceListId, productId, price: Number(price) };
  if (index >= 0) db.productPrices[index] = record;
  else db.productPrices.push(record);
  await writeLocal(db);
}

async function deleteProduct(productId) {
  if (!productId) throw new Error("Produit requis");

  if (hasMySql()) return mysqlDb.deleteProduct(productId);

  if (hasSupabase()) {
    await supabaseFetch(`product_prices?product_id=eq.${productId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    await supabaseFetch(`products?id=eq.${productId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    return { id: productId };
  }

  const db = await readLocal();
  const before = db.products.length;
  db.products = db.products.filter((product) => product.id !== productId);
  if (db.products.length === before) throw new Error("Produit introuvable");
  db.productPrices = db.productPrices.filter((price) => price.productId !== productId);
  await writeLocal(db);
  return { id: productId };
}

async function buildOrderItemsForPartner(partnerId, items, allowedBasketProductIds = new Set()) {
  const partners = await getPartners();
  const partner = partners.find((item) => item.id === partnerId && item.active);
  if (!partner) throw new Error("Partenaire inconnu");

  const products = await getProducts({ includeHidden: true, priceListId: partner.priceListId });
  const productById = new Map(products.map((product) => [product.id, product]));
  const cleanItems = items
    .map((item) => ({ product: productById.get(item.productId), quantity: Number(item.quantity) }))
    .filter((item) => item.product && (item.product.active || allowedBasketProductIds.has(item.product.id)) && item.quantity > 0);

  if (cleanItems.length === 0) {
    throw new Error("Commande vide");
  }

  return cleanItems.map((item) => ({
    id: randomUUID(),
    productId: item.product.id,
    productName: item.product.name,
    category: item.product.category,
    unit: item.product.unit,
    quantity: item.quantity,
    unitPrice: item.product.price
  }));
}

function calculateOrderTotal(orderItems) {
  return orderItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function itemToSupabase(item) {
  return {
    id: item.id,
    order_id: item.orderId,
    product_id: item.productId,
    product_name: item.productName,
    category: item.category,
    unit: item.unit,
    quantity: item.quantity,
    unit_price: item.unitPrice
  };
}

async function createOrder({ partnerId, deliveryDate, harvestDay, items, comment, basketSnapshots = [], allowedProductIds = [] }) {
  if (hasMySql()) return mysqlDb.createOrder({ partnerId, deliveryDate, harvestDay, items, comment, basketSnapshots, allowedProductIds });
  const allowedBasketProductIds = new Set([...allowedProductIds, ...basketSnapshots.flatMap((basket) => basket.items || []).map((item) => item.productId)]);
  const cleanItems = await buildOrderItemsForPartner(partnerId, items, allowedBasketProductIds);

  const order = {
    id: randomUUID(),
    partnerId,
    deliveryDate,
    harvestDay,
    status: "active",
    createdAt: new Date().toISOString(),
    total: calculateOrderTotal(cleanItems),
    comment: normalizeOrderComment(comment)
  };

  const orderItems = cleanItems.map((item) => ({
    ...item,
    orderId: order.id,
  }));
  const metadataItems = buildBasketMetadataItems(order.id, basketSnapshots);

  if (hasSupabase()) {
    await supabaseFetch("orders", {
      method: "POST",
      body: JSON.stringify({
        id: order.id,
        partner_id: order.partnerId,
        delivery_date: order.deliveryDate,
        harvest_day: order.harvestDay,
        status: order.status,
        created_at: order.createdAt,
        total: order.total,
        comment: order.comment
      })
    });
    await supabaseFetch("order_items", {
      method: "POST",
      body: JSON.stringify([...orderItems, ...metadataItems].map(itemToSupabase))
    });
    return { ...order, items: orderItems, baskets: basketSnapshots };
  }

  const db = await readLocal();
  db.orders.push(order);
  db.orderItems.push(...orderItems, ...metadataItems);
  await writeLocal(db);
  return { ...order, items: orderItems, baskets: basketSnapshots };
}

async function updateOrder({ orderId, partnerId, items, comment, allowedProductIds = [] }) {
  if (hasMySql()) return mysqlDb.updateOrder({ orderId, partnerId, items, comment, allowedProductIds });
  const cleanItems = await buildOrderItemsForPartner(partnerId, items, new Set(allowedProductIds));
  const total = calculateOrderTotal(cleanItems);
  const orderItems = cleanItems.map((item) => ({ ...item, orderId }));

  if (hasSupabase()) {
    const rows = await supabaseFetch(`orders?id=eq.${orderId}&partner_id=eq.${partnerId}&status=eq.active&select=*`);
    const order = rows[0];
    if (!order) throw new Error("Commande introuvable");
    const existingItemRows = await supabaseFetch(`order_items?order_id=eq.${orderId}&select=*`);
    const basketMetadataItems = existingItemRows.map((item) => ({
      id: item.id, orderId: item.order_id, productId: item.product_id, productName: item.product_name,
      category: item.category, unit: item.unit, quantity: Number(item.quantity), unitPrice: Number(item.unit_price)
    })).filter(isBasketMetadataItem);

    await supabaseFetch(`orders?id=eq.${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ total, ...(comment === undefined ? {} : { comment: normalizeOrderComment(comment) }) })
    });
    await supabaseFetch(`order_items?order_id=eq.${orderId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    await supabaseFetch("order_items", {
      method: "POST",
      body: JSON.stringify([...orderItems, ...basketMetadataItems].map(itemToSupabase))
    });

    return {
      id: order.id,
      partnerId: order.partner_id,
      deliveryDate: order.delivery_date,
      harvestDay: order.harvest_day,
      status: order.status,
      createdAt: order.created_at,
      total,
      comment: comment === undefined ? (order.comment || "") : normalizeOrderComment(comment),
      ...splitBasketMetadata([...orderItems, ...basketMetadataItems])
    };
  }

  const db = await readLocal();
  const orderIndex = db.orders.findIndex(
    (order) => order.id === orderId && order.partnerId === partnerId && order.status === "active"
  );
  if (orderIndex < 0) throw new Error("Commande introuvable");
  const basketMetadataItems = db.orderItems.filter((item) => item.orderId === orderId && isBasketMetadataItem(item));

  db.orders[orderIndex] = {
    ...db.orders[orderIndex],
    total,
    ...(comment === undefined ? {} : { comment: normalizeOrderComment(comment) })
  };
  db.orderItems = db.orderItems.filter((item) => item.orderId !== orderId);
  db.orderItems.push(...orderItems, ...basketMetadataItems);
  await writeLocal(db);

  return { ...db.orders[orderIndex], ...splitBasketMetadata([...orderItems, ...basketMetadataItems]) };
}

async function cancelOrder({ orderId, partnerId }) {
  if (hasMySql()) return mysqlDb.cancelOrder({ orderId, partnerId });
  if (hasSupabase()) {
    const rows = await supabaseFetch(`orders?id=eq.${orderId}&partner_id=eq.${partnerId}&status=eq.active&select=*`);
    const order = rows[0];
    if (!order) throw new Error("Commande introuvable");
    const items = await supabaseFetch(`order_items?select=*&order_id=eq.${orderId}`);

    await supabaseFetch(`orders?id=eq.${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" })
    });

    return {
      id: order.id,
      partnerId: order.partner_id,
      deliveryDate: order.delivery_date,
      harvestDay: order.harvest_day,
      status: "cancelled",
      createdAt: order.created_at,
      total: Number(order.total),
      comment: order.comment || "",
      items: items.map((item) => ({
        id: item.id,
        orderId: item.order_id,
        productId: item.product_id,
        productName: item.product_name,
        category: item.category,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price)
      }))
    };
  }

  const db = await readLocal();
  const orderIndex = db.orders.findIndex(
    (order) => order.id === orderId && order.partnerId === partnerId && order.status === "active"
  );
  if (orderIndex < 0) throw new Error("Commande introuvable");

  db.orders[orderIndex] = { ...db.orders[orderIndex], status: "cancelled" };
  await writeLocal(db);

  return { ...db.orders[orderIndex], items: db.orderItems.filter((item) => item.orderId === orderId) };
}

async function validateOrder({ orderId, partnerId }) {
  if (hasMySql()) return mysqlDb.validateOrder({ orderId, partnerId });
  if (hasSupabase()) {
    const rows = await supabaseFetch(`orders?id=eq.${orderId}&partner_id=eq.${partnerId}&status=eq.active&select=*`);
    const order = rows[0];
    if (!order) throw new Error("Commande introuvable");
    const items = await supabaseFetch(`order_items?select=*&order_id=eq.${orderId}`);

    await supabaseFetch(`orders?id=eq.${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "validated" })
    });

    return {
      id: order.id,
      partnerId: order.partner_id,
      deliveryDate: order.delivery_date,
      harvestDay: order.harvest_day,
      status: "validated",
      createdAt: order.created_at,
      total: Number(order.total),
      comment: order.comment || "",
      items: items.map((item) => ({
        id: item.id,
        orderId: item.order_id,
        productId: item.product_id,
        productName: item.product_name,
        category: item.category,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price)
      }))
    };
  }

  const db = await readLocal();
  const orderIndex = db.orders.findIndex(
    (order) => order.id === orderId && order.partnerId === partnerId && order.status === "active"
  );
  if (orderIndex < 0) throw new Error("Commande introuvable");

  db.orders[orderIndex] = { ...db.orders[orderIndex], status: "validated" };
  await writeLocal(db);

  return { ...db.orders[orderIndex], items: db.orderItems.filter((item) => item.orderId === orderId) };
}

async function getOrders({ deliveryDate, partnerId, includeInactive = false } = {}) {
  if (hasMySql()) return mysqlDb.getOrders({ deliveryDate, partnerId, includeInactive });
  if (hasSupabase()) {
    const orderFilter = deliveryDate ? `&delivery_date=eq.${deliveryDate}` : "";
    const partnerFilter = partnerId ? `&partner_id=eq.${partnerId}` : "";
    const statusFilter = includeInactive ? "" : "&status=eq.active";
    const orders = await supabaseFetch(`orders?select=*${statusFilter}${orderFilter}${partnerFilter}&order=created_at.desc`);
    const ids = orders.map((order) => order.id);
    const items = ids.length
      ? await supabaseFetch(`order_items?select=*&order_id=in.(${ids.join(",")})`)
      : [];
    return orders.map((order) => {
      const split = splitBasketMetadata(items.filter((item) => item.order_id === order.id).map((item) => ({
        id: item.id, orderId: item.order_id, productId: item.product_id, productName: item.product_name,
        category: item.category, unit: item.unit, quantity: Number(item.quantity), unitPrice: Number(item.unit_price)
      })));
      return ({
      id: order.id,
      partnerId: order.partner_id,
      deliveryDate: order.delivery_date,
      harvestDay: order.harvest_day,
      status: order.status,
      createdAt: order.created_at,
      total: Number(order.total),
      comment: order.comment || "",
      items: split.items,
      baskets: split.baskets
    }); });
  }

  const db = await readLocal();
  return db.orders
    .filter((order) =>
      (includeInactive || order.status === "active") &&
      (!deliveryDate || order.deliveryDate === deliveryDate) &&
      (!partnerId || order.partnerId === partnerId)
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((order) => {
      const split = splitBasketMetadata(db.orderItems.filter((item) => item.orderId === order.id));
      return { ...order, items: split.items, baskets: split.baskets };
    });
}

module.exports = {
  cancelOrder,
  createPriceList,
  createOrder,
  deletePriceList,
  deleteClientGroup,
  deletePartner,
  deleteProductCategory,
  deleteProduct,
  getOrders,
  getBasketTemplates,
  getAvailabilityMessage,
  getClientGroups,
  getPartnerByCredentials,
  getPartners,
  getPriceLists,
  getProductAllocations,
  getProducts,
  replaceProductAllocations,
  saveAvailabilityMessage,
  upsertBasketTemplate,
  upsertClientGroup,
  deleteBasketTemplate,
  renamePriceList,
  renameProductCategory,
  updateOrder,
  upsertPartner,
  validateOrder,
  upsertProduct,
  upsertProductPrice,
  validateProductAllocations
};
