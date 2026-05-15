# Macnite

A Ninite-style installer for macOS, powered by [Homebrew](https://brew.sh).
Tick the apps and CLI tools you want, then copy a `brew` one-liner or download a
shell script that installs Homebrew (if missing) and your selections in one go.

Pure static site. No backend, no tracking, no accounts.

## Local development

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Use a real HTTP server (not `file://`) — `fetch` and clipboard APIs need a
proper origin.

## Deploy to Netlify

Drag the folder into the Netlify UI, or:

```sh
netlify deploy --prod
```

Netlify auto-detects the hidden `<form name="macnite-errors">` in `index.html`
and provisions a form endpoint. Submissions show up under **Forms** in the
Netlify dashboard.

## Files

- `index.html` — markup, including the hidden Netlify Forms element
- `styles.css` — styling
- `app.js` — fetches the Homebrew API, renders the grid + search, builds the
  install command and script, handles error reporting
- `popular.js` — curated list of the homepage tiles
- `netlify.toml` — publish dir + cache headers

## Catalog source

- `https://formulae.brew.sh/api/cask.json`
- `https://formulae.brew.sh/api/formula.json`

Cached in `localStorage` for 24 hours.
