const mysql = require("mysql2/promise");
const { randomUUID } = require("crypto");
const { resolveProductCategory } = require("./product-categories");
const { normalizeOrderComment } = require("./order-comment");

let pool;
let orderCommentColumnReady;
let basketTablesReady;

function hasMySql() {
  return Boolean(
    process.env.MYSQL_HOST &&
    process.env.MYSQL_DATABASE &&
    process.env.MYSQL_USER &&
    process.env.MYSQL_PASSWORD
  );
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      database: process.env.MYSQL_DATABASE,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5),
      charset: "utf8mb4",
      dateStrings: true
    });
  }
  return pool;
}

function normalizePartner(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    email: row.email || "",
    billingName: row.billing_name || "",
    billingAddress: row.billing_address || "",
    siret: row.siret || "",
    vatNumber: row.vat_number || "",
    active: Boolean(row.active),
    priceListId: row.price_list_id
  };
}

function normalizeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: resolveProductCategory(row),
    unit: row.unit,
    stock: Number(row.stock),
    active: row.active !== 0 && row.active !== false,
    sortOrder: Number(row.sort_order || 0),
    price: Number(row.price || 0)
  };
}

function normalizeOrder(row, items) {
  return {
    id: row.id,
    partnerId: row.partner_id,
    deliveryDate: row.delivery_date,
    harvestDay: row.harvest_day,
    status: row.status,
    createdAt: fromMySqlDateTime(row.created_at),
    total: Number(row.total),
    comment: row.customer_comment || "",
    items
  };
}

async function ensureOrderCommentColumn() {
  if (!orderCommentColumnReady) {
    orderCommentColumnReady = (async () => {
      const rows = await query(
        `select 1 from information_schema.columns
         where table_schema = database() and table_name = 'orders' and column_name = 'customer_comment'
         limit 1`
      );
      if (!rows.length) await getPool().execute("alter table orders add column customer_comment text null after total");
    })().catch((error) => {
      orderCommentColumnReady = null;
      throw error;
    });
  }
  return orderCommentColumnReady;
}

async function ensureBasketTables() {
  if (!basketTablesReady) {
    basketTablesReady = (async () => {
      await query(`create table if not exists basket_templates (
        id varchar(191) primary key,
        name varchar(255) not null,
        partner_id varchar(191) not null,
        active tinyint(1) not null default 1,
        constraint basket_templates_partner_fk foreign key (partner_id) references partners(id) on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`);
      await query(`create table if not exists basket_template_items (
        basket_id varchar(191) not null,
        product_id varchar(191) not null,
        quantity decimal(10, 2) not null,
        sort_order int not null default 0,
        primary key (basket_id, product_id),
        constraint basket_template_items_basket_fk foreign key (basket_id) references basket_templates(id) on delete cascade,
        constraint basket_template_items_product_fk foreign key (product_id) references products(id) on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`);
    })().catch((error) => {
      basketTablesReady = null;
      throw error;
    });
  }
  return basketTablesReady;
}

function toMySqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").replace("Z", "");
}

function fromMySqlDateTime(value) {
  if (!value || typeof value !== "string") return value;
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) return value;
  return `${value.replace(" ", "T")}Z`;
}

function normalizeOrderItem(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productName: row.product_name,
    category: row.category,
    unit: row.unit,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price)
  };
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function getPartners() {
  const rows = await query("select * from partners order by name asc");
  return rows.map(normalizePartner);
}

