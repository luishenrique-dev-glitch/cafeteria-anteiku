(() => {
  'use strict';
  const money = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const cards = [...document.querySelectorAll('.produto')];
  const products = cards.map((card, id) => ({
    id, card, name: card.querySelector('h3').textContent,
    price: Math.round(Number(card.querySelector('.preco').textContent.replace(/[^\d,]/g, '').replace(',', '.')) * 100),
    category: card.querySelector('.expresso') ? 'intensos' : 'cremosos'
  }));
  const cart = new Map();
  let customer = null;
  const login = document.querySelector('#login-desconto');
  const loginButton = document.querySelector('.botao-login');
  loginButton.addEventListener('click', () => login.showModal());
  login.querySelector('.login-fechar').addEventListener('click', () => login.close());
  login.addEventListener('click', event => { if (event.target === login) {
    const bounds = login.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) login.close();
  } });
  const form = document.querySelector('#form-login');
  const action = document.querySelector('#login-acao');
  const feedback = document.querySelector('#login-feedback');
  const logout = document.querySelector('#logout');
  async function api(route, data) {
    const response = await fetch('/api/' + route, data === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível continuar.');
    return result;
  }
  function setCustomer(value) {
    customer = value;
    loginButton.textContent = customer ? 'Minha conta · ' + customer.name : 'Entrar · 14% na primeira compra';
    logout.hidden = !customer;
    render();
  }
  action.addEventListener('change', () => {
    const register = action.value === 'register';
    document.querySelector('#login-nome').required = register;
    document.querySelector('#login-nome').hidden = !register;
    document.querySelector('#login-nome').setCustomValidity('');
    document.querySelector('#label-nome').hidden = !register;
    document.querySelector('#login-senha').autocomplete = register ? 'new-password' : 'current-password';
    form.querySelector('[type="submit"]').textContent = register ? 'Criar conta' : 'Entrar';
    feedback.textContent = '';
  });
  logout.addEventListener('click', async () => {
    try { await api('logout', {}); setCustomer(null); form.reset(); action.dispatchEvent(new Event('change')); feedback.textContent = 'Você saiu da conta.'; }
    catch { feedback.textContent = 'Não foi possível sair. Tente novamente.'; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = document.querySelector('#login-nome');
    name.setCustomValidity(action.value === 'login' || name.value.trim() ? '' : 'Informe seu nome.');
    if (!event.target.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    feedback.textContent = 'Aguarde…';
    try {
      const result = await api(action.value, { name: name.value.trim(), email: document.querySelector('#login-email').value.trim(), password: document.querySelector('#login-senha').value });
      setCustomer(result.customer);
      document.querySelector('#login-senha').value = '';
      feedback.textContent = 'Você está conectado.';
      login.close();
      panel.scrollIntoView({ behavior: 'auto', block: 'center' });
    } catch (error) { feedback.textContent = error.message === 'Failed to fetch' ? 'Inicie o servidor e abra http://localhost:3000.' : error.message; }
    finally { submit.disabled = false; }
  });
  document.querySelector('#login-nome').addEventListener('input', event => event.target.setCustomValidity(''));
  const filters = document.createElement('div');
  filters.className = 'filtros';
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filtrar cafés');
  for (const [value, label] of [['todos', 'Todos'], ['intensos', 'Intensos'], ['cremosos', 'Cremosos']]) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.setAttribute('aria-pressed', String(value === 'todos'));
    button.addEventListener('click', () => {
      filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      products.forEach(product => { product.card.hidden = value !== 'todos' && product.category !== value; });
    });
    filters.append(button);
  }
  document.querySelector('.lista-produtos').before(filters);

  const panel = document.createElement('section');
  panel.className = 'carrinho';
  panel.setAttribute('aria-labelledby', 'titulo-carrinho');
  panel.innerHTML = '<h3 id="titulo-carrinho">Sua pausa, do seu jeito.</h3><p class="carrinho-aviso">Monte sua seleção e consulte a disponibilidade pelo WhatsApp. O pedido depende da confirmação da cafeteria.</p><ul class="carrinho-itens"></ul><p class="carrinho-total" aria-live="polite"></p><a class="botao carrinho-enviar" target="_blank" rel="noopener noreferrer" hidden>Consultar pedido no WhatsApp ↗<span class="somente-leitor"> (abre em nova aba)</span></a><p class="somente-leitor carrinho-feedback" role="status"></p>';
  document.querySelector('.lista-produtos').after(panel);
  const list = panel.querySelector('ul');
  const checkout = panel.querySelector('.carrinho-enviar');
  const discountStatus = document.createElement('p');
  discountStatus.className = 'desconto-status';
  discountStatus.setAttribute('role', 'status');
  checkout.before(discountStatus);
  let sending = false;
  checkout.addEventListener('click', async event => {
    if (!customer) return;
    event.preventDefault();
    if (sending) return;
    sending = true;
    checkout.setAttribute('aria-disabled', 'true');
    try {
      const result = await api('orders', { items: [...cart].map(([id, quantity]) => ({ id, quantity })) });
      setCustomer(result.customer);
      const order = result.order;
      const message = `Olá! Gostaria de confirmar o pedido ${order.id}:\n\n` +
        order.items.map(item => `${item.quantity}x ${item.name} — ${money(item.price * item.quantity)}`).join('\n') +
        `\n\nSubtotal: ${money(order.subtotal)}\nDesconto primeira compra (14%): ${money(order.discount)}\nTotal: ${money(order.total)}\n\nCliente: ${customer.name}\nE-mail: ${customer.email}\nSujeito à confirmação da cafeteria.`;
      window.location.assign('https://wa.me/5535997627216?text=' + encodeURIComponent(message));
    } catch (error) { discountStatus.textContent = error.message; }
    finally { sending = false; checkout.removeAttribute('aria-disabled'); }
  });
  function render() {
    list.replaceChildren();
    let total = 0;
    const lines = [];
    for (const [id, quantity] of cart) {
      const product = products[id];
      total += product.price * quantity;
      lines.push(`${quantity}x ${product.name} — ${money(product.price * quantity)}`);
      const row = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${product.name} · ${money(product.price * quantity)}`;
      const controls = document.createElement('div'); controls.className = 'quantidade';
      const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−';
      minus.setAttribute('aria-label', `Diminuir quantidade de ${product.name}`);
      const count = document.createElement('span'); count.textContent = quantity;
      const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+';
      plus.setAttribute('aria-label', `Aumentar quantidade de ${product.name}`);
      plus.disabled = quantity >= 99;
      minus.addEventListener('click', () => change(id, -1, 'minus'));
      plus.addEventListener('click', () => change(id, 1, 'plus'));
      controls.append(minus, count, plus); row.append(label, controls); list.append(row);
      row.dataset.product = id;
    }
    const discount = customer?.firstPurchase ? Math.round(total * 14 / 100) : 0;
    panel.querySelector('.carrinho-total').textContent = cart.size ? (discount ? `Subtotal: ${money(total)} · Desconto de 14%: −${money(discount)} · Total: ${money(total - discount)}` : `Total: ${money(total)}`) : 'Sua seleção está vazia. Escolha um café acima.';
    checkout.hidden = !cart.size;
    discountStatus.textContent = customer ? (customer.firstPurchase ? '14% na sua primeira compra. O benefício é utilizado somente quando a cafeteria confirma a compra.' : 'Sua primeira compra já foi confirmada. Os próximos pedidos seguem o preço normal.') : 'Entre ou crie sua conta para ganhar 14% na primeira compra.';
    checkout.removeAttribute('target');
    checkout.innerHTML = 'Consultar pedido no WhatsApp ↗';
    const discountRequest = customer ? `\n\nMeu nome: ${customer.name}\nE-mail: ${customer.email}\nGostaria de solicitar o desconto na minha primeira compra. Podem confirmar as condições e o total com desconto?` : '';
    if (cart.size) checkout.href = `https://wa.me/5535997627216?text=${encodeURIComponent('Olá! Gostaria de consultar a disponibilidade desta seleção:\n\n' + lines.join('\n') + '\n\nTotal: ' + money(total) + discountRequest)}`;
    else checkout.removeAttribute('href');
  }
  function change(id, delta, focus) {
    const quantity = Math.max(0, Math.min(99, (cart.get(id) || 0) + delta));
    if (quantity) cart.set(id, quantity); else cart.delete(id);
    render();
    panel.querySelector('.carrinho-feedback').textContent = `${products[id].name}: ${quantity} na seleção.`;
    if (focus) {
      const row = list.querySelector(`[data-product="${id}"]`);
      const target = row ? row.querySelectorAll('button')[focus === 'minus' ? 0 : 1] : products[id].card.querySelector('button');
      (target.disabled ? row.querySelector('button') : target).focus();
    }
  }
  products.forEach(product => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'botao adicionar-cafe'; button.textContent = 'Adicionar à seleção +';
    button.setAttribute('aria-label', `Adicionar ${product.name} à seleção`);
    button.addEventListener('click', () => change(product.id, 1));
    product.card.querySelector('.produto-conteudo').append(button);
  });
  render();

  api('me').then(result => setCustomer(result.customer)).catch(() => {
    feedback.textContent = 'Para acessar sua conta, inicie o servidor e abra http://localhost:3000.';
  });

  const status = document.createElement('p'); status.className = 'status-loja';
  status.setAttribute('role', 'status');
  document.querySelector('#titulo-horarios').after(status);
  function updateHours(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now).map(part => [part.type, part.value]));
    const close = parts.weekday === 'Sun' ? 14 : 18;
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    const open = minutes >= 420 && minutes < close * 60;
    status.dataset.open = String(open);
    status.textContent = open ? `Aberto agora · até ${close}h` : minutes < 420 ? 'Fechado agora · abrimos hoje às 7h' : 'Fechado agora · abrimos amanhã às 7h';
    status.title = 'Horário de Brasília. Horários especiais e feriados podem variar.';
  }
  updateHours();
  setInterval(updateHours, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateHours(); });
})();
