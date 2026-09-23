# Signal: a personal newsfeed

Signal is a fast, private reader for the topics *you* choose. It starts empty: pick a ready-made topic or build your own, choose what you want to learn from it, and Signal gathers articles from that topic's sources and shows only what's related. You can save articles, tag them and write notes as you learn. It also doubles as a hands-on security project: every design choice here is a real defensive technique, explained in the code and in [Security design](#security-design) below.

- **No built-in topics:** everyone starts with a welcome screen. Ready-made starting points (Security, Music, Games, AI, web development, UX, science, space, photography, film, Linux & self-hosting, cooking) come with vetted sources and subtopics, or you can create your own. A new topic is live about 2 minutes after you submit it, and Signal opens Your interests for it as soon as it lands.
- **Concept tags:** each article is auto-tagged with its topic's vocabulary (phishing and ransomware for security, synthesis and mixing for music, anti-cheat for games, or the concepts you give a custom topic), so you can study by idea, not just by source.
- **CVE links:** every CVE ID mentioned links straight to the National Vulnerability Database. The Security starting point includes CISA's Known Exploited Vulnerabilities catalog.
- **Notebook:** write notes with learning prompts ("Key takeaway", "How I would detect this"), add your own tags, and review everything in one place.
- **Private by design:** your saves and notes never leave your browser. Export and import lets you back them up or move them.
- **Only what you care about:** pick what you want to learn per topic, and only articles related to those interests (1–3 steps out on a concept map) appear. **Home → For you** shows the best 3 per topic, each with a reason.
- **Your own topics:** create new topics in the app, with suggested sources or your own.
- **A profile page:** your goal, reading streak, top concepts and interests.
- **Fits any screen:** cards flow into as many readable columns as fit, from one on a phone to several on a wide monitor.
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

The site opens on a welcome screen, since there are no topics yet. Pick one and it goes live in about 2 minutes. From then on it refreshes itself every 3 hours.

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

## Your interests: only what's related

Open **Your interests** (sidebar, or press `i`). For each topic, pick the concepts you want to learn, add any specific words or names (like "OAuth" or "Eurorack"), and optionally include whole subtopics. Then choose **how closely related** articles must be:

| Setting | What counts as related to "identity" (example) |
|---|---|
| 1 · Close | identity, plus OAuth, MFA, SSO, passwords, passkeys, IAM |
| 2 · Related | …plus session hijacking, phishing, infostealers, API security… |
| 3 · Broad | …plus social engineering, initial access, ransomware… |

Only articles that match somewhere inside that circle appear, everywhere in the app: Home, topics, subtopics and search. Saved and Notebook always show everything you kept. A topic you haven't picked anything for stays empty and asks you to choose. Every card explains itself, for example "Picked for you: OAuth (via identity)". The **Only my interests** switch lets you peek at everything.

The circle comes from the **concept map** in `site/concept-graph.js`: each concept, the words that identify it, and links to related concepts. Edit it to teach Signal new connections. Nothing is deleted when filtering: widen the circle and hidden articles come back instantly.

### The For you page

**Home → For you** shows the 3 best matches per topic:

| Signal | Points |
|---|---|
| One of your words is in the title (in the summary) | +5 (+3) |
| A concept match: your concept, 1, 2 or 3 links away | +4, +3, +2, +1 |
| A subtopic you included | +2 |
| Concepts that also appear in things you've saved or noted | up to +2 |
| Freshness, fading over a few days | up to +3 |
| Already read | −4, so new picks rotate in |

It also avoids giving all three spots to one source. Switch to **Latest** for everything newest first. The scoring code is `relevance()` and `makeMatcher()` in `site/app.js`.

## Your profile

**You** in the sidebar (or press `5`) shows your name and avatar, a goal line, your reading streak and stats, the concepts you read most, and your interests at a glance. It's all stored in your browser and included in **Export backup**.

## Create a new topic

Click **+ New topic** in the sidebar (or a **Start with…** card on the welcome screen) and type a name. If Signal knows the subject (Security, Music, Games, AI, web development, UX, science, space, photography, film, Linux & self-hosting, cooking), it suggests verified sources, subtopics and concepts. Starting points live in `site/topic-catalog.js`; Security, Music and Games also bring their own concept maps. Untick what you don't want, and paste your own sources, one per line. Add `| Subtopic` to a line to choose where it goes. Then **Continue on GitHub → Create**. The same bot creates the topic, checks and files each source, and replies with what it added. The bot starts a rebuild right away (no waiting for the 3-hour schedule). Keep Signal open: it checks every 20 seconds, and when the topic appears it opens **Your interests** for it.

Suggestions come from `site/topic-catalog.js`. Add your own entries there.

## Accounts & sync

Sign in on any device and your interests, notes, saves, reading history, appearance and vibes follow you. Your data is **end-to-end encrypted**: your browser locks it with a key derived from your password before uploading, so the storage service only ever sees scrambled data. Sign-in supports **two-factor codes** from an authenticator app, and a **recovery key** backs you up if you forget your password.

It runs on a free [Supabase](https://supabase.com) project. Follow **[docs/ACCOUNTS.md](docs/ACCOUNTS.md)** to set it up (about 10 minutes). Until you do, everything still works locally.

## Change the look

Click **◐** in the toolbar, **Appearance** in the sidebar, or press `t`. Pick a palette, or choose any color for "Your color". Every palette is generated from a single hue, then adjusted until all text meets WCAG AA contrast (4.5:1), so even bright yellow stays readable. Your choice is saved in this browser and applies before the page draws, so there's no flash of the default theme.

### Background vibes

On desktop, an animation can fill the empty space around your articles, drawn in your theme colors. Choose one in **Appearance → Background vibe**. Cards show a still preview and come alive when you hover them.

**27 vibes in 7 moods:**

| Mood | Vibes |
|---|---|
| Calm | Aurora, Ocean, Lava lamp, Bubbles |
| Nature | Fireflies, Lo-fi rain, Snowfall, Sakura |
| Techy | Constellation (follows your cursor), Code rain, Radar, Circuit, Hex grid |
| Space | Starfield, Galaxy, Nebula |
| Music | Waveform, Vinyl, Spectrum |
| Retro | Synthwave, Plasma, Invaders, Blocks, DVD bounce |
| Trippy | Flow field, Kaleidoscope, Tunnel |

**Modes:**

- **Shuffle:** a new vibe every 5 minutes.
- **Match my topic:** changes with what you're reading. Security gets Radar, Circuit and friends; Music gets Vinyl, Spectrum and friends; Games gets Invaders, Synthwave and friends.

You can also set intensity, speed, and placement: **Right side** fades in away from what you read, or **Everywhere**. **Page width → Leave room** narrows the reading area on wide screens so the vibe has space. It's off on phones and pauses when the tab is hidden. If your system asks for reduced motion, it shows a still frame instead.

To add your own vibe, write an `init` and `draw` function in `site/ambient-more.js`, add it to `MORE_VIBES`, and add its id to the `vibe` list in `site/theme.js`.

## Customize your sources by hand

Edit `feeds.json`. It starts with no sections. Each topic you add becomes a **section**, each with **categories**, and each category has a list of feeds (`test/fixtures/feeds.sample.json` has a full example):

```json
{ "name": "Krebs on Security", "url": "https://krebsonsecurity.com/feed/", "site": "https://krebsonsecurity.com" }
```

Push the change and the site rebuilds. To add a new interest area, add another section object. The sidebar picks it up automatically.

Where to find feeds:

- **Most sites:** try `/feed`, `/rss` or `/feed.xml` at the end of the address.
- **YouTube channels:** use `https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID`. The channel ID starts with `UC`; find it on the channel page under **About → Share channel → Copy channel ID**.

If a feed breaks, the app's **Sources** panel shows which one failed and why.

A category can set its own `"maxAgeDays"` to keep articles longer than the default. The Music and Games starting points use this for their learning-focused subtopics, because those posts stay useful for months.

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
| Someone reading your synced data (including the storage provider) | End-to-end AES-256-GCM encryption in the browser. The server gets a PBKDF2-derived auth key, never your password, so it can't derive the data key | `site/crypto.js`, `docs/ACCOUNTS.md` |
| Stolen password | TOTP two-factor, enforced by a restrictive row-level-security policy (`aal2`), not just by the UI | `supabase/setup.sql` |
| One account reading or overwriting another's data | Row-level security scoped to `auth.uid()`, plus ciphertext bound to the user id with AES-GCM additional data | `setup.sql`, `crypto.js` |
| Strangers signing up on a public site | Sign-ups turned off after you register, and a minimum password length of 32 blocks weak passwords sent straight to the API | `docs/ACCOUNTS.md` |
| XSS stealing your encryption key | The device copy of the key is a non-extractable CryptoKey in IndexedDB, on top of CSP and Trusted Types | `site/sync.js` |
| Weak or breached passwords | A strength meter, plus a Have I Been Pwned check via k-anonymity (only 5 hash characters leave the device) | `crypto.js` |
| Two devices overwriting each other | Version-checked writes (optimistic concurrency) and a merge with tombstones for deletions | `sync.js`, `sync-merge.js` |
| Supply-chain risk from the auth library | supabase-js is vendored at a pinned version and served from this site, so there's no CDN at runtime | `site/vendor/` |
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
scripts/add-topic.mjs        creates a new topic from the New topic form
scripts/lib/http.mjs         SSRF-guarded, size-capped fetching
scripts/lib/parse.mjs        RSS / Atom / CISA KEV parsing and sanitizing
scripts/serve.mjs            local web server with security headers
site/                        the reader (plain HTML, CSS, JS; no build step)
site/theme.js                palette generator with contrast checks
site/concept-graph.js        the concept map behind "only related articles"
site/topic-catalog.js        suggested sources for new topics
site/ambient.js              background vibe engine + first 8 vibes
site/ambient-more.js         19 more vibes
site/crypto.js               end-to-end encryption (Web Crypto)
site/sync.js                 accounts, 2FA and encrypted sync (Supabase)
site/sync-merge.js           merging data between devices
site/account.js              sign-in, 2FA and recovery screens
site/config.js               your Supabase URL and publishable key
supabase/setup.sql           database table and row-level security
docs/ACCOUNTS.md             accounts setup guide
test/                        parser and security tests (npm test)
.github/workflows/           scheduled fetch + deploy, and PR checks
```
