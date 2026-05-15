import { POPULAR } from './popular.js';
import {
  loadCatalogs, buildIndex, keyOf,
  buildCommand, buildScript, splitSelection,
  showNextSteps, escapeHtml, buildIcon,
} from './shared.js';

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

async function copyCommand() {
  const cmd = buildCommand(splitSelection(state.selected));
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
  const text = buildScript(splitSelection(state.selected));
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

(async function init() {
  try {
    const data = await loadCatalogs();
    const { index, byKey } = buildIndex(data);
    state.index = index;
    state.byKey = byKey;
    renderPopular();
    updateSelectionBar();
  } catch (err) {
    popularGrid.innerHTML = `<p class="loading">Couldn't load the Homebrew catalog (${escapeHtml(err.message)}). Check your connection and refresh.</p>`;
  }
})();
