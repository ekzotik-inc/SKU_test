// CC Brand Board — статическое приложение, данные в data/board.json
'use strict';

// Хэш SHA-256 строки "логин:пароль". Это защита уровня интерфейса: сайт статический,
// поэтому данные в репозитории всё равно доступны тем, у кого есть доступ к репо.
const AUTH_HASH = '8efd917a7ba9805dcecc1cab3f368a2d2f073b419f471f98fc0ed825dbf7e07f';
const COMPANIES = ['BAT', 'JTI', 'KT&G', 'PMI', 'OTHERS'];
const SEGMENTS = ['PREMIUM', 'MEDIUM', 'LOW'];
const DRAFT_KEY = 'bb-draft', GH_KEY = 'bb-github', SESSION_KEY = 'bb-auth';

let state = { period: '', skus: [] };
let dirty = false;
let editing = null;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cls = c => c.replace(/[^A-Z]/g, '');
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { setStatus('Не удалось сохранить черновик: ' + e.message); } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- вход ----------
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (await sha256($('#lUser').value.trim() + ':' + $('#lPass').value) === AUTH_HASH) {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
    start();
  } else $('#lErr').textContent = 'Неверный логин или пароль';
});
$('#bLogout').onclick = () => { try { sessionStorage.removeItem(SESSION_KEY); } catch {} location.reload(); };

async function start() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  const draft = store.get(DRAFT_KEY);
  if (draft && confirm('Найден несохранённый черновик в этом браузере. Открыть его?\n(Отмена — загрузить данные из репозитория)')) {
    state = draft; dirty = true;
  } else {
    store.del(DRAFT_KEY);
    try {
      const r = await fetch('data/board.json?t=' + Date.now());
      state = normalize(await r.json());
    } catch (e) { setStatus('Не удалось загрузить data/board.json: ' + e.message); }
  }
  render();
}

function normalize(d) {
  const skus = Array.isArray(d) ? d : d.skus || [];
  return {
    period: d.period || 'Retail Prices, Market Shares YTD',
    skus: skus.map((s, i) => ({
      id: s.id || i + 1, name: s.name || '', segment: (s.segment || 'MEDIUM').toUpperCase(),
      price: Number(s.price) || 0, company: COMPANIES.includes(s.company) ? s.company : 'OTHERS',
      som: Number(s.som) || 0, change: Number(s.change) || 0, image: s.image || '',
      brand: s.brand || '', format: s.format || '', active: s.active !== false,
      order: s.order === '' || s.order == null ? null : Number(s.order), notes: s.notes || '',
    })),
  };
}

function touch() { dirty = true; store.set(DRAFT_KEY, state); render(); }
let toastTimer;
function setStatus(t, sticky) {
  $('#status').textContent = t;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => { $('#status').textContent = ''; }, 4000);
}
// закрываем меню после выбора пункта или клика мимо
document.addEventListener('click', e => {
  const m = $('.menu');
  if (m.open && (!m.contains(e.target) || e.target.closest('.menu-list button'))) m.open = false;
});

// ---------- борд ----------
SEGMENTS.forEach(s => $('#fSeg').insertAdjacentHTML('beforeend', `<option>${s}</option>`));
$('#search').oninput = render;
$('#period').onchange = e => { state.period = e.target.value; touch(); };

const colorVar = c => `--c:var(--${cls(c)})`;

function renderTabs() {
  const cur = $('#fSeg').value;
  $('#segTabs').innerHTML = ['', ...SEGMENTS].map(s =>
    `<button data-seg="${s}" class="${s === cur ? 'on' : ''}">${s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Все'}</button>`).join('');
}
$('#segTabs').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  $('#fSeg').value = b.dataset.seg;
  render();
};

