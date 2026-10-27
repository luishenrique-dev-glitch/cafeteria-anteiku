// Execute apenas no computador da cafeteria após confirmar a compra.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const orders = require('./orders.cjs');
if (!/^[a-f0-9]{16}$/.test(process.argv[2] || '')) {
  console.error('Uso: node confirmar-pedido.cjs CODIGO_DO_PEDIDO');
  process.exitCode = 1;
} else {
  const db = new DatabaseSync(process.env.DATABASE_PATH || path.join(__dirname, 'data', 'cafeteria.sqlite'));
  try {
    db.exec('PRAGMA busy_timeout=5000');
    orders.setup(db);
    const order = orders.confirm(db, process.argv[2]);
    console.log(`Compra confirmada. Total: R$ ${(order.total / 100).toFixed(2)}. Benefício atualizado.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { db.close(); }
}
