import {
  loadCatalogs, buildIndex, keyOf,
  buildCommand, buildScript, splitSelection,
  showNextSteps, escapeHtml, buildIcon, TOKEN_RE,
} from './shared.js';

const PRESETS = [
  {
    id: 'essentials',
    name: 'New Mac essentials',
    desc: "If you just unboxed a Mac, install these first.",
    apps: [
      { kind: 'cask', token: 'google-chrome' },
      { kind: 'cask', token: '1password' },
      { kind: 'cask', token: 'raycast' },
      { kind: 'cask', token: 'rectangle' },
      { kind: 'cask', token: 'the-unarchiver' },
      { kind: 'cask', token: 'appcleaner' },
      { kind: 'cask', token: 'vlc' },
    ],
  },
  {
    id: 'developer',
    name: 'Developer',
    desc: 'Editor, terminal, containers, and the toolchain basics.',
    apps: [
      { kind: 'cask',    token: 'visual-studio-code' },
      { kind: 'cask',    token: 'iterm2' },
      { kind: 'cask',    token: 'docker' },
      { kind: 'cask',    token: 'github' },
      { kind: 'cask',    token: 'postman' },
      { kind: 'cask',    token: 'tableplus' },
      { kind: 'formula', token: 'git' },
      { kind: 'formula', token: 'node' },
    ],
  },
  {
    id: 'creative',
    name: 'Designer & Creative',
    desc: 'Adobe Creative Cloud plus the open-source classics.',
    apps: [
      { kind: 'cask', token: 'adobe-creative-cloud' },
      { kind: 'cask', token: 'figma' },
      { kind: 'cask', token: 'sketch' },
      { kind: 'cask', token: 'blender' },
      { kind: 'cask', token: 'gimp' },
      { kind: 'cask', token: 'inkscape' },
      { kind: 'cask', token: 'handbrake' },
    ],
  },
  {
    id: 'student',
    name: 'Student & Office',
    desc: 'Docs, notes, video calls, and research helpers.',
    apps: [
      { kind: 'cask', token: 'libreoffice' },
      { kind: 'cask', token: 'zoom' },
      { kind: 'cask', token: 'notion' },
      { kind: 'cask', token: 'obsidian' },
      { kind: 'cask', token: 'zotero' },
      { kind: 'cask', token: 'chatgpt' },
      { kind: 'cask', token: 'google-drive' },
    ],
  },
  {
    id: 'communication',
    name: 'Communication',
    desc: 'Chat, calls, and meetings — covers most teams.',
    apps: [
      { kind: 'cask', token: 'zoom' },
      { kind: 'cask', token: 'slack' },
      { kind: 'cask', token: 'discord' },
      { kind: 'cask', token: 'microsoft-teams' },
      { kind: 'cask', token: 'whatsapp' },
      { kind: 'cask', token: 'signal' },
      { kind: 'cask', token: 'telegram' },
    ],
  },
  {
    id: 'gaming',
    name: 'Gaming',
    desc: 'Stores, voice, and capture for playing on a Mac.',
    apps: [
      { kind: 'cask', token: 'steam' },
      { kind: 'cask', token: 'epic-games' },
      { kind: 'cask', token: 'discord' },
      { kind: 'cask', token: 'obs' },
    ],
  },
  {
    id: 'creator',
    name: 'Content creator',
    desc: 'Stream, record, edit, and ship video and audio.',
    apps: [
      { kind: 'cask', token: 'obs' },
      { kind: 'cask', token: 'audacity' },
      { kind: 'cask', token: 'handbrake' },
      { kind: 'cask', token: 'davinci-resolve' },
      { kind: 'cask', token: 'krita' },
      { kind: 'cask', token: 'iina' },
    ],
  },
  {
    id: 'power-user',
    name: 'Power user',
    desc: 'Quality-of-life utilities that supercharge macOS.',
    apps: [
      { kind: 'cask', token: 'raycast' },
      { kind: 'cask', token: 'rectangle' },
      { kind: 'cask', token: 'alt-tab' },
      { kind: 'cask', token: 'karabiner-elements' },
      { kind: 'cask', token: 'stats' },
      { kind: 'cask', token: 'hiddenbar' },
      { kind: 'cask', token: 'the-unarchiver' },
    ],
  },
  {
    id: 'ai',
    name: 'AI assistants',
    desc: 'Chat clients and local model runners.',
    apps: [
      { kind: 'cask', token: 'chatgpt' },
      { kind: 'cask', token: 'claude' },
      { kind: 'cask', token: 'ollama' },
      { kind: 'cask', token: 'lm-studio' },
    ],
  },
];

const presetsGrid = document.querySelector('#presets-grid');

