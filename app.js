import { POPULAR } from './popular.js';

const CASK_URL = 'https://formulae.brew.sh/api/cask.json';
const FORMULA_URL = 'https://formulae.brew.sh/api/formula.json';
const CACHE_KEY = 'macnite:catalog:v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[a-z0-9][a-z0-9._+-]*$/i;
const MAX_RESULTS = 100;

const state = {
  index: [],                  // [{ kind, token, name, desc }]
  byKey: new Map(),           // "kind:token" -> entry
  selected: new Set(),        // Set<"kind:token">
};

const $ = (sel) => document.querySelector(sel);

const popularGrid = $('#popular-grid');
const searchInput = $('#search');
const searchResults = $('#search-results');
const countEl = $('#count');
const copyBtn = $('#copy');
const downloadBtn = $('#download');
const clearBtn = $('#clear');
const reportForm = $('#report-form');
const reportMessage = $('#report-message');
const reportSubmit = $('#report-submit');
const reportStatus = $('#report-status');
const nextDialog = $('#next-steps');
const nextTitle = $('#next-title');
const nextBody = $('#next-body');
const nextClose = $('#next-close');

const keyOf = (kind, token) => `${kind}:${token}`;

async function loadCatalogs() {
  const cached = readCache();
  if (cached) return cached;
  const [casksRaw, formulaeRaw] = await Promise.all([
    fetch(CASK_URL).then(checkOk).then(r => r.json()),
    fetch(FORMULA_URL).then(checkOk).then(r => r.json()),
  ]);
  const casks = casksRaw.map(c => ({
    kind: 'cask',
    token: c.token,
    name: Array.isArray(c.name) ? c.name[0] : c.token,
    desc: c.desc || '',
    homepage: c.homepage || '',
  }));
  const formulae = formulaeRaw.map(f => ({
    kind: 'formula',
    token: f.name,
    name: f.name,
    desc: f.desc || '',
    homepage: f.homepage || '',
  }));
  const data = { casks, formulae, savedAt: Date.now() };
  writeCache(data);
  return data;
}