async function upsertPartner(partner) {
  const record = {
    id: partner.id,
    name: partner.name,
    code: partner.code,
    email: partner.email || "",
    billingName: partner.billingName || "",
    billingAddress: partner.billingAddress || "",
    siret: partner.siret || "",
    vatNumber: partner.vatNumber || "",
    active: partner.active !== false,
    priceListId: partner.priceListId,
    originalId: partner.originalId || partner.id
  };
  if (!record.id || !record.name || !record.code || !record.priceListId) throw new Error("Client incomplet");

  if (record.originalId !== record.id) {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [existing] = await connection.execute("select id from partners where id = ? limit 1", [record.id]);
      if (existing.length) throw new Error("Cet identifiant client existe déjà");
      const [source] = await connection.execute("select id from partners where id = ? limit 1", [record.originalId]);
      if (!source.length) throw new Error("Client introuvable");

      await connection.execute(
        `insert into partners
          (id, name, code, email, billing_name, billing_address, siret, vat_number, active, price_list_id)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.name,
          record.code,
          record.email,
          record.billingName,
          record.billingAddress,
          record.siret,
          record.vatNumber,
          record.active ? 1 : 0,
          record.priceListId
        ]
      );
      await connection.execute("update orders set partner_id = ? where partner_id = ?", [record.id, record.originalId]);
      await connection.execute("update product_allocations set partner_id = ? where partner_id = ?", [record.id, record.originalId]);
      await connection.execute("delete from partners where id = ?", [record.originalId]);
      await connection.commit();
      return { ...record, originalId: undefined };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  await query(
    `insert into partners
      (id, name, code, email, billing_name, billing_address, siret, vat_number, active, price_list_id)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on duplicate key update
      name = values(name),
      code = values(code),
      email = values(email),
      billing_name = values(billing_name),
      billing_address = values(billing_address),
      siret = values(siret),
      vat_number = values(vat_number),
      active = values(active),
      price_list_id = values(price_list_id)`,
    [
      record.id,
      record.name,
      record.code,
      record.email,
      record.billingName,
      record.billingAddress,
      record.siret,
      record.vatNumber,
      record.active ? 1 : 0,
      record.priceListId
    ]
  );
  return record;
}

async function deletePartner(partnerId) {
  const orderRows = await query("select count(*) as count from orders where partner_id = ?", [partnerId]);
  if (Number(orderRows[0]?.count || 0) > 0) {
    const error = new Error("Ce client possède des commandes. Désactivez-le pour conserver son historique.");
    error.code = "CLIENT_HAS_ORDERS";
    throw error;
  }
  const [result] = await getPool().execute("delete from partners where id = ?", [partnerId]);
  if (!result.affectedRows) throw new Error("Client introuvable");
  return { id: partnerId };
}

async function getPartnerByCredentials(id, code) {
  const rows = await query("select * from partners where id = ? and code = ? and active = 1 limit 1", [id, code]);
  return rows[0] ? normalizePartner(rows[0]) : undefined;
}

async function getPriceLists() {
  return query("select id, name from price_lists order by name asc");
}

async function createPriceList({ id, name }) {
  await query("insert into price_lists (id, name) values (?, ?)", [id, name]);
  return { id, name };
}

async function renamePriceList({ id, name }) {
  const result = await query("update price_lists set name = ? where id = ?", [name, id]);
  if (!result.affectedRows) throw new Error("Grille tarifaire introuvable");
  return { id, name };
}

async function deletePriceList(id) {
  const result = await query("delete from price_lists where id = ?", [id]);
  if (!result.affectedRows) throw new Error("Grille tarifaire introuvable");
  return { id };
}

async function renameProductCategory({ currentName, nextName }) {
  const result = await query("update products set category = ? where category = ?", [nextName, currentName]);
  return { currentName, nextName, updatedProducts: result.affectedRows };
}

async function deleteProductCategory(name) {
  const result = await query("update products set category = 'Autres' where category = ?", [name]);
  return { name, updatedProducts: result.affectedRows };
}

async function getProductPrices(priceListId) {
  const rows = await query("select * from product_prices where price_list_id = ?", [priceListId]);
  return rows.map((row) => ({
    priceListId: row.price_list_id,
    productId: row.product_id,
    price: Number(row.price)
  }));
}

async function getProductAllocations({ partnerId, deliveryDate }) {
  try {
    const rows = await query(
      `select product_id, quantity, visible from product_allocations
       where partner_id = ? and delivery_date = ?`,
      [partnerId, deliveryDate]
    );
    return rows.map((row) => ({
      productId: row.product_id,
      quantity: Number(row.quantity),
      visible: Boolean(row.visible)
    }));
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
}

async function getBasketTemplates({ partnerId, includeInactive = false } = {}) {
  try {
    await ensureBasketTables();
    const params = [];
    const filters = [];
    if (partnerId) { filters.push("bt.partner_id = ?"); params.push(partnerId); }
    if (!includeInactive) filters.push("bt.active = 1");
    const templates = await query(
      `select bt.* from basket_templates bt${filters.length ? ` where ${filters.join(" and ")}` : ""} order by bt.name asc`,
      params
    );
    if (!templates.length) return [];
    const placeholders = templates.map(() => "?").join(",");
    const items = await query(
      `select * from basket_template_items where basket_id in (${placeholders}) order by sort_order asc`,
      templates.map((item) => item.id)
    );
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
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
}

async function upsertBasketTemplate(template) {
  await ensureBasketTables();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `insert into basket_templates (id, name, partner_id, active) values (?, ?, ?, ?)
       on duplicate key update name = values(name), partner_id = values(partner_id), active = values(active)`,
      [template.id, template.name, template.partnerId, template.active ? 1 : 0]
    );
    await connection.execute("delete from basket_template_items where basket_id = ?", [template.id]);
    for (const item of template.items) {
      await connection.execute(
        "insert into basket_template_items (basket_id, product_id, quantity, sort_order) values (?, ?, ?, ?)",
        [template.id, item.productId, item.quantity, item.sortOrder]
      );
    }
    await connection.commit();
    return template;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteBasketTemplate(id) {
  await ensureBasketTables();
  await query("delete from basket_templates where id = ?", [id]);
  return { id };
}

async function replaceProductAllocations({ partnerId, deliveryDate, allocations }) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      "delete from product_allocations where partner_id = ? and delivery_date = ?",
      [partnerId, deliveryDate]
    );
    for (const allocation of allocations) {
      await connection.execute(
        `insert into product_allocations (delivery_date, partner_id, product_id, quantity, visible)
         values (?, ?, ?, ?, ?)`,
        [deliveryDate, partnerId, allocation.productId, Number(allocation.quantity), allocation.visible !== false ? 1 : 0]
      );
    }
    await connection.commit();
    return getProductAllocations({ partnerId, deliveryDate });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getProducts({ includeHidden = false, priceListId } = {}) {
  const params = [];
  let sql = "select p.*";
  if (priceListId) sql += ", pp.price";
  sql += " from products p";
  if (priceListId) {
    sql += includeHidden
      ? " left join product_prices pp on pp.product_id = p.id and pp.price_list_id = ?"
      : " inner join product_prices pp on pp.product_id = p.id and pp.price_list_id = ?";
    params.push(priceListId);
  }
  if (!includeHidden) sql += " where p.active = 1";
  sql += " order by p.sort_order asc";
  const rows = await query(sql, params);
  return rows.map(normalizeProduct);
}

async function upsertProduct(product) {
  const existingRows = await query("select active from products where id = ? limit 1", [product.id]);
  const active = Object.hasOwn(product, "active") ? Boolean(product.active) : existingRows[0]?.active !== 0;
  const record = {
    id: product.id,
    name: product.name,
    category: product.category,
    unit: product.unit,
    stock: Number(product.stock || 0),
    active,
    sortOrder: Number(product.sortOrder || 100)
  };

  await query(
    `insert into products (id, name, category, unit, stock, active, sort_order)
     values (?, ?, ?, ?, ?, ?, ?)
     on duplicate key update
      name = values(name),
      category = values(category),
      unit = values(unit),
      stock = values(stock),
      active = values(active),
      sort_order = values(sort_order)`,
    [record.id, record.name, record.category, record.unit, record.stock, record.active ? 1 : 0, record.sortOrder]
  );
  if (product.priceListId) await upsertProductPrice(product.priceListId, record.id, Number(product.price || 0));
  return { ...record, price: Number(product.price || 0) };
}

async function upsertProductPrice(priceListId, productId, price) {
  await query(
    `insert into product_prices (price_list_id, product_id, price)
     values (?, ?, ?)
     on duplicate key update price = values(price)`,
    [priceListId, productId, Number(price)]
  );
}

async function deleteProduct(productId) {
  if (!productId) throw new Error("Produit requis");
  const [result] = await getPool().execute("delete from products where id = ?", [productId]);
  if (result.affectedRows === 0) throw new Error("Produit introuvable");
  return { id: productId };
}

async function buildOrderItemsForPartner(partnerId, items) {
  const partnerRows = await query("select * from partners where id = ? and active = 1 limit 1", [partnerId]);
  const partner = partnerRows[0] ? normalizePartner(partnerRows[0]) : null;
  if (!partner) throw new Error("Partenaire inconnu");

  const products = await getProducts({ includeHidden: true, priceListId: partner.priceListId });
  const productById = new Map(products.map((product) => [product.id, product]));
  const cleanItems = items
    .map((item) => ({ product: productById.get(item.productId), quantity: Number(item.quantity) }))
    .filter((item) => item.product && item.product.active && item.quantity > 0);

  if (cleanItems.length === 0) throw new Error("Commande vide");

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

function calculateOrderTotal(items) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

async function insertOrderItems(connection, orderItems) {
  for (const item of orderItems) {
    await connection.execute(
      `insert into order_items
        (id, order_id, product_id, product_name, category, unit, quantity, unit_price)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.orderId, item.productId, item.productName, item.category, item.unit, item.quantity, item.unitPrice]
    );
  }
}

