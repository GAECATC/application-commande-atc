// Sauvegarde vérifiable avant d'ajouter un état de présence distinct du prix.
const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

async function main() {
  if (process.argv.includes("--apply") === false) {
    throw new Error("Aucune modification effectuée. Utiliser --apply après validation de la sauvegarde.");
  }
  for (const key of ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"]) {
    if (!process.env[key]) throw new Error(`Configuration MySQL manquante : ${key}`);
  }
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    dateStrings: true
  });
  try {
    const [columns] = await db.query("show columns from product_prices like 'listed'");
    if (columns.length) {
      console.log("Migration déjà effectuée : aucune modification.");
      return;
    }
    const [prices] = await db.query("select price_list_id, product_id, price from product_prices order by price_list_id, product_id");
    const [lists] = await db.query("select id, name from price_lists order by id");
    const [products] = await db.query("select id, name, unit from products order by id");
    const backupDir = path.resolve(process.cwd(), "data", "backups");
    await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
    const backupPath = path.join(backupDir, `tarifs-avant-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await fs.writeFile(backupPath, JSON.stringify({ savedAt: new Date().toISOString(), lists, products, prices }, null, 2), { flag: "wx", mode: 0o600 });
    const saved = JSON.parse(await fs.readFile(backupPath, "utf8"));
    if (saved.prices.length !== prices.length || saved.lists.length !== lists.length || saved.products.length !== products.length) {
      throw new Error("Sauvegarde incomplète : migration annulée.");
    }
    console.log(`Sauvegarde vérifiée : ${backupPath} (${prices.length} tarifs, ${products.length} produits).`);
    await db.query("alter table product_prices add column listed tinyint(1) not null default 1");
    console.log("Migration effectuée : les prix et les références existants sont conservés.");
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(`Échec de la migration : ${error.message}`); process.exitCode = 1; });
