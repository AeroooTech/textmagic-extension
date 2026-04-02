// SnapText Options Page Script v3.0.1

let snippets = [];
let categories = [];
let editingId = null;

const VARIABLES = [
  { v: '{{date}}', d: 'Datum' },
  { v: '{{time}}', d: 'Uhrzeit' },
  { v: '{{datetime}}', d: 'Datum+Zeit' },
  { v: '{{weekday}}', d: 'Wochentag' },
  { v: '{{month}}', d: 'Monat' },
  { v: '{{year}}', d: 'Jahr' },
  { v: '{{clipboard}}', d: 'Zwischenablage' },
  { v: '{{cursor}}', d: 'Cursor-Pos.' },
  { v: '{{url}}', d: 'URL' },
  { v: '{{title}}', d: 'Seitentitel' },
  { v: '{{name}}', d: 'Name' }
];

async function loadData() {
  const data = await chrome.storage.local.get(['snippets', 'categories']);
  snippets = data.snippets || [];
  categories = data.categories || ['Allgemein'];
  renderAll();
}

function renderAll() {
  renderSnippetList();
  renderCatFilter();
  renderCatOptions();
  renderStats();
  renderVarTags();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    showPage(page);
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
  });
});

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(i => {
    if (i.dataset.page === id) i.classList.add('active');
    else i.classList.remove('active');
  });
  if (id === 'stats') renderStats();
}

