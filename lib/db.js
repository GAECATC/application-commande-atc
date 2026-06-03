const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const SEED_FILE = path.join(DATA_DIR, "seed.json");

async function loadSeed() {
  const raw = await fs.readFile(SEED_FILE, "utf8");
  return JSON.parse(raw);
}

function hasSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function migrateLocal(db) {
  const seed = await loadSeed();
  const migrated = {
    priceLists: db.priceLists?.length ? db.priceLists : seed.priceLists,
    partners: db.partners?.length && db.partners.every((partner) => partner.priceListId)
      ? db.partners
      : seed.partners,
    products: db.products?.length && db.productPrices?.length ? db.products : seed.products,
    productPrices: db.productPrices?.length ? db.productPrices : seed.productPrices,
    orders: db.orders || [],
    orderItems: db.orderItems || []
  };
  return migrated;
}

async function readLocal() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return migrateLocal(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    const seed = await loadSeed();
    await writeLocal(seed);
    return structuredClone(seed);
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
    active: Boolean(partner.active),
    priceListId: partner.price_list_id ?? partner.priceListId
  };
}

function normalizeProduct(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    unit: product.unit,
    stock: Number(product.stock),
    active: Boolean(product.active),
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

function attachPrices(products, prices, priceListId) {
  const priceByProductId = new Map(
    prices
      .filter((price) => price.priceListId === priceListId)
      .map((price) => [price.productId, Number(price.price)])
  );

  return products
    .filter((product) => priceByProductId.has(product.id))
    .map((product) => ({ ...product, price: priceByProductId.get(product.id) }));
}

async function getPartners() {
  if (hasSupabase()) {
    const rows = await supabaseFetch("partners?select=*&order=name.asc");
    return rows.map(normalizePartner);
  }
  const db = await readLocal();
  return db.partners.map(normalizePartner);
}

async function getPartnerByCredentials(id, code) {
  const partners = await getPartners();
  return partners.find((partner) => partner.id === id && partner.code === code && partner.active);
}

async function getPriceLists() {
  if (hasSupabase()) return supabaseFetch("price_lists?select=*&order=name.asc");
  const db = await readLocal();
  return db.priceLists;
}

async function getProductPrices(priceListId) {
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

async function getProducts({ includeHidden = false, priceListId } = {}) {
  if (hasSupabase()) {
    const filter = includeHidden ? "" : "&active=eq.true";
    const rows = await supabaseFetch(`products?select=*${filter}&order=sort_order.asc`);
    const products = rows.map(normalizeProduct);
    if (!priceListId) return products;
    const prices = await getProductPrices(priceListId);
    return attachPrices(products, prices, priceListId);
  }

  const db = await readLocal();
  const products = db.products
    .map(normalizeProduct)
    .filter((product) => includeHidden || product.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (!priceListId) return products;
  return attachPrices(products, db.productPrices, priceListId);
}

async function upsertProduct(product) {
  const normalized = normalizeProduct(product);
  if (hasSupabase()) {
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

async function createOrder({ partnerId, deliveryDate, harvestDay, items }) {
  const partners = await getPartners();
  const partner = partners.find((item) => item.id === partnerId && item.active);
  if (!partner) throw new Error("Partenaire inconnu");

  const products = await getProducts({ includeHidden: true, priceListId: partner.priceListId });
  const productById = new Map(products.map((product) => [product.id, product]));
  const cleanItems = items
    .map((item) => ({ product: productById.get(item.productId), quantity: Number(item.quantity) }))
    .filter((item) => item.product && item.product.active && item.quantity > 0);

  if (cleanItems.length === 0) {
    throw new Error("Commande vide");
  }

  const order = {
    id: randomUUID(),
    partnerId,
    deliveryDate,
    harvestDay,
    status: "active",
    createdAt: new Date().toISOString(),
    total: cleanItems.reduce((sum, item) => sum + item.quantity * item.product.price, 0)
  };

  const orderItems = cleanItems.map((item) => ({
    id: randomUUID(),
    orderId: order.id,
    productId: item.product.id,
    productName: item.product.name,
    category: item.product.category,
    unit: item.product.unit,
    quantity: item.quantity,
    unitPrice: item.product.price
  }));

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
        total: order.total
      })
    });
    await supabaseFetch("order_items", {
      method: "POST",
      body: JSON.stringify(
        orderItems.map((item) => ({
          id: item.id,
          order_id: item.orderId,
          product_id: item.productId,
          product_name: item.productName,
          category: item.category,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unitPrice
        }))
      )
    });
    return { ...order, items: orderItems };
  }

  const db = await readLocal();
  db.orders.push(order);
  db.orderItems.push(...orderItems);
  await writeLocal(db);
  return { ...order, items: orderItems };
}

async function getOrders({ deliveryDate } = {}) {
  if (hasSupabase()) {
    const orderFilter = deliveryDate ? `&delivery_date=eq.${deliveryDate}` : "";
    const orders = await supabaseFetch(`orders?select=*&status=eq.active${orderFilter}&order=created_at.desc`);
    const ids = orders.map((order) => order.id);
    const items = ids.length
      ? await supabaseFetch(`order_items?select=*&order_id=in.(${ids.join(",")})`)
      : [];
    return orders.map((order) => ({
      id: order.id,
      partnerId: order.partner_id,
      deliveryDate: order.delivery_date,
      harvestDay: order.harvest_day,
      status: order.status,
      createdAt: order.created_at,
      total: Number(order.total),
      items: items
        .filter((item) => item.order_id === order.id)
        .map((item) => ({
          id: item.id,
          orderId: item.order_id,
          productId: item.product_id,
          productName: item.product_name,
          category: item.category,
          unit: item.unit,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unit_price)
        }))
    }));
  }

  const db = await readLocal();
  return db.orders
    .filter((order) => order.status === "active" && (!deliveryDate || order.deliveryDate === deliveryDate))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((order) => ({
      ...order,
      items: db.orderItems.filter((item) => item.orderId === order.id)
    }));
}

module.exports = {
  createOrder,
  getOrders,
  getPartnerByCredentials,
  getPartners,
  getPriceLists,
  getProducts,
  upsertProduct,
  upsertProductPrice
};
