const http = require('node:http');
const { readFile } = require('node:fs/promises');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(scrypt);
const orders = require('./orders.cjs');
mkdirSync(path.join(__dirname, 'data'), { recursive: true });
const db = new DatabaseSync(process.env.DATABASE_PATH || path.join(__dirname, 'data', 'cafeteria.sqlite'));
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), expires INTEGER NOT NULL);`);
db.exec('PRAGMA busy_timeout=5000');
orders.setup(db);
function publicCustomer(customer) {
  return customer ? { id: customer.id, name: customer.name, email: customer.email, firstPurchase: orders.eligible(db, customer.id) } : null;
}
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/mapa.css': ['mapa.css', 'text/css'], '/interacoes.css': ['interacoes.css', 'text/css'], '/script.js': ['script.js', 'text/javascript'], '/logo-anteiku.png': ['logo-anteiku.png', 'image/png'] };
const digest = value => createHash('sha256').update(value).digest('hex');
const attempts = new Map();
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
function current(req) {
  const token = /(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  return token && db.prepare('SELECT c.id,c.name,c.email FROM customers c JOIN sessions s ON s.customer_id=c.id WHERE s.token=? AND s.expires>?').get(digest(token), Date.now());
}
async function body(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 4096) throw new Error('BODY'); }
  return JSON.parse(text);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  try {
    const route = new URL(req.url, 'http://localhost').pathname;
    if (route.startsWith('/api/')) {
      if (req.method === 'GET' && route === '/api/me') return json(res, 200, { customer: publicCustomer(current(req)) });
      if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
      if (req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: 'Origem não permitida.' });
      if (route === '/api/orders') {
        const customer = current(req);
        if (!customer) return json(res, 401, { error: 'Entre na sua conta para registrar o pedido.' });
        const input = await body(req);
        let quote;
        try { quote = orders.quote(db, customer.id, input.items); }
        catch (error) { return json(res, 400, { error: error.message }); }
        const id = randomBytes(8).toString('hex');
        db.prepare('INSERT INTO orders(id,customer_id,items,subtotal,discount,total) VALUES(?,?,?,?,?,?)').run(id, customer.id, JSON.stringify(quote.items), quote.subtotal, quote.discount, quote.total);
        return json(res, 201, { order: { id, ...quote }, customer: publicCustomer(customer) });
      }
      if (route === '/api/logout') {
        const token = /(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
        if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
        res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return json(res, 200, { customer: null });
      }
      if (!['/api/register', '/api/login'].includes(route)) return json(res, 404, { error: 'Rota não encontrada.' });
      const now = Date.now();
      for (const [key, item] of attempts) if (item.until < now) attempts.delete(key);
      const key = req.socket.remoteAddress;
      const attempt = attempts.get(key) || { count: 0, until: now + 900000 };
      attempts.set(key, attempt);
      if (++attempt.count > 30) return json(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos.' });
      const input = await body(req);
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const password = typeof input.password === 'string' ? input.password : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128) return json(res, 400, { error: 'Informe um e-mail válido e uma senha de 8 a 128 caracteres.' });
      let customer = db.prepare('SELECT * FROM customers WHERE email=?').get(email);
      if (route === '/api/register') {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name || name.length > 80) return json(res, 400, { error: 'Informe um nome de até 80 caracteres.' });
        if (customer) return json(res, 409, { error: 'Não foi possível cadastrar. Tente entrar com sua conta.' });
        const salt = randomBytes(16).toString('hex');
        const hash = (await derive(password, salt, 64)).toString('hex');
        const result = db.prepare('INSERT INTO customers(name,email,salt,hash) VALUES(?,?,?,?)').run(name, email, salt, hash);
        customer = { id: Number(result.lastInsertRowid), name, email };
      } else {
        const hash = await derive(password, customer?.salt || 'invalid-account-salt', 64);
        if (!customer || !timingSafeEqual(hash, Buffer.from(customer.hash, 'hex'))) return json(res, 401, { error: 'E-mail ou senha incorretos.' });
      }
      const token = randomBytes(32).toString('hex');
      db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), customer.id, now + 86400000);
      res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
      return json(res, 200, { customer: publicCustomer(customer) });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Método não permitido.' });
    const file = files[route];
    if (!file) return json(res, 404, { error: 'Página não encontrada.' });
    const content = await readFile(path.join(__dirname, file[0]));
    res.writeHead(200, { 'Content-Type': file[1] + (file[1].startsWith('image/') ? '' : '; charset=utf-8') });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error instanceof SyntaxError || error.message === 'BODY') return json(res, 400, { error: 'Dados inválidos.' });
    console.error(error.message);
    json(res, 500, { error: 'Não foi possível concluir. Tente novamente.' });
  }
});
server.listen(Number(process.env.PORT) || 3000, '127.0.0.1', () => console.log(`Cafeteria: http://localhost:${server.address().port}`));
