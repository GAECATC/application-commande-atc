const fs = require("fs");
const path = require("path");

const seed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "seed.json"), "utf8"));
const output = path.join(process.cwd(), "supabase", "seed-data.sql");

function q(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function values(rows, mapper) {
  return rows.map((row) => `  (${mapper(row).join(", ")})`).join(",\n");
}

const sql = [];

sql.push(`insert into products (id, name, category, unit, stock, active, sort_order) values\n${values(seed.products, (product) => [
  q(product.id),
  q(product.name),
  q(product.category),
  q(product.unit),
  Number(product.stock || 0),
  product.active ? "true" : "false",
  Number(product.sortOrder || 100)
])}\non conflict (id) do update set\n  name = excluded.name,\n  category = excluded.category,\n  unit = excluded.unit,\n  stock = excluded.stock,\n  active = excluded.active,\n  sort_order = excluded.sort_order;`);

sql.push(`insert into product_prices (price_list_id, product_id, price) values\n${values(seed.productPrices, (price) => [
  q(price.priceListId),
  q(price.productId),
  Number(price.price)
])}\non conflict (price_list_id, product_id) do update set\n  price = excluded.price;`);

fs.writeFileSync(output, `${sql.join("\n\n")}\n`);
console.log(`Wrote ${output}`);
