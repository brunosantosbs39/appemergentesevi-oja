const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const deps = createRequire(path.resolve(__dirname, '../frontend/package.json'));
const React = deps('react');
const { JSDOM } = deps('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/perfil/me', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node', 'NodeFilter', 'CustomEvent', 'MutationObserver', 'Event', 'getComputedStyle']) {
  Object.defineProperty(global, key, { value: dom.window[key], configurable: true, writable: true });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const { createRoot } = deps('react-dom/client');
const src = path.resolve(__dirname, '../frontend/src');
let root, me, calls, put, get, saved, closed, uploads;
const defaultMe = () => ({ user_id: 'me', role: 'membro', name: 'Maria Silva', city: 'Goiânia', categories: ['eletricista'], hourly_rate: 60.5 });
const reset = () => {
  me = defaultMe(); calls = []; saved = 0; closed = []; uploads = {};
  put = async (url, body) => { calls.push({ url, body }); return { data: { ...me, ...body } }; };
  get = async (url) => url === '/users/me' ? { data: me } : { data: [], headers: {} };
};
reset();
const api = { put: (...args) => put(...args), get: (...args) => get(...args) };
const mocks = {
  '@/lib/api': { useApi: () => api, imgUrl: value => value || '', errMsg: error => error.response?.data?.detail || 'Falha de conexão.' },
  '@/context/MeContext': { useMe: () => ({ me, setMe: value => { me = value; } }) },
  'react-router-dom': { useParams: () => ({ id: 'me' }), Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children) },
  'sonner': { toast: { success() {}, error() {}, info() {} } },
  '@/components/chat/ContactButton': { ContactButton: () => null },
  '@/components/feed/CreatePostDialog': { CreatePostDialog: () => null },
  '@/components/requests/CreateRequestDialog': { CreateRequestDialog: () => null },
  '@/components/feed/PostCard': { PostCard: () => null },
  '@/components/common/ImageUpload': { ImageUpload: ({ testid, onBusyChange, onChange }) => {
    uploads[testid] = { onBusyChange, onChange };
    return React.createElement('div', { 'data-testid': testid }, testid);
  } },
};
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = deps('@babel/core').transformSync(fs.readFileSync(filename, 'utf8'), {
    presets: [[deps.resolve('@babel/preset-react'), { runtime: 'automatic' }]],
    plugins: [deps.resolve('@babel/plugin-transform-modules-commonjs')], configFile: false, babelrc: false,
  }).code;
  function req(name) {
    if (mocks[name]) return mocks[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(src, name.slice(2)) : path.resolve(path.dirname(filename), name);
      const found = [base, `${base}.jsx`, `${base}.js`, `${base}.mjs`].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
      if (!found) throw new Error(`Cannot resolve ${name}`);
      return load(found);
    }
    return deps(name);
  }
  new Function('require', 'module', 'exports', code)(req, module, module.exports);
  return module.exports;
}
const { EditProfileDialog } = load(path.join(src, 'components/profile/EditProfileDialog.jsx'));
const { ProfileHeader } = load(path.join(src, 'components/profile/ProfileHeader.jsx'));
const Profile = load(path.join(src, 'pages/Profile.jsx')).default;
const byId = id => document.querySelector(`[data-testid="${id}"]`);
async function render(Component, props = {}) {
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Component, props)));
}
async function edit() {
  function Wrapper() {
    const [open, setOpen] = React.useState(true);
    return React.createElement(EditProfileDialog, { open, onOpenChange: value => { closed.push(value); setOpen(value); }, onSaved: () => { saved++; } });
  }
  await render(Wrapper);
}
async function change(id, value) {
  await React.act(async () => {
    const input = document.getElementById(id);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
async function clickText(text) {
  const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === text);
  assert.ok(button, `Missing button ${text}`);
  await React.act(async () => button.click());
}
async function submit() {
  await React.act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
}
afterEach(async () => {
  if (root) await React.act(async () => root.unmount());
  root = null; reset();
});

test('the rating has a numeric average and a visible review count', async () => {
  await render(ProfileHeader, { user: { ...me, rating_avg: 4.8, rating_count: 12 }, isMe: true });
  assert.match(document.body.textContent, /4,8/);
  assert.match(document.body.textContent, /12 avaliações/);
});

test('a profile with no reviews says so instead of implying a rating', async () => {
  await render(ProfileHeader, { user: { ...me, rating_count: 0 }, isMe: true });
  assert.match(document.body.textContent, /Sem avaliações/);
});

test('closing a dirty form offers to continue and preserves the edits', async () => {
  await edit();
  assert.equal(byId('edit-profile-submit-button').disabled, true);
  await change('edit-profile-name', 'Maria Oliveira');
  await clickText('Cancelar');
  assert.ok(document.querySelector('[role="alertdialog"]'));
  assert.deepEqual(closed, []);
  await clickText('Continuar editando');
  assert.equal(document.getElementById('edit-profile-name').value, 'Maria Oliveira');
  assert.equal(document.querySelector('[role="alertdialog"]'), null);
  await clickText('Cancelar');
  await clickText('Descartar alterações');
  assert.deepEqual(closed, [false]);
});

test('the dialog close button and Escape use the same discard protection', async () => {
  await edit(); await change('edit-profile-name', 'Maria Oliveira');
  await clickText('Fechar');
  assert.ok(document.querySelector('[role="alertdialog"]'));
  await clickText('Continuar editando');
  await React.act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.ok(document.querySelector('[role="alertdialog"]'));
  assert.deepEqual(closed, []);
});

test('invalid names and rates are explained before any request', async () => {
  await edit(); await change('edit-profile-name', ' '); await submit();
  assert.equal(calls.length, 0);
  assert.equal(document.activeElement.id, 'edit-profile-name');
  assert.match(document.body.textContent, /pelo menos 2 caracteres/);
  await change('edit-profile-name', 'Maria Silva');
  await change('edit-profile-rate', '-1'); await submit();
  assert.equal(calls.length, 0);
  assert.equal(document.activeElement.id, 'edit-profile-rate');
});

test('saving accepts cents, closes without discard and sends one request', async () => {
  await edit(); await change('edit-profile-rate', '75.50'); await submit();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.hourly_rate, 75.5);
  assert.equal(calls[0].body.avatar, undefined);
  assert.equal(calls[0].body.cover, undefined);
  assert.equal(saved, 1);
  assert.deepEqual(closed, [false]);
  assert.equal(document.querySelector('[role="alertdialog"]'), null);
});

test('both image uploads must finish before saving or closing', async () => {
  await edit();
  await React.act(async () => { uploads['edit-cover'].onBusyChange(true); uploads['edit-avatar'].onBusyChange(true); });
  await React.act(async () => { uploads['edit-cover'].onChange('/cover'); uploads['edit-cover'].onBusyChange(false); });
  assert.equal(byId('edit-profile-submit-button').disabled, true);
  await submit(); await clickText('Fechar');
  assert.equal(calls.length, 0); assert.deepEqual(closed, []);
  await React.act(async () => { uploads['edit-avatar'].onChange('/avatar'); uploads['edit-avatar'].onBusyChange(false); });
  assert.equal(byId('edit-profile-submit-button').disabled, false);
  await submit();
  assert.equal(calls[0].body.avatar, '/avatar'); assert.equal(calls[0].body.cover, '/cover');
});

test('failed saving leaves the form editable with the same values', async () => {
  put = async () => { throw { response: { data: { detail: 'Servidor indisponível.' } } }; };
  await edit(); await change('edit-profile-name', 'Maria Oliveira'); await submit();
  assert.match(byId('edit-profile-error').textContent, /Suas alterações continuam aqui/);
  assert.equal(document.getElementById('edit-profile-name').value, 'Maria Oliveira');
  assert.equal(byId('edit-profile-submit-button').disabled, false);
  assert.deepEqual(closed, []);
});

test('rapid repeated submission sends only one update', async () => {
  let finish;
  put = (url, body) => { calls.push({ url, body }); return new Promise(resolve => { finish = resolve; }); };
  await edit(); await change('edit-profile-name', 'Maria Oliveira');
  await React.act(async () => {
    for (let i = 0; i < 2; i++) document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });
  assert.equal(calls.length, 1);
  assert.match(byId('edit-profile-status').textContent, /Salvando/);
  await clickText('Fechar'); assert.deepEqual(closed, []);
  await React.act(async () => finish({ data: me }));
  assert.deepEqual(closed, [false]);
});

test('custom functions cannot silently overflow the category limit', async () => {
  me.categories = ['eletricista', 'pedreiro', 'pintor', 'encanador', 'jardineiro'];
  await edit(); await change('edit-profile-roles', 'Cuidador'); await submit();
  assert.equal(calls.length, 0);
  assert.match(document.body.textContent, /também usam a área Outros/);
});

test('a connection error offers retry instead of claiming the profile is missing', async () => {
  get = async () => { throw new Error('offline'); };
  await render(Profile);
  assert.ok(byId('profile-load-error'));
  assert.equal(byId('profile-not-found'), null);
  get = async url => url === '/users/me' ? { data: me } : { data: [], headers: {} };
  await clickText('Tentar novamente');
  assert.ok(byId('profile-name'));
});

test('a real 404 is distinguished from a connection error', async () => {
  get = async () => { throw { response: { status: 404 } }; };
  await render(Profile);
  assert.ok(byId('profile-not-found'));
});

test('a publications failure keeps the profile header visible', async () => {
  get = async url => {
    if (url === '/users/me') return { data: me };
    throw new Error('offline');
  };
  await render(Profile);
  assert.ok(byId('profile-name'));
  assert.ok(byId('profile-content-error'));
  assert.equal(byId('profile-not-found'), null);
});

test('an unchanged profile does not send an update on Enter', async () => {
  await edit(); await submit();
  assert.equal(calls.length, 0);
});

test('a sixth selected category is rejected without losing the first five', async () => {
  me.categories = ['eletricista', 'pedreiro', 'pintor', 'encanador', 'jardineiro'];
  await edit(); await clickText('Marceneiro');
  assert.match(document.body.textContent, /Escolha até 5 áreas/);
  assert.equal(document.querySelectorAll('[data-testid^="edit-category-"][aria-pressed="true"]').length, 5);
});

test('location capture reports progress and is only saved with the profile', async () => {
  let locateSuccess;
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success) { locateSuccess = success; } } });
  try {
    await edit(); await clickText('Atualizar minha localização no mapa');
    assert.match(byId('edit-profile-status').textContent, /Buscando sua localização/);
    assert.equal(byId('edit-profile-submit-button').disabled, true);
    assert.equal(calls.length, 0);
    await React.act(async () => locateSuccess({ coords: { latitude: -16.6, longitude: -49.2 } }));
    assert.match(byId('edit-profile-status').textContent, /alterações para salvar/);
    assert.equal(calls.length, 0);
    await submit();
    assert.equal(calls[0].body.lat, -16.6);
    assert.equal(calls[0].body.lng, -49.2);
  } finally { delete navigator.geolocation; }
});

test('pagination keeps existing work after failure and retries the same cursor', async () => {
  let fail = true;
  get = async (url, options) => {
    if (url === '/users/me') return { data: me };
    if (url !== '/posts' || options?.params?.kind !== 'portfolio') return { data: [], headers: {} };
    if (options.params.before) {
      assert.equal(options.params.before, 'cursor-1');
      if (fail) throw new Error('offline');
      return { data: [{ id: 'second', image: '/second.png' }], headers: {} };
    }
    return { data: [{ id: 'first', image: '/first.png' }], headers: { 'x-next-cursor': 'cursor-1' } };
  };
  await render(Profile);
  await clickText('Carregar mais trabalhos');
  assert.ok(byId('profile-post-thumb-first'));
  assert.match(document.body.textContent, /Falha de conexão/);
  fail = false;
  await clickText('Tentar carregar mais trabalhos');
  assert.ok(byId('profile-post-thumb-first'));
  assert.ok(byId('profile-post-thumb-second'));
});