function renderSnippetList() {
  const list = document.getElementById('opt-snippet-list');
  const query = (document.getElementById('opt-search')?.value || '').toLowerCase();
  const catFilter = document.getElementById('opt-cat-filter')?.value || '';

  let filtered = snippets;
  if (query) filtered = filtered.filter(s =>
    s.trigger.toLowerCase().includes(query) ||
    (s.label || '').toLowerCase().includes(query) ||
    s.content.toLowerCase().includes(query)
  );
  if (catFilter) filtered = filtered.filter(s => s.category === catFilter);
  filtered = [...filtered].sort((a, b) => (b.useCount || 0) - (a.useCount || 0));

  if (!filtered.length) {
    list.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px;">Keine Snippets gefunden.</div>`;
    return;
  }

  list.innerHTML = filtered.map(s => `
    <div class="snippet-row" data-id="${s.id}">
      <div><span class="trigger-badge">${esc(s.trigger)}</span></div>
      <div>
        <div style="font-weight:600;font-size:13px;">${esc(s.label || 'Ohne Titel')}</div>
        <div style="color:var(--text-muted);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">${esc(s.content.replace(/\n/g,' ').slice(0,50))}${s.content.length>50?'…':''}</div>
      </div>
      <div><span class="cat-badge">${esc(s.category || 'Allgemein')}</span></div>
      <div style="font-size:11.5px;color:var(--text-muted);">${formatDate(s.createdAt)}</div>
      <div class="uses-count">${s.useCount || 0}×</div>
      <div class="row-actions">
        <button class="btn-sm" data-action="edit" data-id="${s.id}">✏ Edit</button>
        <button class="btn-sm danger" data-action="delete" data-id="${s.id}">✕</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.btn-sm').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') openEditModal(id);
      else if (action === 'delete') await deleteSnippet(id);
    });
  });
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderCatFilter() {
  const sel = document.getElementById('opt-cat-filter');
  if (!sel) return;
  const allCats = ['', ...new Set(snippets.map(s => s.category).filter(Boolean))];
  sel.innerHTML = '<option value="">Alle Kategorien</option>' +
    allCats.slice(1).map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

function renderCatOptions() {
  const allCats = [...new Set(['Allgemein', ...categories, ...snippets.map(s => s.category).filter(Boolean)])];
  ['opt-category', 'm-category'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = allCats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (prev) sel.value = prev;
  });
}

function renderVarTags() {
  const el = document.getElementById('var-tags');
  if (!el) return;
  el.innerHTML = VARIABLES.map(v =>
    `<span class="btn-sm" data-var="${v.v}" style="cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:11px;color:#a5b4fc;border-color:rgba(99,102,241,0.35);">${v.v}</span>`
  ).join('');
  el.querySelectorAll('.btn-sm').forEach(tag => {
    tag.addEventListener('click', () => {
      const ta = document.getElementById('opt-content');
      const v = tag.dataset.var;
      const start = ta.selectionStart;
      ta.value = ta.value.substring(0, start) + v + ta.value.substring(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = start + v.length;
      ta.focus();
    });
  });
}

document.getElementById('opt-search')?.addEventListener('input', renderSnippetList);
document.getElementById('opt-cat-filter')?.addEventListener('change', renderSnippetList);

document.getElementById('opt-save-btn')?.addEventListener('click', async () => {
  const trigger = document.getElementById('opt-trigger').value.trim();
  const label = document.getElementById('opt-label').value.trim();
  const content = document.getElementById('opt-content').value;
  const catSel = document.getElementById('opt-category').value;
  const catNew = document.getElementById('opt-new-cat').value.trim();
  const category = catNew || catSel || 'Allgemein';

  if (!trigger || !content) return alert('Trigger und Inhalt sind Pflichtfelder.');
  if (!trigger.startsWith('/')) return alert('Trigger muss mit / beginnen.');

  if (editingId) {
    snippets = snippets.map(s => s.id === editingId ? { ...s, trigger, label, content, category } : s);
    editingId = null;
    document.getElementById('form-page-title').textContent = 'Neues Snippet erstellen';
    document.getElementById('opt-save-btn').textContent = '⚡ Speichern';
  } else {
    if (snippets.find(s => s.trigger === trigger)) return alert(`Trigger "${trigger}" existiert bereits.`);
    snippets.push({ id: crypto.randomUUID(), trigger, label, content, category, useCount: 0, createdAt: Date.now() });
    if (catNew && !categories.includes(catNew)) { categories.push(catNew); }
  }

  await chrome.storage.local.set({ snippets, categories });
  document.getElementById('opt-trigger').value = '';
  document.getElementById('opt-label').value = '';
  document.getElementById('opt-content').value = '';
  document.getElementById('opt-new-cat').value = '';

  const msg = document.getElementById('opt-save-msg');
  msg.style.display = 'inline';
  setTimeout(() => msg.style.display = 'none', 2000);

  renderAll();
  showPage('snippets');
});

document.getElementById('opt-cancel-btn')?.addEventListener('click', () => showPage('snippets'));

async function deleteSnippet(id) {
  if (!confirm('Snippet wirklich löschen?')) return;
  snippets = snippets.filter(s => s.id !== id);
  await chrome.storage.local.set({ snippets });
  renderAll();
}

function openEditModal(id) {
  const s = snippets.find(x => x.id === id);
  if (!s) return;
  editingId = id;
  document.getElementById('m-trigger').value = s.trigger;
  document.getElementById('m-label').value = s.label || '';
  document.getElementById('m-content').value = s.content;
  renderCatOptions();
  document.getElementById('m-category').value = s.category || 'Allgemein';
  document.getElementById('edit-modal').classList.add('open');
}

document.getElementById('modal-close')?.addEventListener('click', () => {
  document.getElementById('edit-modal').classList.remove('open');
  editingId = null;
});

document.getElementById('modal-cancel-btn')?.addEventListener('click', () => {
  document.getElementById('edit-modal').classList.remove('open');
  editingId = null;
});

document.getElementById('modal-save')?.addEventListener('click', async () => {
  if (!editingId) return;
  const trigger = document.getElementById('m-trigger').value.trim();
  const label = document.getElementById('m-label').value.trim();
  const content = document.getElementById('m-content').value;
  const category = document.getElementById('m-category').value;

  if (!trigger || !content) return alert('Trigger und Inhalt sind Pflichtfelder.');
  snippets = snippets.map(s => s.id === editingId ? { ...s, trigger, label, content, category } : s);
  await chrome.storage.local.set({ snippets });
  editingId = null;
  document.getElementById('edit-modal').classList.remove('open');
  renderAll();
});

function renderStats() {
  const totalUses = snippets.reduce((a, s) => a + (s.useCount || 0), 0);
  const savedSec = totalUses * 8;
  const topCat = (() => {
    const counts = {};
    snippets.forEach(s => { counts[s.category] = (counts[s.category] || 0) + (s.useCount || 0); });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  })();

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-big">${snippets.length}</div><div class="stat-lbl">Snippets</div></div>
    <div class="stat-card"><div class="stat-big">${totalUses}</div><div class="stat-lbl">Expansionen</div></div>
    <div class="stat-card"><div class="stat-big">${Math.round(savedSec / 60)}</div><div class="stat-lbl">Minuten gespart</div></div>
    <div class="stat-card"><div class="stat-big" style="font-size:16px;">${topCat}</div><div class="stat-lbl">Top Kategorie</div></div>
  `;

  const top = [...snippets].sort((a, b) => (b.useCount || 0) - (a.useCount || 0)).slice(0, 8);
  document.getElementById('top-snippets').innerHTML = top.length ? top.map(s => `
    <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);">
      <span class="trigger-badge">${esc(s.trigger)}</span>
      <span style="flex:1;font-size:13px;">${esc(s.label || s.content.slice(0, 40))}</span>
      <span class="uses-count">${s.useCount || 0}×</span>
    </div>
  `).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:16px 0;">Noch keine Verwendungen.</div>';
}

document.getElementById('btn-export-json')?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, snippets }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `snaptext-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-export-csv')?.addEventListener('click', () => {
  const rows = [['trigger', 'label', 'content', 'category', 'useCount']];
  snippets.forEach(s => rows.push([s.trigger, s.label || '', s.content.replace(/\n/g, '\\n'), s.category || '', s.useCount || 0]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `snaptext-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-area')?.addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const successEl = document.getElementById('import-success');
  const errorEl = document.getElementById('import-error');
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const imported = json.snippets || (Array.isArray(json) ? json : null);
    if (!imported) throw new Error('Invalid format');
    
    const existingTriggers = new Set(snippets.map(s => s.trigger));
    const toAdd = imported.filter(s => !existingTriggers.has(s.trigger));
    snippets.push(...toAdd.map(s => ({ ...s, id: s.id || crypto.randomUUID() })));
    await chrome.storage.local.set({ snippets });
    
    successEl.textContent = `✓ ${toAdd.length} Snippets importiert (${imported.length - toAdd.length} Duplikate übersprungen)`;
    successEl.style.display = 'block';
    errorEl.style.display = 'none';
    renderAll();
  } catch (err) {
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
  }
  e.target.value = '';
});

