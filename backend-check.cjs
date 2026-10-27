const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const orders = require('./orders.cjs');
const assert = require('node:assert/strict');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE customers(id INTEGER PRIMARY KEY); INSERT INTO customers VALUES(1)');
orders.setup(db);
const quote = orders.quote(db, 1, [{ id: 0, quantity: 1 }, { id: 1, quantity: 1 }]);
assert.equal(quote.subtotal, 2000);
assert.equal(quote.discount, 280);
assert.equal(quote.total, 1720);
assert.throws(() => orders.quote(db, 1, [{ id: 0, quantity: -1 }]));
for (const id of ['a', 'b']) db.prepare('INSERT INTO orders(id,customer_id,items,subtotal,discount,total) VALUES(?,1,?,2000,280,1720)').run(id, '[]');
assert.equal(orders.eligible(db, 1), true);
orders.confirm(db, 'a');
assert.equal(orders.eligible(db, 1), false);
assert.throws(() => orders.confirm(db, 'a'));
assert.throws(() => orders.confirm(db, 'b'));
assert.equal(orders.quote(db, 1, [{ id: 0, quantity: 1 }]).discount, 0);
db.close();
console.log('OK: 14%, confirmação e bloqueio de reutilização');
const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '3099', DATABASE_PATH: ':memory:' }, stdio: ['ignore', 'pipe', 'ignore'] });
const timer = setTimeout(() => { child.kill(); process.exitCode = 1; console.error('Timeout'); }, 15000);
child.stdout.once('data', async () => {
  try {
    const base = 'http://127.0.0.1:3099';
    let cookie = '';
    async function call(route, data) {
      const r = await fetch(base + route, { method: data ? 'POST' : 'GET', headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie }, body: data ? JSON.stringify(data) : undefined });
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      return { status: r.status, data: await r.json() };
    }
    function check(ok, label) { if (!ok) throw Error(label); console.log('OK: ' + label); }
    let r = await call('/api/register', { name: 'Teste', email: 'teste@example.com', password: 'senha-teste-123' });
    check(r.status === 200, 'cadastro');
    r = await call('/api/me'); check(!!r.data.customer, 'sessão');
    r = await call('/api/orders', { items: [{ id: 0, quantity: 1 }, { id: 1, quantity: 1 }], discount: 2000 });
    check(r.status === 201 && r.data.order.total === 1720 && r.data.order.discount === 280, 'pedido calculado pelo servidor');
    r = await call('/api/me'); check(r.data.customer.firstPurchase === true, 'pedido pendente não consome desconto');
    await call('/api/logout', {}); r = await call('/api/me'); check(r.data.customer === null, 'logout');
    r = await call('/api/orders', { items: [{ id: 0, quantity: 1 }] }); check(r.status === 401, 'pedido exige sessão');
    r = await call('/api/login', { email: 'teste@example.com', password: 'errada123' }); check(r.status === 401, 'senha incorreta');
    r = await call('/api/login', { email: 'teste@example.com', password: 'senha-teste-123' }); check(r.status === 200, 'login');
    check((await fetch(base + '/server.js')).status === 404, 'servidor protegido');
    check((await fetch(base + '/')).status === 200, 'página inicial');
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { clearTimeout(timer); child.kill(); }
});
