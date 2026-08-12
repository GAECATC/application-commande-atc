const fs = require("fs/promises");
const path = require("path");
const mysql = require("mysql2/promise");

const ROOT = path.join(__dirname, "..");
const DEFAULT_JSON_FILE = path.join(ROOT, "data", "db.json");
const SCHEMA_FILE = path.join(ROOT, "database", "mysql", "schema.sql");

async function loadEnvFile(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable manquante: ${name}`);
  return value;
}

function toMySqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").replace("Z", "");
}

function statementsFromSql(sql) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function upsertAll(connection, table, columns, rows, updateColumns = columns) {
  for (const row of rows || []) {
    const placeholders = columns.map(() => "?").join(", ");
    const updates = updateColumns.map((column) => `${column} = values(${column})`).join(", ");
    await connection.execute(
      `insert into ${table} (${columns.join(", ")}) values (${placeholders}) on duplicate key update ${updates}`,
      columns.map((column) => row[column])
    );
  }
}

async function main() {
  await loadEnvFile(path.join(ROOT, ".env.local"));
  await loadEnvFile(path.join(ROOT, ".env"));

  const jsonFile = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_JSON_FILE;
  const raw = await fs.readFile(jsonFile, "utf8");
  const db = JSON.parse(raw);

  const connection = await mysql.createConnection({
    host: requireEnv("MYSQL_HOST"),
    port: Number(process.env.MYSQL_PORT || 3306),
    database: requireEnv("MYSQL_DATABASE"),
    user: requireEnv("MYSQL_USER"),
    password: requireEnv("MYSQL_PASSWORD"),
    charset: "utf8mb4",
    dateStrings: true,
    multipleStatements: false
  });

  try {
    const schema = await fs.readFile(SCHEMA_FILE, "utf8");
    for (const statement of statementsFromSql(schema)) {
      try {
        await connection.query(statement);
      } catch (error) {
        if (error.code !== "ER_DUP_KEYNAME") throw error;
      }
    }

    await connection.beginTransaction();

    await upsertAll(
      connection,
      "price_lists",
      ["id", "name"],
      (db.priceLists || []).map((item) => ({ id: item.id, name: item.name }))
    );

    await upsertAll(
      connection,
      "partners",
      [
        "id",
        "name",
        "code",
        "email",
        "billing_name",
        "billing_address",
        "siret",
        "vat_number",
        "active",
        "price_list_id"
      ],
      (db.partners || []).map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        email: item.email || "",
        billing_name: item.billingName || "",
        billing_address: item.billingAddress || "",
        siret: item.siret || "",
        vat_number: item.vatNumber || "",
        active: item.active === false ? 0 : 1,
        price_list_id: item.priceListId
      }))
    );

    await upsertAll(
      connection,
      "products",
      ["id", "name", "category", "unit", "stock", "active", "sort_order"],
      (db.products || []).map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        stock: Number(item.stock || 0),
        active: item.active === false ? 0 : 1,
        sort_order: Number(item.sortOrder || 100)
      }))
    );

    await upsertAll(
      connection,
      "product_prices",
      ["price_list_id", "product_id", "price"],
      (db.productPrices || []).map((item) => ({
        price_list_id: item.priceListId,
        product_id: item.productId,
        price: Number(item.price || 0)
      })),
      ["price"]
    );

    await upsertAll(
      connection,
      "orders",
      ["id", "partner_id", "delivery_date", "harvest_day", "status", "created_at", "total"],
      (db.orders || []).map((item) => ({
        id: item.id,
        partner_id: item.partnerId,
        delivery_date: item.deliveryDate,
        harvest_day: item.harvestDay,
        status: item.status || "active",
        created_at: toMySqlDateTime(item.createdAt),
        total: Number(item.total || 0)
      }))
    );

    await upsertAll(
      connection,
      "order_items",
      ["id", "order_id", "product_id", "product_name", "category", "unit", "quantity", "unit_price"],
      (db.orderItems || []).map((item) => ({
        id: item.id,
        order_id: item.orderId,
        product_id: item.productId,
        product_name: item.productName,
        category: item.category,
        unit: item.unit,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unitPrice || 0)
      }))
    );

    await upsertAll(
      connection,
      "applied_migrations",
      ["id"],
      (db.appliedMigrations || []).map((id) => ({ id })),
      ["id"]
    );

    await connection.commit();
    console.log(`Import MySQL termine depuis ${jsonFile}`);
    console.log(
      JSON.stringify(
        {
          priceLists: db.priceLists?.length || 0,
          partners: db.partners?.length || 0,
          products: db.products?.length || 0,
          productPrices: db.productPrices?.length || 0,
          orders: db.orders?.length || 0,
          orderItems: db.orderItems?.length || 0,
          appliedMigrations: db.appliedMigrations?.length || 0
        },
        null,
        2
      )
    );
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors outside an active transaction.
    }
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
