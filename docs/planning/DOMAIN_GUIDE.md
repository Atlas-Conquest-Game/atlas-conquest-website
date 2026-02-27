# Domain & URL Strategy Guide

> A practical guide to domain management, DNS, and URL architecture for Atlas Conquest.

---

## Domain Basics

### What You Own

- **Domain**: `atlas-conquest.com` (owned by Matan)
- **Registrar**: Wherever the domain was purchased (GoDaddy, Namecheap, Cloudflare, etc.)
- **Current hosting**: Wix (to be replaced by GitHub Pages)

The domain is just a name — it points wherever the DNS records tell it to. Changing hosts doesn't require buying a new domain, just updating where it points.

### DNS Record Types

| Record | Purpose | Example |
|--------|---------|---------|
| **A** | Points a domain to an IP address | `atlas-conquest.com` → `185.199.108.153` |
| **CNAME** | Points a subdomain to another domain | `www.atlas-conquest.com` → `username.github.io` |
| **AAAA** | Like A but for IPv6 | Less common, GitHub Pages doesn't require it |

**Key insight**: A records point to IP addresses (numbers). CNAME records point to other domain names (which then resolve to IPs). You can't have a CNAME on the root domain (`atlas-conquest.com`) at most registrars — that's why root domains use A records and subdomains use CNAMEs.

---

## GitHub Pages Setup

### How It Works

1. GitHub serves your site from the repo's configured branch/directory
2. You add a `CNAME` file to the repo containing your custom domain
3. You configure DNS at your registrar to point to GitHub's servers
4. GitHub handles HTTPS certificates automatically via Let's Encrypt

### DNS Configuration for GitHub Pages

At your domain registrar, set these records:

```
Type    Name    Value
A       @       185.199.108.153
A       @       185.199.109.153
A       @       185.199.110.153
A       @       185.199.111.153
CNAME   www     <username>.github.io
```

The `@` means the root domain (`atlas-conquest.com`).
The `www` CNAME ensures `www.atlas-conquest.com` also works.

### CNAME File

Add a file at `site/CNAME` (or repo root, depending on Pages config) containing just:
```
atlas-conquest.com
```

No `https://`, no trailing slash. Just the bare domain.

### After DNS Update

- **Propagation**: DNS changes take 5 minutes to 48 hours (usually < 1 hour)
- **HTTPS**: GitHub auto-provisions an SSL certificate; may take up to 24 hours
- **Verification**: Use `dig atlas-conquest.com` or `nslookup atlas-conquest.com` to check if DNS has propagated

---

## URL Architecture

### Paths vs Subdomains

| Approach | Example | When to Use |
|----------|---------|-------------|
| **Paths** | `atlas-conquest.com/decks` | Same codebase, same repo, simple |
| **Subdomains** | `decks.atlas-conquest.com` | Separate codebase/repo, separate deployment |

**For Atlas Conquest**: Use paths. Everything lives in one repo, one deployment. Subdomains add complexity (separate DNS records, separate GitHub repos/Pages configs, CORS issues) for no benefit at this scale.

### Query Params vs Path Segments

| Approach | Example | Requirement |
|----------|---------|-------------|
| **Query params** | `decks.html?code=ABC` | Works on static hosts (GitHub Pages) |
| **Path segments** | `decks/ABC` | Requires server-side routing (404 → index) |

GitHub Pages has no server-side routing. If someone visits `atlas-conquest.com/decks/ABC`, GitHub looks for a file at that path and returns 404. Query params (`?code=ABC`) work because the server serves `decks.html` and JavaScript reads `window.location.search`.

**Exception**: GitHub Pages does serve a custom `404.html` if you create one. Some single-page apps abuse this for client-side routing, but it's fragile and not recommended.

### Current URL Plan

```
/                    → Landing page (future)
/analytics.html      → Analytics dashboard (renamed from index.html, future)
/commanders.html     → Commander stats
/cards.html          → Card stats
/meta.html           → Meta trends
/mulligan.html       → Mulligan analysis
/decks.html          → Deck import/export
/decks.html?code=X   → Direct deck link
```

---

## Thinking About URL Hierarchy

A good URL structure follows these principles:

1. **Readable**: A human should guess what's at `/commanders.html`
2. **Flat**: Don't nest deeply (`/analytics/data/commanders/stats` is worse than `/commanders.html`)
3. **Stable**: Don't change URLs once shared — people bookmark and link to them
4. **Functional**: Each URL should work if copy-pasted (no JavaScript-only routing)

For a game community site, common top-level sections:
- `/` — Landing/home
- `/play` — Download/play the game
- `/decks` — Deck tools and community decks
- `/stats` or `/analytics` — Game data and analytics
- `/news` or `/blog` — Updates and patch notes
- `/community` — Forums, Discord links, social

You don't need all of these. Start with what you have, add sections as content justifies them.

---

## Migration Checklist

When ready to migrate from Wix to GitHub Pages:

- [ ] Ensure GitHub Pages is enabled in repo settings (source: branch + `/site` directory)
- [ ] Add `site/CNAME` file with `atlas-conquest.com`
- [ ] Matan updates DNS A records to GitHub Pages IPs
- [ ] Matan adds CNAME record for `www`
- [ ] Remove/disable custom domain in Wix (avoids conflicts)
- [ ] Wait for DNS propagation (check with `dig` or online tools like dnschecker.org)
- [ ] Verify HTTPS works (GitHub auto-provisions after DNS is valid)
- [ ] Cancel Wix subscription
- [ ] Test all pages load correctly at new domain