function render() {
  $('#period').value = state.period;
  renderTabs();
  const q = $('#search').value.trim().toLowerCase();
  const fseg = $('#fSeg').value;
  const list = state.skus.filter(s => (showInactive || s.active) &&
    (!q || (s.name + ' ' + s.brand).toLowerCase().includes(q)) && (!fseg || s.segment === fseg));

  const totals = Object.fromEntries(COMPANIES.map(c => [c, { som: 0, n: 0 }]));
  state.skus.filter(s => s.active).forEach(s => { totals[s.company].som += s.som; totals[s.company].n++; });
  const max = Math.max(1, ...COMPANIES.map(c => totals[c].som));
  $('#kpi').innerHTML = COMPANIES.map(c => `<div class="chip" style="${colorVar(c)}">
    <span class="dot" style="background:var(--c)"></span>
    <div style="flex:1"><small>${esc(c)} · ${totals[c].n} SKU</small><b>${totals[c].som.toFixed(1)}%</b>
    <div class="meter"><i style="width:${totals[c].som / max * 100}%;background:var(--c)"></i></div></div></div>`).join('');

  let html = '<table class="bb"><thead><tr><th></th><th style="text-align:right">KZT</th>' +
    COMPANIES.map(c => `<th class="co" style="${colorVar(c)}">${esc(c)}<small>SoM ${totals[c].som.toFixed(1)}%</small></th>`).join('') +
    '</tr></thead><tbody>';

  for (const seg of SEGMENTS) {
    if (fseg && seg !== fseg) continue;
    const prices = [...new Set(list.filter(s => s.segment === seg).map(s => s.price))].sort((a, b) => b - a);
    if (!prices.length) continue;
    prices.forEach((p, i) => {
      const n = list.filter(s => s.segment === seg && s.price === p).length;
      html += `<tr class="${i === 0 ? 'seg-start' : ''}">`;
      if (i === 0) html += `<td class="seg" style="--c:var(--${seg})" rowspan="${prices.length}"><span>${seg}</span></td>`;
      html += `<td class="price">${p.toLocaleString('ru-RU')}<small>${n} SKU</small></td>`;
      for (const c of COMPANIES) {
        const items = list.filter(s => s.segment === seg && s.price === p && s.company === c)
          .sort(byOrder);
        html += `<td style="${colorVar(c)}"><div class="cell" data-seg="${seg}" data-price="${p}" data-company="${esc(c)}">` +
          items.map(card).join('') +
          `<button class="add-here" title="Добавить SKU сюда">+</button></div></td>`;
      }
      html += '</tr>';
    });
  }
  html += '</tbody></table>';
  if (!list.length) html = '<div class="empty">Ничего не найдено. Нажмите «＋ SKU» или импортируйте Excel.</div>';
  $('#board').innerHTML = html;
  if (dirty) setStatus('Есть несохранённые изменения — нажмите «Сохранить»', true);
}

// сначала ручной порядок (Display_Order), затем по доле
const byOrder = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || b.som - a.som;
let showInactive = false;
$('#bShowInactive').onclick = e => {
  showInactive = !showInactive;
  e.target.textContent = showInactive ? '◉ Скрыть неактивные' : '◌ Показать неактивные';
  render();
};

function card(s) {
  const ch = Math.abs(s.change) >= 0.005 ? `<span class="${s.change > 0 ? 'up' : 'dn'}">${s.change > 0 ? '▲' : '▼'}${Math.abs(s.change).toFixed(2)}</span>` : '';
  const img = s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy">` : `<div class="ph">${esc(s.name.charAt(0))}</div>`;
  const tip = [s.name, s.brand, s.format, `${s.price} KZT`, `SoM ${s.som}%`, s.notes].filter(Boolean).join(' · ');
  const note = s.notes ? '<span class="note" title="' + esc(s.notes) + '">!</span>' : '';
  return `<div class="sku${s.active ? '' : ' off'}" draggable="true" data-id="${s.id}" style="${colorVar(s.company)}" title="${esc(tip)}">${note}${img}` +
    `<div class="nm">${esc(s.name)}</div><div class="som"><b>${s.som.toFixed(2)}%</b>${ch}</div></div>`;
}

// клики и перетаскивание
$('#board').addEventListener('click', e => {
  const sku = e.target.closest('.sku');
  if (sku) return openEditor(state.skus.find(s => s.id == sku.dataset.id));
  if (e.target.classList.contains('add-here')) {
    const c = e.target.closest('.cell').dataset;
    openEditor(null, { segment: c.seg, price: +c.price, company: c.company });
  }
});
$('#board').addEventListener('dragstart', e => {
  const sku = e.target.closest('.sku');
  if (sku) e.dataTransfer.setData('text/plain', sku.dataset.id);
});
$('#board').addEventListener('dragover', e => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  e.preventDefault();
  document.querySelectorAll('.cell.drop').forEach(x => x !== cell && x.classList.remove('drop'));
  cell.classList.add('drop');
});
$('#board').addEventListener('drop', e => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  e.preventDefault();
  const s = state.skus.find(x => x.id == e.dataTransfer.getData('text/plain'));
  if (!s) return;
  Object.assign(s, { segment: cell.dataset.seg, price: +cell.dataset.price, company: cell.dataset.company });
  touch();
});

