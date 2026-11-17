const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");

function storage() {
  const sourcePath = require.resolve("../lib/mysql-db");
  const localRequire = createRequire(sourcePath);
  const rows = [];
  const calls = [];
  let missingTable = false;
  const execute = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("information_schema.columns")) return [[{ exists: 1 }]];
    if (sql.startsWith("select * from orders")) return [[{ id: "o1", partner_id: "p1", status: "validated", delivery_date: "2026-11-18", created_at: "2026-11-17 12:00:00", total: 10 }]];
    if (sql.startsWith("select * from order_items")) return [[]];
    if (sql.startsWith("select * from order_comment_replies")) {
      if (missingTable) { const error = new Error(); error.code = "ER_NO_SUCH_TABLE"; throw error; }
      return [rows];
    }
    if (sql.includes("insert into order_comment_replies")) {
      rows.push({ id: params[0], order_id: params[6], message: params[1], customer_comment: params[2], recipient: params[3], created_at: params[4], email_status: params[5] });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("update order_comment_replies")) {
      rows.find((row) => row.id === params[1]).email_status = params[0];
      return [{ affectedRows: 1 }];
    }
    throw new Error(`SQL inattendu : ${sql}`);
  };
  const context = vm.createContext({ module: { exports: {} }, process: { env: {} }, require: (name) => name === "mysql2/promise" ? { createPool: () => ({ execute }) } : localRequire(name) });
  vm.runInContext(fs.readFileSync(sourcePath, "utf8"), context);
  return { db: context.module.exports, calls, setMissingTable: () => { missingTable = true; } };
}

test("une réponse MySQL se relit après archivage sans modifier les lignes de commande", async () => {
  const { db, calls } = storage();
  const reply = { id: "r1", message: "Oui.", comment: "Petits choux ?", recipient: "test@example.invalid", createdAt: "2026-11-17T12:00:00.000Z", emailStatus: "pending" };
  await db.createOrderReply({ orderId: "o1", partnerId: "p1", reply });
  await db.updateOrderReplyStatus({ orderId: "o1", replyId: "r1", emailStatus: "sent" });
  const orders = await db.getOrders({ includeInactive: true, includeReplies: true });
  assert.equal(orders[0].status, "validated");
  assert.equal(orders[0].replies[0].message, reply.message);
  assert.equal(orders[0].replies[0].emailStatus, "sent");
  assert.equal(orders[0].replies[0].createdAt, reply.createdAt);
  assert.ok(!calls.some(({ sql }) => /^(update orders|delete|alter|create table)/i.test(sql)));
});

test("les lectures ordinaires n'exposent pas les réponses administrateur", async () => {
  const { db, calls } = storage();
  const orders = await db.getOrders({ includeInactive: true });
  assert.equal(orders[0].replies, undefined);
  assert.ok(!calls.some(({ sql }) => sql.includes("order_comment_replies")));
});

test("une table encore absente ne provoque aucune migration automatique", async () => {
  const { db, calls, setMissingTable } = storage();
  setMissingTable();
  const orders = await db.getOrders({ includeReplies: true });
  assert.equal(orders[0].replies.length, 0);
  assert.ok(!calls.some(({ sql }) => /^(alter|create table)/i.test(sql)));
});