let optSettings = { prefix: '/', toastEnabled: true, dropdownEnabled: true };

async function loadSettings() {
  const data = await chrome.storage.local.get('settings');
  if (data.settings) optSettings = { ...optSettings, ...data.settings };
  const pi = document.getElementById('opt-prefix-input');
  if (pi) pi.value = optSettings.prefix || '/';
  const st = document.getElementById('set-toast');
  const sd = document.getElementById('set-dropdown');
  if (st) st.checked = optSettings.toastEnabled !== false;
  if (sd) sd.checked = optSettings.dropdownEnabled !== false;
}

document.getElementById('opt-prefix-save')?.addEventListener('click', async () => {
  const val = (document.getElementById('opt-prefix-input')?.value || '').trim();
  if (!val) return alert('Präfix darf nicht leer sein.');
  optSettings.prefix = val;
  if (document.getElementById('set-toast')) optSettings.toastEnabled = document.getElementById('set-toast').checked;
  if (document.getElementById('set-dropdown')) optSettings.dropdownEnabled = document.getElementById('set-dropdown').checked;
  await chrome.storage.local.set({ settings: optSettings });
  const btn = document.getElementById('opt-prefix-save');
  btn.textContent = '✓ Gespeichert';
  setTimeout(() => btn.textContent = 'Speichern', 1500);
});

document.getElementById('set-toast')?.addEventListener('change', async () => {
  optSettings.toastEnabled = document.getElementById('set-toast').checked;
  await chrome.storage.local.set({ settings: optSettings });
});
document.getElementById('set-dropdown')?.addEventListener('change', async () => {
  optSettings.dropdownEnabled = document.getElementById('set-dropdown').checked;
  await chrome.storage.local.set({ settings: optSettings });
});

loadSettings();

document.getElementById('btn-reset')?.addEventListener('click', async () => {
  if (confirm('ACHTUNG: Alle Snippets werden dauerhaft gelöscht! Fortfahren?')) {
    await chrome.storage.local.clear();
    snippets = [];
    categories = ['Allgemein'];
    renderAll();
    alert('Alle Daten gelöscht.');
  }
});

loadData();