// ---------- редактор ----------
const dlg = $('#dlg'), form = $('#skuForm');
let pendingImage = '';

function openEditor(sku, preset = {}) {
  editing = sku;
  const v = sku || { name: '', segment: 'MEDIUM', price: '', company: 'BAT', som: 0, change: 0, image: '', brand: '', format: '', order: null, notes: '', active: true, ...preset };
  $('#dlgTitle').textContent = sku ? 'Редактировать SKU' : 'Новый SKU';
  for (const k of ['name', 'segment', 'price', 'company', 'som', 'change', 'image', 'brand', 'format', 'order', 'notes']) form.elements[k].value = v[k] ?? '';
  form.elements.active.checked = v.active !== false;
  form.elements.imageFile.value = '';
  pendingImage = v.image || '';
  $('#preview').src = pendingImage;
  $('#bDel').hidden = !sku;
  dlg.showModal();
}
$('#bAdd').onclick = () => openEditor(null);
$('#bCancel').onclick = () => dlg.close();
form.elements.image.oninput = e => { pendingImage = e.target.value.trim(); $('#preview').src = pendingImage; };
form.elements.imageFile.onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  pendingImage = await shrinkImage(f);
  form.elements.image.value = '';
  $('#preview').src = pendingImage;
};
$('#bDel').onclick = () => {
  if (!confirm(`Удалить «${editing.name}»?`)) return;
  state.skus = state.skus.filter(s => s !== editing);
  dlg.close(); touch();
};
form.addEventListener('submit', () => {
  const f = form.elements;
  const v = {
    name: f.name.value.trim(), segment: f.segment.value, price: Number(f.price.value),
    company: f.company.value, som: Number(f.som.value) || 0, change: Number(f.change.value) || 0, image: pendingImage,
    brand: f.brand.value.trim(), format: f.format.value.trim(), notes: f.notes.value.trim(), active: f.active.checked,
    order: f.order.value === '' ? null : Number(f.order.value),
  };
  if (editing) Object.assign(editing, v);
  else state.skus.push({ id: Math.max(0, ...state.skus.map(s => s.id)) + 1, ...v });
  touch();
});