async function createOrder({ partnerId, deliveryDate, harvestDay, items, comment }) {
  await ensureOrderCommentColumn();
  const cleanItems = await buildOrderItemsForPartner(partnerId, items);
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
  const orderItems = cleanItems.map((item) => ({ ...item, orderId: order.id }));

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `insert into orders (id, partner_id, delivery_date, harvest_day, status, created_at, total, customer_comment)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [order.id, order.partnerId, order.deliveryDate, order.harvestDay, order.status, toMySqlDateTime(order.createdAt), order.total, order.comment]
    );
    await insertOrderItems(connection, orderItems);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return { ...order, items: orderItems };
}

async function updateOrder({ orderId, partnerId, items, comment }) {
  await ensureOrderCommentColumn();
  const cleanItems = await buildOrderItemsForPartner(partnerId, items);
  const total = calculateOrderTotal(cleanItems);
  const orderItems = cleanItems.map((item) => ({ ...item, orderId }));

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute(
      "select * from orders where id = ? and partner_id = ? and status = 'active' limit 1",
      [orderId, partnerId]
    );
    if (!orders[0]) throw new Error("Commande introuvable");
    if (comment === undefined) {
      await connection.execute("update orders set total = ? where id = ?", [total, orderId]);
    } else {
      await connection.execute("update orders set total = ?, customer_comment = ? where id = ?", [total, normalizeOrderComment(comment), orderId]);
    }
    await connection.execute("delete from order_items where order_id = ?", [orderId]);
    await insertOrderItems(connection, orderItems);
    await connection.commit();
    return { ...normalizeOrder(orders[0], orderItems), total };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function changeOrderStatus({ orderId, partnerId, status }) {
  await ensureOrderCommentColumn();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute(
      "select * from orders where id = ? and partner_id = ? and status = 'active' limit 1",
      [orderId, partnerId]
    );
    if (!orders[0]) throw new Error("Commande introuvable");
    const [items] = await connection.execute("select * from order_items where order_id = ?", [orderId]);
    await connection.execute("update orders set status = ? where id = ?", [status, orderId]);
    await connection.commit();
    return normalizeOrder({ ...orders[0], status }, items.map(normalizeOrderItem));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cancelOrder({ orderId, partnerId }) {
  return changeOrderStatus({ orderId, partnerId, status: "cancelled" });
}

async function validateOrder({ orderId, partnerId }) {
  return changeOrderStatus({ orderId, partnerId, status: "validated" });
}

async function getOrders({ deliveryDate, partnerId, includeInactive = false } = {}) {
  await ensureOrderCommentColumn();
  const filters = [];
  const params = [];
  if (!includeInactive) filters.push("status = 'active'");
  if (deliveryDate) {
    filters.push("delivery_date = ?");
    params.push(deliveryDate);
  }
  if (partnerId) {
    filters.push("partner_id = ?");
    params.push(partnerId);
  }
  const where = filters.length ? ` where ${filters.join(" and ")}` : "";
  const orders = await query(`select * from orders${where} order by created_at desc`, params);
  if (orders.length === 0) return [];

  const placeholders = orders.map(() => "?").join(",");
  const items = await query(`select * from order_items where order_id in (${placeholders})`, orders.map((order) => order.id));
  const itemsByOrderId = new Map();
  for (const item of items.map(normalizeOrderItem)) {
    const list = itemsByOrderId.get(item.orderId) || [];
    list.push(item);
    itemsByOrderId.set(item.orderId, list);
  }
  return orders.map((order) => normalizeOrder(order, itemsByOrderId.get(order.id) || []));
}

module.exports = {
  cancelOrder,
  createPriceList,
  createOrder,
  deletePriceList,
  deletePartner,
  deleteProductCategory,
  deleteProduct,
  getOrders,
  getBasketTemplates,
  getPartnerByCredentials,
  getPartners,
  getPriceLists,
  getProductAllocations,
  getProducts,
  hasMySql,
  replaceProductAllocations,
  upsertBasketTemplate,
  deleteBasketTemplate,
  renamePriceList,
  renameProductCategory,
  updateOrder,
  upsertPartner,
  validateOrder,
  upsertProduct,
  upsertProductPrice
};
