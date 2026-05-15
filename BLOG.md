# Macnite: a Ninite for Mac, built in a static HTML file

If you've ever set up a Windows machine, you've probably used [Ninite](https://ninite.com).
You tick the apps you want, you get one installer, you double-click it, and a
few minutes later your machine is loaded up with Chrome, VLC, 7-Zip, and so on.
No wizards. No "decline" buttons for browser toolbars. No signups. It's lovely.

There's nothing like it for Mac.

There's [Homebrew](https://brew.sh), which is amazing — but it's a command-line
tool, and asking a friend who just got a new MacBook to "open Terminal and
run `brew install --cask google-chrome firefox 1password zoom`" is asking a
lot.

So I built **Macnite**: a single HTML page where you tick apps, hit a button,
and get a one-line command (or a downloadable installer) that does the whole
thing. Homebrew under the hood, no signup, no tracking, no install wizard.

Here's how it works.

## The whole app is static

Macnite is `index.html`, `app.js`, `styles.css`, and a curated `popular.js`.
There's no backend. There's no build step. The deploy is "drag the folder
into Netlify."

That's possible because Homebrew already publishes a complete machine-readable
catalog as JSON:

- `https://formulae.brew.sh/api/cask.json` — every GUI app brew knows about
- `https://formulae.brew.sh/api/formula.json` — every CLI tool brew knows about

Both endpoints serve `Access-Control-Allow-Origin: *`, so the browser can fetch
them directly. ~10 MB combined. I cache the result in `localStorage` for 24
hours so the second page load is instant.

## Picking apps is just a `Set` of strings

When you tick a tile, I store `"cask:google-chrome"` in a `Set`. When you
untick it, I remove it. That's the entire selection model. The same app can
appear in both the popular grid and the search results — a small helper syncs
the checked state across mirrored tiles by `data-key` so they stay in lockstep.

The popular list itself is a hand-curated array in `popular.js`. I started
out heavy on dev tools and got feedback that the homepage felt too technical,
so I rebalanced toward everyday apps: browsers, messaging, media, password
managers, ChatGPT, Steam. CLI tools are still findable via search.

## Generating the install command

This was the part I got wrong twice before getting right.

**First attempt:**

```
brew install --cask google-chrome slack && brew install jq
```

This assumes `brew` is already installed. If it isn't, the command fails with
`command not found: brew` and the user is stranded.

**Second attempt:**

```
command -v brew >/dev/null 2>&1 || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" && brew install --cask google-chrome
```

This installs brew if it's missing, then runs `brew install`. Works on Intel
Macs. Fails on Apple Silicon. Why?

Because on Apple Silicon, Homebrew installs to `/opt/homebrew/bin`, which isn't
on `PATH` by default. The brew install script tells you to add it to your
shell profile — but that affects future shells, not the one you're sitting in
right now. So `brew install` immediately after the bootstrap *still* fails.

**Final form:**

```
command -v brew >/dev/null 2>&1 || /bin/bash -c "$(curl -fsSL …install.sh)" \
  && eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)" \
  && brew install --cask google-chrome slack \
  && brew install jq
```

`brew shellenv` prints the `export PATH=…` lines brew wants you to source.
`eval`-ing it makes `brew` available in the current shell, no relogin needed.
Try Apple Silicon's path first, fall back to Intel's. Now the command works
on a fresh Mac.

The downloadable `.sh` does the same thing in a more readable form.

## The "what do I do with this" dialog

After you hit Copy or Download, Macnite pops up a modal with literal-English
instructions: open Terminal (with the ⌘+Space shortcut), paste, hit Enter,
type your password when asked, wait. A first user got tripped up by an
earlier version of the instructions because the words `bash` and `brew` look
similar at a glance — they typed `brew script.sh` instead of `bash script.sh`,
and brew helpfully replied with its usage page.

So the dialog now shows the entire pasteable command in a code block with a
Copy button. No typing required, no word confusion.

The download path has its own gotcha: if you've already downloaded the
installer once, Safari names the new one `macnite-install-2.sh`, and a
hardcoded `bash ~/Downloads/macnite-install.sh` won't find it. The fix:

```
bash "$(ls -t ~/Downloads/macnite-install*.sh | head -n1)"
```

`ls -t` sorts by modification time, newest first. `head -n1` picks the latest.
Whatever name Safari gave the file, this runs the most recent one.

## Reporting problems

A static site can't run code on a server, but Netlify Forms gives you a
zero-backend way to collect submissions. You drop a `<form netlify>` element
in your HTML, Netlify scrapes it at deploy time, and form POSTs to the page
URL get routed to your dashboard. I started with an auto-popping error banner,
but a `window.error` listener picks up plenty of unrelated noise from
extensions and content blockers, so the page kept telling users "Something
went wrong." with no detail. Bad UX.

The current version is a plain textarea at the bottom: "Need help or seeing
a problem? Paste any error message and we'll take a look." That's it.

## What's next

Probably: icons that aren't favicons (the favicon service we use is fine but
inconsistent across vendors), a way to share a Macnite link to a specific
selection, and a "did this work?" callback so I can see which apps actually
install cleanly on first try.

The whole thing is ~500 lines of JS. The hardest parts were the things that
*looked* simple: one shell line that works on every Mac, four sentences of
instructions that don't mislead a non-technical user. Software is funny like
that.