function checkOk(res) {
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status} ${res.statusText} (${res.url})`);
  return res;
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); }
  catch { /* localStorage may be full or disabled; ignore */ }
}

function buildIndex({ casks, formulae }) {
  state.index = [...casks, ...formulae];
  state.byKey.clear();
  for (const e of state.index) state.byKey.set(keyOf(e.kind, e.token), e);
}

function renderPopular() {
  popularGrid.removeAttribute('aria-busy');
  popularGrid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const { kind, token } of POPULAR) {
    const entry = state.byKey.get(keyOf(kind, token));
    if (!entry) continue;
    frag.appendChild(buildTile(entry));
  }
  popularGrid.appendChild(frag);
}

function buildTile(entry) {
  const key = keyOf(entry.kind, entry.token);
  const label = document.createElement('label');
  label.className = 'tile';
  if (state.selected.has(key)) label.classList.add('checked');
  label.dataset.key = key;

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = state.selected.has(key);
  cb.addEventListener('change', () => toggle(key, cb.checked, label));

  const icon = buildIcon(entry);

  const body = document.createElement('div');
  body.className = 'tile-body';
  const badgeLabel = entry.kind === 'cask' ? 'App' : 'Tool';
  body.innerHTML = `
    <div class="name">${escapeHtml(entry.name)}<span class="badge ${entry.kind}">${badgeLabel}</span></div>
    ${entry.desc ? `<div class="desc">${escapeHtml(entry.desc)}</div>` : ''}
  `;

  label.append(cb, icon, body);
  return label;
}

function buildIcon(entry) {
  const wrap = document.createElement('div');
  wrap.className = 'icon';
  const url = faviconUrl(entry.homepage);
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.remove();
      wrap.textContent = (entry.name || entry.token).charAt(0).toUpperCase();
      wrap.classList.add('icon-fallback');
    }, { once: true });
    wrap.appendChild(img);
  } else {
    wrap.textContent = (entry.name || entry.token).charAt(0).toUpperCase();
    wrap.classList.add('icon-fallback');
  }
  return wrap;
}

function faviconUrl(homepage) {
  if (!homepage) return null;
  try {
    const host = new URL(homepage).hostname;
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return null;
  }
}

function toggle(key, checked, tileEl) {
  if (checked) state.selected.add(key);
  else state.selected.delete(key);
  tileEl?.classList.toggle('checked', checked);
  syncMirroredCheckboxes(key, checked);
  updateSelectionBar();
}

function syncMirroredCheckboxes(key, checked) {
  // Same item may appear in both the popular grid and the search results.
  document.querySelectorAll(`.tile[data-key="${cssEscape(key)}"]`).forEach(tile => {
    tile.classList.toggle('checked', checked);
    const cb = tile.querySelector('input[type=checkbox]');
    if (cb && cb.checked !== checked) cb.checked = checked;
  });
}

function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const renderSearch = debounce((query) => {
  const q = query.trim().toLowerCase();
  searchResults.innerHTML = '';
  if (!q) return;
  const matches = [];
  for (const e of state.index) {
    if (matches.length >= MAX_RESULTS + 1) break;
    if (e.token.toLowerCase().includes(q)
        || e.name.toLowerCase().includes(q)
        || e.desc.toLowerCase().includes(q)) {
      matches.push(e);
    }
  }
  const overflow = matches.length > MAX_RESULTS;
  const shown = overflow ? matches.slice(0, MAX_RESULTS) : matches;
  if (shown.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'No matches.';
    searchResults.appendChild(hint);
    return;
  }
  const frag = document.createDocumentFragment();
  for (const e of shown) frag.appendChild(buildTile(e));
  if (overflow) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = `Showing first ${MAX_RESULTS} matches. Refine your search to see more.`;
    frag.appendChild(hint);
  }
  searchResults.appendChild(frag);
}, 150);

function updateSelectionBar() {
  const n = state.selected.size;
  countEl.textContent = n === 0
    ? 'Tick an app to get started'
    : `${n} app${n === 1 ? '' : 's'} selected`;
  const disabled = n === 0;
  copyBtn.disabled = disabled;
  downloadBtn.disabled = disabled;
  clearBtn.disabled = disabled;
}

function selectionByKind() {
  const casks = [];
  const formulae = [];
  for (const key of state.selected) {
    const [kind, token] = splitKey(key);
    if (!TOKEN_RE.test(token)) continue; // defensive: never emit weird tokens into shell
    if (kind === 'cask') casks.push(token);
    else if (kind === 'formula') formulae.push(token);
  }
  casks.sort(); formulae.sort();
  return { casks, formulae };
}

function splitKey(key) {
  const i = key.indexOf(':');
  return [key.slice(0, i), key.slice(i + 1)];
}

const BREW_INSTALL_URL = 'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh';
// After a fresh Homebrew install, `brew` isn't on PATH in the current shell —
// especially on Apple Silicon (/opt/homebrew/bin). Eval shellenv so the install
// step below can actually find `brew`.
const BREW_SHELLENV_EVAL = 'eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)"';
const MACNITE_BANNER_URL = 'https://macnite.seanblowers.app/banner.txt';
// Brace-grouped so `|| true` only catches a curl failure, not the brew
// install that runs before it in the one-liner chain.
const MACNITE_BANNER_CMD = `{ curl -fsSL ${MACNITE_BANNER_URL} 2>/dev/null || true; }`;

function buildCommand() {
  const { casks, formulae } = selectionByKind();
  const parts = [
    `command -v brew >/dev/null 2>&1 || /bin/bash -c "$(curl -fsSL ${BREW_INSTALL_URL})"`,
    BREW_SHELLENV_EVAL,
  ];
  if (casks.length)    parts.push(`brew install --cask ${casks.join(' ')}`);
  if (formulae.length) parts.push(`brew install ${formulae.join(' ')}`);
  parts.push(MACNITE_BANNER_CMD);
  return parts.join(' && ');
}

function buildScript() {
  const { casks, formulae } = selectionByKind();
  const lines = [
    '#!/usr/bin/env bash',
    '# Generated by Macnite — https://macnite.seanblowers.app',
    'set -euo pipefail',
    '',
    'if ! command -v brew >/dev/null 2>&1; then',
    '  echo "Installing Homebrew…"',
    `  /bin/bash -c "$(curl -fsSL ${BREW_INSTALL_URL})"`,
    'fi',
    '',
    '# Make sure brew is on PATH for this shell (Apple Silicon vs. Intel).',
    'if   [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"',
    'elif [ -x /usr/local/bin/brew ];   then eval "$(/usr/local/bin/brew shellenv)"',
    'fi',
    '',
  ];
  if (casks.length)    lines.push(`brew install --cask ${casks.join(' ')}`);
  if (formulae.length) lines.push(`brew install ${formulae.join(' ')}`);
  lines.push('', MACNITE_BANNER_CMD, '');
  return lines.join('\n');
}

async function copyCommand() {
  const cmd = buildCommand();
  try {
    await navigator.clipboard.writeText(cmd);
  } catch {
    // Fallback for old browsers / insecure contexts
    const ta = document.createElement('textarea');
    ta.value = cmd;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  showNextSteps('copied', cmd);
}

function downloadScript() {
  const text = buildScript();
  const blob = new Blob([text], { type: 'text/x-shellscript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'macnite-install.sh';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showNextSteps('downloaded');
}

function showNextSteps(mode, cmd) {
  nextBody.innerHTML = '';
  let title, steps, snippet;
  if (mode === 'copied') {
    title = 'Copied! Here\'s what to do next';
    steps = [
      'Open <strong>Terminal</strong>: press <kbd>⌘</kbd>+<kbd>Space</kbd>, type <em>Terminal</em>, press Enter.',
      'Click anywhere in the Terminal window, paste with <kbd>⌘</kbd>+<kbd>V</kbd>, and press Enter.',
      'If you\'re asked for your Mac password, type it and press Enter. You won\'t see the letters as you type — that\'s normal.',
      'Leave Terminal running. When you see your name and a <code>%</code> prompt again, everything is installed.',
    ];
    snippet = cmd;
  } else {
    title = 'Downloaded! Here\'s how to run it';
    steps = [
      'Open <strong>Terminal</strong>: press <kbd>⌘</kbd>+<kbd>Space</kbd>, type <em>Terminal</em>, press Enter.',
      'Copy the command below, paste it in Terminal (<kbd>⌘</kbd>+<kbd>V</kbd>), and press Enter.',
      'If you\'re asked for your Mac password, type it and press Enter. You won\'t see the letters as you type — that\'s normal.',
      'When you see your name and a <code>%</code> prompt again, everything is installed.',
    ];
    // Picks the most recently downloaded macnite-install*.sh in ~/Downloads,
    // so it works whether Safari named the file macnite-install.sh,
    // macnite-install-2.sh, etc.
    snippet = 'bash "$(ls -t ~/Downloads/macnite-install*.sh | head -n1)"';
  }
  nextTitle.textContent = title;
  for (const html of steps) {
    const li = document.createElement('li');
    li.innerHTML = html;
    nextBody.appendChild(li);
  }
  if (snippet) {
    const wrap = document.createElement('div');
    wrap.className = 'cmd-wrap';
    const pre = document.createElement('pre');
    pre.className = 'cmd-preview';
    pre.textContent = snippet;
    const copyAgain = document.createElement('button');
    copyAgain.type = 'button';
    copyAgain.className = 'cmd-copy ghost';
    copyAgain.textContent = 'Copy';
    copyAgain.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(snippet); copyAgain.textContent = 'Copied'; }
      catch { copyAgain.textContent = 'Copy failed'; }
      setTimeout(() => { copyAgain.textContent = 'Copy'; }, 1500);
    });
    wrap.append(pre, copyAgain);
    nextBody.appendChild(wrap);
  }
  if (typeof nextDialog.showModal === 'function') nextDialog.showModal();
  else nextDialog.setAttribute('open', '');
}

function closeNextSteps() {
  if (typeof nextDialog.close === 'function') nextDialog.close();
  else nextDialog.removeAttribute('open');
}

function clearSelection() {
  for (const key of [...state.selected]) {
    state.selected.delete(key);
    syncMirroredCheckboxes(key, false);
  }
  updateSelectionBar();
}

// ---- User-driven error reporting (Netlify Forms) ----

async function submitReport(e) {
  e.preventDefault();
  const message = reportMessage.value.trim();
  if (!message) {
    setReportStatus('Paste the error message first.', 'err');
    reportMessage.focus();
    return;
  }
  reportSubmit.disabled = true;
  const originalLabel = reportSubmit.textContent;
  reportSubmit.textContent = 'Sending…';
  setReportStatus('', '');
  try {
    const body = new URLSearchParams({
      'form-name': 'macnite-errors',
      message,
      stack: '',
      user_agent: navigator.userAgent,
      url: location.href,
      'bot-field': '',
    });
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Form POST failed: ${res.status}`);
    reportMessage.value = '';
    setReportStatus('Thanks — your report was sent.', 'ok');
  } catch (err) {
    setReportStatus(`Couldn't send: ${err.message}`, 'err');
  } finally {
    reportSubmit.disabled = false;
    reportSubmit.textContent = originalLabel;
  }
}

function setReportStatus(text, kind) {
  reportStatus.textContent = text;
  reportStatus.classList.remove('ok', 'err');
  if (kind) reportStatus.classList.add(kind);
}

// ---- Wire-up ----

searchInput.addEventListener('input', (e) => renderSearch(e.target.value));
copyBtn.addEventListener('click', copyCommand);
downloadBtn.addEventListener('click', downloadScript);
clearBtn.addEventListener('click', clearSelection);
reportForm.addEventListener('submit', submitReport);
nextClose.addEventListener('click', closeNextSteps);

(async function init() {
  try {
    const data = await loadCatalogs();
    buildIndex(data);
    renderPopular();
    updateSelectionBar();
  } catch (err) {
    popularGrid.innerHTML = `<p class="loading">Couldn't load the Homebrew catalog (${escapeHtml(err.message)}). Check your connection and refresh.</p>`;
  }
})();