function presetSelection(preset) {
  const keys = new Set();
  for (const { kind, token } of preset.apps) {
    if (!TOKEN_RE.test(token)) continue;
    keys.add(keyOf(kind, token));
  }
  return splitSelection(keys);
}

function buildPresetCard(preset, byKey) {
  const card = document.createElement('article');
  card.className = 'preset-card';
  card.dataset.preset = preset.id;

  const h3 = document.createElement('h3');
  h3.className = 'preset-name';
  h3.textContent = preset.name;

  const desc = document.createElement('p');
  desc.className = 'preset-desc';
  desc.textContent = preset.desc;

  const appsRow = document.createElement('ul');
  appsRow.className = 'preset-card-apps';

  for (const { kind, token } of preset.apps) {
    const entry = byKey?.get(keyOf(kind, token)) ?? { kind, token, name: token, desc: '', homepage: '' };
    const li = document.createElement('li');
    li.className = 'preset-app';
    const icon = buildIcon(entry);
    const label = document.createElement('span');
    label.className = 'preset-app-name';
    label.textContent = entry.name || token;
    li.append(icon, label);
    li.title = `${entry.name || token}${entry.desc ? ' — ' + entry.desc : ''}`;
    appsRow.appendChild(li);
  }

  const actions = document.createElement('div');
  actions.className = 'preset-card-actions';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy command';
  copyBtn.addEventListener('click', () => copyPreset(preset, copyBtn));

  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'ghost';
  downloadBtn.textContent = 'Download script';
  downloadBtn.addEventListener('click', () => downloadPreset(preset));

  actions.append(copyBtn, downloadBtn);
  card.append(h3, desc, appsRow, actions);
  return card;
}

async function copyPreset(preset, btn) {
  const cmd = buildCommand(presetSelection(preset));
  try {
    await navigator.clipboard.writeText(cmd);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = cmd;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  if (btn) {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }
  showNextSteps('copied', cmd);
}

function downloadPreset(preset) {
  const text = buildScript(presetSelection(preset));
  const blob = new Blob([text], { type: 'text/x-shellscript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `macnite-${preset.id}.sh`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showNextSteps('downloaded');
}

function renderPresets(byKey) {
  presetsGrid.removeAttribute('aria-busy');
  presetsGrid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const preset of PRESETS) {
    frag.appendChild(buildPresetCard(preset, byKey));
  }
  presetsGrid.appendChild(frag);
}

// ---- Suggest-a-preset form (Netlify Forms) ----

const suggestForm = document.querySelector('#suggest-form');
const suggestName = document.querySelector('#suggest-name');
const suggestLink = document.querySelector('#suggest-link');
const suggestWhy = document.querySelector('#suggest-why');
const suggestSubmit = document.querySelector('#suggest-submit');
const suggestStatus = document.querySelector('#suggest-status');

function setSuggestStatus(text, kind) {
  suggestStatus.textContent = text;
  suggestStatus.classList.remove('ok', 'err');
  if (kind) suggestStatus.classList.add(kind);
}

async function submitSuggestion(e) {
  e.preventDefault();
  const preset_name = suggestName.value.trim();
  const share_link = suggestLink.value.trim();
  const why = suggestWhy.value.trim();
  if (!preset_name) {
    setSuggestStatus('Give the preset a name.', 'err');
    suggestName.focus();
    return;
  }
  if (!share_link || !/#share=/.test(share_link)) {
    setSuggestStatus("That doesn't look like a share link — it should contain '#share='.", 'err');
    suggestLink.focus();
    return;
  }
  suggestSubmit.disabled = true;
  const originalLabel = suggestSubmit.textContent;
  suggestSubmit.textContent = 'Sending…';
  setSuggestStatus('', '');
  try {
    const body = new URLSearchParams({
      'form-name': 'macnite-preset-suggestion',
      preset_name,
      share_link,
      why,
      user_agent: navigator.userAgent,
      'bot-field': '',
    });
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Form POST failed: ${res.status}`);
    suggestForm.reset();
    setSuggestStatus('Thanks — we\'ll take a look.', 'ok');
  } catch (err) {
    setSuggestStatus(`Couldn't send: ${err.message}`, 'err');
  } finally {
    suggestSubmit.disabled = false;
    suggestSubmit.textContent = originalLabel;
  }
}

suggestForm.addEventListener('submit', submitSuggestion);

(async function init() {
  // Render once with fallback names immediately so users see something fast.
  // If the catalog loads, re-render with proper names + icons.
  renderPresets(null);
  try {
    const data = await loadCatalogs();
    const { byKey } = buildIndex(data);
    renderPresets(byKey);
  } catch {
    // Cards already rendered with fallback names; commands still work since
    // tokens are hardcoded. Silently leave the fallback view in place.
  }
})();