// уменьшаем фото до ~240px по высоте, чтобы репозиторий не разрастался
function shrinkImage(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const h = Math.min(240, img.height), w = Math.round(img.width * h / img.height);
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- Excel ----------
// формат SKU_Master: SoM_YTD в долях (0.06 = 6%), изменение — в п.п.
const COLS = [['company', 'Company'], ['brand', 'Brand'], ['name', 'SKU_Name'], ['price', 'Price_KZT'], ['segment', 'Price_Segment'],
  ['format', 'Pack_Format'], ['som', 'SoM_YTD'], ['change', 'SoM_Change_pp'], ['image', 'Photo_URL'], ['active', 'Active'],
  ['order', 'Display_Order'], ['notes', 'Notes']];
// подходит и старый формат (Family/SKU, Segment, Price, SoM YTD, Point Change)
const MATCH = {
  name: /^(sku_?name|family\/?sku|sku|name|название)\s*$/i, segment: /segment|сегм/i, price: /^(price_kzt|price|цена)\b/i,
  company: /^(company|компания|manufacturer)/i, som: /^som(?!.*change)|share|доля/i, change: /change|point|измен/i,
  brand: /^brand|бренд/i, format: /format|формат/i, active: /^active|актив/i, order: /order|порядок/i,
  notes: /^notes?$|примеч|коммент/i, image: /photo_url|^photo|фото/i,
};

$('#bImport').onclick = () => $('#fileXlsx').click();
$('#fileXlsx').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const wb = XLSX.read(await f.arrayBuffer());
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames.find(n => /sku/i.test(n)) || wb.SheetNames[0]], { defval: '' });
  if (!rows.length) return alert('Лист пуст');
  const headers = Object.keys(rows[0]);
  const map = Object.fromEntries(Object.entries(MATCH).map(([k, re]) => [k, headers.find(h => re.test(h.trim()))]));
  if (!map.name || !map.price) return alert('Не найдены колонки с названием SKU и ценой.\nОжидаются: ' + COLS.map(c => c[1]).join(', '));
  const val = (r, k) => map[k] ? r[map[k]] : '';
  let imported = rows.filter(r => String(val(r, 'name')).trim() && Number(val(r, 'price'))).map(r => {
    const c = String(val(r, 'company')).trim().toUpperCase().replace(/^KTG$/, 'KT&G');
    const order = val(r, 'order');
    const s = {
      name: String(val(r, 'name')).trim(), segment: String(val(r, 'segment') || 'MEDIUM').trim().toUpperCase(),
      price: Number(val(r, 'price')) || 0, company: COMPANIES.includes(c) ? c : 'OTHERS',
      som: Number(val(r, 'som')) || 0, change: Number(val(r, 'change')) || 0,
      active: !/^(no|нет|false|0)$/i.test(String(val(r, 'active')).trim()),
      order: order === '' ? null : Number(order),
    };
    for (const k of ['brand', 'format', 'notes', 'image']) if (String(val(r, k)).trim()) s[k] = String(val(r, k)).trim();
    return s;
  });
  if (!imported.length) return alert('Не найдено строк с названием и ценой. Если в файле формулы со ссылками на другую книгу — откройте его в Excel, пересчитайте и сохраните.');
  // доли в файле могут быть в долях единицы (0.06) — переводим в проценты
  if (Math.max(...imported.map(s => s.som)) <= 1) imported.forEach(s => { s.som = +(s.som * 100).toFixed(4); });
  const replace = confirm(`Найдено ${imported.length} SKU.\nОК — заменить весь список.\nОтмена — обновить совпадающие по названию и добавить новые (фото сохранятся).`);
  if (replace) {
    const photos = Object.fromEntries(state.skus.filter(s => s.image).map(s => [s.name.toLowerCase(), s.image]));
    imported.forEach(s => { s.image = s.image || photos[s.name.toLowerCase()] || ''; });
    state.skus = [];
  }
  let id = Math.max(0, ...state.skus.map(s => s.id));
  for (const s of imported) {
    const ex = state.skus.find(x => x.name.toLowerCase() === s.name.toLowerCase());
    if (ex) Object.assign(ex, s);
    else state.skus.push(normalize({ skus: [{ id: ++id, image: '', ...s }] }).skus[0]);
  }
  touch();
};

$('#bExport').onclick = () => {
  const data = state.skus.map(s => Object.fromEntries(COLS.map(([k, h]) => [h,
    k === 'som' ? +(s.som / 100).toFixed(6) : k === 'active' ? (s.active ? 'Yes' : 'No') : s[k] ?? ''])));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'SKU_Master');
  XLSX.writeFile(wb, 'brand_board.xlsx');
};
$('#bJson').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }));
  a.download = 'board.json';
  a.click();
};
// ---------- тема ----------
$('#bTheme').onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('bb-theme', t); } catch {}
};

// ---------- лист для PNG и печати ----------
// Собираем компактную копию борда и подбираем ширину так, чтобы пропорции совпали
// с альбомным листом: тогда всё помещается на одну страницу без обрезки.
function buildSheet(ratio) {
  const table = $('#board table');
  if (!table) return null;
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `<div class="sheet-head"><div><h1>CC Brand Board</h1><div class="per">${esc(state.period)}</div></div></div>`;
  sheet.firstChild.append($('#kpi').cloneNode(true));
  sheet.append(table.cloneNode(true));
  sheet.querySelectorAll('.add-here').forEach(b => b.remove());
  document.body.append(sheet);
  let w = 900;
  for (; w < 8000; w += 50) {
    sheet.style.width = w + 'px';
    if (sheet.offsetHeight * ratio <= w) break;
  }
  // добиваем высоту до пропорции листа, чтобы картинка была ровно «страницей»
  sheet.style.height = Math.round(w / ratio) + 'px';
  return { sheet, w };
}

// отрисовка листа в PNG (data URL) — одна и та же картинка для скачивания и печати
async function sheetPng(ratio) {
  const r = buildSheet(ratio);
  if (!r) throw new Error('Борд пуст');
  try {
    // ~3500px по ширине — читаемо в мессенджере и при печати 300 dpi
    return await htmlToImage.toPng(r.sheet, { pixelRatio: Math.max(1, 3508 / r.w),
      backgroundColor: getComputedStyle(document.body).backgroundColor, cacheBust: true,
      style: { left: '0', top: '0', position: 'static' } });
  } finally { r.sheet.remove(); }
}

