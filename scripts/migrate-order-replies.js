const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const mysql = require("mysql2/promise");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

async function main() {
  if (!process.argv.includes("--apply")) throw new Error("Aucune modification. --apply nécessite la validation humaine de la migration.");
  for (const key of ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"]) {
    if (!process.env[key]) throw new Error(`Configuration MySQL manquante : ${key}`);
  }
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE, user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD, dateStrings: true
  });
  try {
    const [existing] = await db.execute("select 1 from information_schema.tables where table_schema = database() and table_name = 'order_comment_replies'");
    if (existing.length) {
      await db.query("select id, order_id, message, customer_comment, recipient, created_at, email_status from order_comment_replies limit 0");
      console.log("Stockage des réponses déjà installé. Aucune modification.");
      return;
    }
    await db.query("set transaction isolation level repeatable read");
    await db.query("start transaction with consistent snapshot");
    const [orders] = await db.query("select * from orders order by id");
    const [items] = await db.query("select * from order_items order by id");
    await db.commit();
    const backupDir = path.resolve("data", "backups");
    await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
    const backup = path.join(backupDir, `avant-historique-reponses-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    const content = JSON.stringify({ savedAt: new Date().toISOString(), orders, items });
    await fs.writeFile(backup, content, { flag: "wx", mode: 0o600 });
    const saved = await fs.readFile(backup, "utf8");
    const hash = (value) => createHash("sha256").update(value).digest("hex");
    if (hash(content) !== hash(saved)) throw new Error("Sauvegarde non vérifiée. Migration annulée.");
    console.log(`Sauvegarde vérifiée : ${backup} (${orders.length} commandes, ${items.length} lignes).`);
    await db.query(await fs.readFile(path.resolve("database", "mysql", "order-comment-replies.sql"), "utf8"));
    console.log("Table des réponses créée. Aucune commande ni ligne existante modifiée.");
  } finally {
    await db.end();
  }
}

main().catch(() => { console.error("Migration interrompue. Vérifiez la connexion MySQL, les droits et la sauvegarde avant de continuer."); process.exitCode = 1; });
