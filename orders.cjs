const catalog = [
  { name: 'Café Expresso', price: 800 }, { name: 'Cappuccino', price: 1200 },
  { name: 'Café Latte', price: 1400 }, { name: 'Mocha', price: 1600 }
];
function setup(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id),
    items TEXT NOT NULL, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL,
    total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
    CREATE UNIQUE INDEX IF NOT EXISTS first_purchase_once ON orders(customer_id) WHERE status='confirmed' AND discount>0;`);
}
function eligible(db, id) { return !db.prepare("SELECT 1 FROM orders WHERE customer_id=? AND status='confirmed'").get(id); }
function quote(db, id, items) {
  if (!Array.isArray(items) || !items.length || items.length > catalog.length) throw Error('Selecione pelo menos um café.');
  const seen = new Set();
  const lines = items.map(item => {
    if (!item || !Number.isInteger(item.id) || !catalog[item.id] || seen.has(item.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw Error('Seleção inválida.');
    seen.add(item.id);
    return { id: item.id, name: catalog[item.id].name, quantity: item.quantity, price: catalog[item.id].price };
  });
  const subtotal = lines.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = eligible(db, id) ? Math.round(subtotal * 14 / 100) : 0;
  return { items: lines, subtotal, discount, total: subtotal - discount };
}
function confirm(db, id) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if (!order) throw Error('Pedido não encontrado.');
    if (order.status === 'confirmed') throw Error('Este pedido já foi confirmado.');
    if (order.discount > 0 && !eligible(db, order.customer_id)) throw Error('Cliente já comprou. Gere um novo pedido sem desconto.');
    db.prepare("UPDATE orders SET status='confirmed' WHERE id=?").run(id);
    db.exec('COMMIT');
    return order;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
module.exports = { setup, eligible, quote, confirm };
