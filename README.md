# Signal: a personal newsfeed

Signal pulls 50 hand-picked sources into one fast, private reader, across three interests: **Security**, **Music** and **Games**. You can save articles, tag them and write notes as you learn. It also doubles as a hands-on security project: every design choice here is a real defensive technique, explained in the code and in [Security design](#security-design) below.

- **Organized by topic:**
  - **Security:** News & Breaches, Threat Research, Vulnerabilities & Advisories, AppSec, Cloud Security, Perspectives
  - **Music:** Production & Gear, Theory & Learning
  - **Games:** Indie & Design, Game Security & Hacking
- **Concept tags:** each article is auto-tagged with its section's vocabulary (phishing and ransomware for security, synthesis and mixing for music, anti-cheat and reverse engineering for games), so you can study by idea, not just by source.
- **CVE links:** every CVE ID mentioned links straight to the National Vulnerability Database. CISA's Known Exploited Vulnerabilities catalog is built in.
- **Notebook:** write notes with learning prompts ("Key takeaway", "How I would detect this"), add your own tags, and review everything in one place.
- **Private by design:** your saves and notes never leave your browser. Export and import lets you back them up or move them.
- **Add sources in two clicks:** paste a website, feed or YouTube channel, and it's checked and sorted into the right subcategory for you.
- **Make it yours:** 8 color themes plus any color you pick, light/dark/auto, text size, density and corner style.
- **Keyboard-friendly:** `j`/`k` to move, `s` to save, `n` to write a note, `/` to search, `?` for all shortcuts.

## How it works

```
 feeds.json ──▶ GitHub Action (every 3 hours) ──▶ GitHub Pages
 (your list)     • fetches every feed              • index.html + app.js
                 • converts to plain text          • data/articles.json
                 • merges with published history          │
                                                          ▼
                                   Your browser: saves, notes, read history
                                   (stored locally, never uploaded)
```

There's no server or database to run, and it costs nothing.

## One-time setup (about 5 minutes)

1. **Create an empty repo** at <https://github.com/new>:
   - Owner: `TonyBoy56`
   - Name: `newsfeed`
   - Public
   - Leave "Add a README" **unchecked**

2. **Push this code.** From inside this folder:

   ```bash
   git init -b main
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/TonyBoy56/newsfeed.git
   git push -u origin main
   ```

   If Git asks you to sign in, the easiest route is the [GitHub CLI](https://cli.github.com): run `gh auth login` once, then push again.

   The push starts a workflow run that fails, because Pages isn't on yet. That's expected; the next two steps fix it.

3. **Turn on Pages:** in the repo, go to **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.

4. **Run the first fetch:** go to **Actions → Fetch feeds and deploy → Run workflow**. After a minute or two your feed is live at:

   **https://tonyboy56.github.io/newsfeed/**

From then on it refreshes itself every 3 hours.

> GitHub pauses scheduled workflows in repos with no activity for 60 days. If updates ever stop, open the Actions tab and re-enable the workflow, or push any commit.

## Run it on your own computer instead

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev        # fetches feeds, then serves at http://localhost:4173
```

Run `npm run fetch` any time you want fresh articles. The local server only listens on your own machine and sends the full set of security headers.

**Moving from Pages to local, or between devices:** in the app, open **Your data → Export backup**, then **Import backup** on the other copy. Everything else is the same code. To stop using Pages, turn it off under **Settings → Pages**. At that point you can also make the repo private.

## Add a source

**From the app (easiest):** click **+ Add a source** in the sidebar (or press `a`).

1. Paste a feed URL, a website's homepage or a YouTube channel page (`youtube.com/@name` works).
2. Leave **Auto-sort** selected, or pick where it should go.
3. Click **Continue on GitHub**, then **Create** on the page that opens.

A bot (the `Add source` workflow) then:

- finds the feed, even from a homepage or YouTube handle
- checks that it works and isn't already in your list
- auto-sorts it into the best-matching subcategory
- commits the change and rebuilds the site
- replies on the request with where the source went and its latest posts

**From your computer:**

```bash
npm run add-source -- https://example.com                  # auto-sort
npm run add-source -- https://example.com music-theory     # choose the category
git add feeds.json && git commit -m "Add source" && git push
```

**How auto-sort works:** it reads the new source's latest posts and compares their words with each subcategory's name, description, `keywords` and the articles already in it. The comparison uses TF-IDF cosine similarity, a classic text-matching technique. It gets smarter as your feed grows. To steer it, edit a category's `"keywords"` in `feeds.json`.

## Change the look

Click **◐** in the toolbar, **Appearance** in the sidebar, or press `t`. Pick a palette, or choose any color for "Your color". Every palette is generated from a single hue, then adjusted until all text meets WCAG AA contrast (4.5:1), so even bright yellow stays readable. Your choice is saved in this browser and applies before the page draws, so there's no flash of the default theme.

## Customize your sources by hand

Edit `feeds.json`. It's organized as **sections** (Security, Music, Games), each with **categories**, and each category has a list of feeds:

```json
{ "name": "Krebs on Security", "url": "https://krebsonsecurity.com/feed/", "site": "https://krebsonsecurity.com" }
```

Push the change and the site rebuilds. To add a new interest area, add another section object. The sidebar picks it up automatically.

Where to find feeds:

- **Most sites:** try `/feed`, `/rss` or `/feed.xml` at the end of the address.
- **YouTube channels:** use `https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID`. The channel ID starts with `UC`; find it on the channel page under **About → Share channel → Copy channel ID**.

If a feed breaks, the app's **Sources** panel shows which one failed and why.

A category can set its own `"maxAgeDays"` to keep articles longer than the default. The Theory & Learning and Game Security categories use this, because their posts stay useful for months.

Settings at the top of `feeds.json`:

- `maxItemsPerFeed`: items to keep from each feed per fetch.
- `maxAgeDays`: how long articles stay in the feed, unless a category overrides it. Saved or noted articles are kept forever.
- `summaryLength`: summary length in characters.
- `repo`: your GitHub `owner/name`, which the in-app Add source button uses.

## Security design

This project is small, but it faces the same threats as bigger apps: untrusted input, a third-party supply chain, and automation with credentials. Here's what defends against each, and where to look in the code.

| Threat | Defense | Where |
|---|---|---|
| A malicious or compromised feed injects script (XSS) | Feed HTML is converted to plain text at fetch time, and the browser only inserts text with `textContent`, never `innerHTML` | `scripts/lib/parse.mjs`, `site/app.js` |
| `javascript:` or `data:` links in feeds | Only `http(s)` URLs survive, checked on the server and again in the browser (defense in depth) | `safeUrl()` / `safeHref()` |
| Anything slipping past the above | A strict Content Security Policy allows scripts only from this site, blocks all outside connections, and turns on **Trusted Types**, so `innerHTML`-style sinks throw an error | `site/index.html` |
| XML "billion laughs" (entity expansion) attacks | Tight entity limits in the XML parser, plus a test that tries the attack | `parse.mjs`, `test/parse.test.mjs` |
| Huge or hanging responses | 8 MB streaming cap, 20-second timeout, limited concurrency | `scripts/fetch-feeds.mjs` |
| Malicious backup file on import | Every field is type-checked, length-capped and URL-validated before storage | `sanitizeStore()` in `app.js` |
| Tabnabbing and referrer leaks | Outbound links use `rel="noopener noreferrer"`, and the page sets `no-referrer` | `app.js`, `index.html` |
| Over-privileged CI tokens | The workflow starts with `permissions: {}`. The build job can only read; only the deploy job can publish. No token is left in the checkout | `.github/workflows/deploy.yml` |
| Malicious dependency install scripts | `npm ci --ignore-scripts`, a lockfile, and one pinned dependency | workflows, `package.json` |
| Known-vulnerable dependencies | Dependabot opens update PRs weekly, and CI runs `npm audit` on every PR | `.github/dependabot.yml`, `ci.yml` |
| Anyone opening an issue to trigger the add-source bot | The workflow only runs for issues opened by the repo owner | `.github/workflows/add-source.yml` |
| Script injection through issue text | Issue text reaches the script only through an environment variable. It is never pasted into a shell command with `${{ }}` | `add-source.yml` |
| SSRF: making the bot fetch internal addresses (such as cloud metadata at `169.254.169.254`) | Hosts that resolve to private or loopback addresses are refused, and every redirect hop is re-checked | `scripts/lib/http.mjs` |
| A feed's title injecting links or @mentions into the bot's reply | Remote text is stripped to plain text and Markdown-escaped before it's posted | `mdSafe()` in `add-source.mjs` |
| Themes as an injection path | Colors are applied through the CSS Object Model, which CSP allows, rather than inline styles, which CSP blocks. Saved settings are validated against an allow-list | `site/theme.js` |
| Path traversal on the local server | Resolved paths must stay inside `site/`. It binds to `127.0.0.1` only | `scripts/serve.mjs` |

### Practice exercises

Each of these is a real-world skill:

1. **Break it on purpose.** Add `<script>alert(1)</script>` to a test feed item in `test/parse.test.mjs` and prove it's neutralized. Then, in Chrome or Edge dev tools, try `document.body.innerHTML = '<b>x</b>'` and watch Trusted Types block it.
2. **Pin actions by commit SHA.** Replace `actions/checkout@v5` with its full commit hash (find it on the action's Releases page). This defends against a compromised tag, the attack used on `tj-actions/changed-files` in 2025.
3. **Scan your repo.** Enable **Settings → Code security → CodeQL** and **Secret scanning**, then read the results.
4. **Grade your headers.** Run the local server and inspect the response headers in dev tools. Compare them with what GitHub Pages sends, and research why Pages can't set `frame-ancestors`.
5. **Close the DNS rebinding gap.** `http.mjs` checks where a hostname points, then lets `fetch()` look it up again. Research why an attacker could change the answer in between, and how pinning the checked IP fixes it.
6. **Threat-model a new feature.** Before adding something (like AI summaries through an API key), write down what could go wrong: where the key is stored, and what happens if a feed contains a prompt injection.

## Project layout

```
feeds.json                   your sources
scripts/fetch-feeds.mjs      fetches, cleans and merges feeds
scripts/add-source.mjs       finds, validates and auto-sorts new sources
scripts/lib/http.mjs         SSRF-guarded, size-capped fetching
scripts/lib/parse.mjs        RSS / Atom / CISA KEV parsing and sanitizing
scripts/serve.mjs            local web server with security headers
site/                        the reader (plain HTML, CSS, JS; no build step)
site/theme.js                palette generator with contrast checks
test/                        parser and security tests (npm test)
.github/workflows/           scheduled fetch + deploy, and PR checks
```
