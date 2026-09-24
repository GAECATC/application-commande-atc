// Restaure seulement les prix absents, après sauvegarde. Ne touche jamais aux prix existants.
const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");
const { loadEnvConfig } = require("@next/env");
const reference = require("../data/tariff-reference.json");
const { planTariffRecovery } = require("../lib/tariff-recovery");

loadEnvConfig(process.cwd());

async function main() {
  const apply = process.argv.includes("--apply");
  for (const key of ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"]) {
    if (!process.env[key]) throw new Error(`Configuration MySQL manquante : ${key}`);
  }
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    dateStrings: true
  });
  try {
    const [columns] = await connection.query("show columns from product_prices like 'listed'");
    if (!columns.length) throw new Error("Migration listed absente : arrêt sans modification.");
    if (apply) await connection.beginTransaction();
    const [lists] = await connection.query("select id, name from price_lists order by id");
    const [products] = await connection.query("select id, name, unit from products order by id");
    const [prices] = await connection.query(`select price_list_id, product_id, price, listed from product_prices order by price_list_id, product_id${apply ? " for update" : ""}`);
    const plan = planTariffRecovery(reference, lists, products, prices);
    for (const group of plan) {
      console.log(`${group.name} : ${group.restore.length} tarif(s) restaurable(s), ${group.preserved} prix existant(s) préservé(s), ${group.review.length} cas à examiner.`);
      for (const item of group.review) console.log(`  À examiner : ${item}`);
    }
    if (!apply) { console.log("Lecture seule. Aucun tarif modifié."); return; }

    const backupDir = path.resolve(process.cwd(), "data", "backups");
    await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
    const backupPath = path.join(backupDir, `tarifs-avant-reprise-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await fs.writeFile(backupPath, JSON.stringify({ savedAt: new Date().toISOString(), lists, products, prices, plan }, null, 2), { flag: "wx", mode: 0o600 });
    const saved = JSON.parse(await fs.readFile(backupPath, "utf8"));
    if (saved.prices.length !== prices.length || saved.products.length !== products.length || saved.lists.length !== lists.length) {
      throw new Error("Sauvegarde incomplète : aucune reprise effectuée.");
    }
    console.log(`Sauvegarde vérifiée : ${backupPath}`);

    let restored = 0;
    for (const group of plan) {
      for (const item of group.restore) {
        const [updated] = await connection.execute(
          "update product_prices set price = ?, listed = 1 where price_list_id = ? and product_id = ? and price = 0 and listed = 0",
          [item.price, item.priceListId, item.productId]
        );
        if (updated.affectedRows === 1) { restored++; continue; }
        const [inserted] = await connection.execute(
          "insert ignore into product_prices (price_list_id, product_id, price, listed) values (?, ?, ?, 1)",
          [item.priceListId, item.productId, item.price]
        );
        if (inserted.affectedRows !== 1) throw new Error(`État modifié pendant la reprise pour ${item.productName} : transaction annulée.`);
        restored++;
      }
    }
    await connection.commit();
    console.log(`${restored} tarif(s) restauré(s). Aucun prix préexistant ni ajout manuel modifié.`);
  } catch (error) {
    if (apply) await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => { console.error(`Reprise arrêtée : ${error.message}`); process.exitCode = 1; });