$('#bPng').onclick = async () => {
  setStatus('Готовлю картинку…', true);
  try {
    const url = await sheetPng(Math.SQRT2);
    const a = Object.assign(document.createElement('a'), { href: url, download: `brand_board_${new Date().toISOString().slice(0, 10)}.png` });
    a.click();
    setStatus('Картинка сохранена');
  } catch (e) {
    setStatus('Не удалось сделать картинку: ' + (e.message || e));
  }
};

// печатная область альбомного листа при полях 6 мм
const PAGES = { A4: [285, 198], A3: [408, 285] };
async function printSheet(size) {
  const [pw, ph] = PAGES[size];
  setStatus('Готовлю лист для печати…', true);
  let url;
  try { url = await sheetPng(pw / ph); } catch (e) { return setStatus('Не удалось подготовить печать: ' + (e.message || e)); }
  const img = Object.assign(document.createElement('img'), { className: 'print-img', src: url });
  img.style.cssText = `width:${pw}mm;height:${ph}mm`;
  const pageStyle = document.createElement('style');
  pageStyle.textContent = `@page{size:${size} landscape;margin:6mm}`;
  document.head.append(pageStyle);
  document.body.append(img);
  document.body.classList.add('printing');
  await img.decode();
  setStatus('');
  const done = () => { document.body.classList.remove('printing'); img.remove(); pageStyle.remove(); };
  window.addEventListener('afterprint', done, { once: true });
  print();
}
$('#bPrint').onclick = () => printSheet('A4');
$('#bPrintA3').onclick = () => printSheet('A3');

// ---------- сохранение в GitHub ----------
const ghDlg = $('#ghDlg'), ghForm = $('#ghForm');
$('#ghCancel').onclick = () => ghDlg.close();
$('#bSave').onclick = () => {
  const cfg = store.get(GH_KEY) || guessRepo();
  for (const k of ['repo', 'branch', 'token']) ghForm.elements[k].value = cfg[k] || '';
  ghDlg.showModal();
};
ghForm.addEventListener('submit', () => {
  const cfg = Object.fromEntries(['repo', 'branch', 'token'].map(k => [k, ghForm.elements[k].value.trim()]));
  store.set(GH_KEY, cfg);
  saveToGitHub(cfg);
});

function guessRepo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = m ? `${m[1]}/${location.pathname.split('/')[1]}` : 'ekzotik-inc/SKU_test';
  return { repo, branch: 'main', token: '' };
}

async function gh(cfg, path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
    ...opts, headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok && r.status !== 404) throw new Error(`${path}: ${r.status} ${(await r.json().catch(() => ({}))).message || ''}`);
  return r.status === 404 ? null : r.json();
}
async function putFile(cfg, path, base64, message) {
  const cur = await gh(cfg, `${path}?ref=${encodeURIComponent(cfg.branch)}`);
  return gh(cfg, path, { method: 'PUT', body: JSON.stringify({ message, content: base64, branch: cfg.branch, sha: cur?.sha }) });
}
function utf8b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function saveToGitHub(cfg) {
  try {
    // загруженные фото выносим в images/ отдельными файлами
    for (const s of state.skus.filter(s => s.image.startsWith('data:image'))) {
      setStatus(`Загрузка фото: ${s.name}…`, true);
      const path = `images/sku-${s.id}-${Date.now()}.jpg`;
      await putFile(cfg, path, s.image.split(',')[1], `Фото SKU: ${s.name}`);
      s.image = path;
    }
    setStatus('Сохранение data/board.json…', true);
    await putFile(cfg, 'data/board.json', utf8b64(JSON.stringify(state, null, 1) + '\n'), 'Обновление Brand Board');
    dirty = false;
    store.del(DRAFT_KEY);
    render();
    setStatus('Сохранено в GitHub. Сайт обновится через 1–2 минуты после пересборки Pages.');
  } catch (e) {
    store.set(DRAFT_KEY, state);
    setStatus('Ошибка сохранения: ' + e.message);
    alert('Ошибка сохранения: ' + e.message);
  }
}

window.addEventListener('beforeunload', e => { if (dirty) e.preventDefault(); });

try { if (sessionStorage.getItem(SESSION_KEY)) start(); } catch {}
