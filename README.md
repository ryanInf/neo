# Neo

**Turn any web app into an API.** No official API needed. No browser automation.

Neo is a Chrome extension that passively captures every API call your browser makes, learns the patterns, and lets AI (or you) replay them directly.

## The Problem

AI agents operating web apps today have two options, both bad:

| Approach | Pain |
|----------|------|
| **Official APIs** | Most SaaS doesn't have one, or only exposes 10% of features |
| **Browser automation** | Screenshot → OCR → click. Slow, fragile, breaks on every UI change |

**Neo is the third way.** Every web app already has a complete internal API — the frontend calls it every time you click something. Neo captures those calls and makes them replayable.

## How It Works

```
Browse normally → Neo records all API traffic → Schema auto-generated → AI replays APIs directly
```

### 1. Capture (always-on)

The Chrome extension intercepts every `fetch()` and `XMLHttpRequest` — URLs, headers, request/response bodies, timing, even which DOM element triggered the call.

### 2. Learn

Run `neo-schema` on a domain to auto-generate its API map: endpoints, required auth headers, query parameters, response structure, error codes.

### 3. Execute

Run API calls inside the browser tab's context via Chrome DevTools Protocol. Cookies, CSRF tokens, session auth — all inherited automatically. No token management needed.

## Quick Start

```bash
git clone https://github.com/4ier/neo.git
cd neo && npm install && npm run build
```

Load the extension:
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extension/dist/`
4. Browse any website — Neo starts capturing immediately

## CLI Tools

All tools connect to Chrome via CDP (`localhost:9222`). Requires Chrome launched with `--remote-debugging-port=9222`.

### `neo-web` — Unified interface (recommended)

```bash
node tools/neo-web.cjs status                      # Capture stats by domain
node tools/neo-web.cjs read "github.com"            # Extract page content as text
node tools/neo-web.cjs api <url> --tab-url x.com    # API call with auto-detected auth
node tools/neo-web.cjs schema x.com                 # Generate API schema
node tools/neo-web.cjs eval "document.title" --tab-url github.com
node tools/neo-web.cjs open https://example.com     # Open URL in Chrome
node tools/neo-web.cjs captures github.com 20       # List recent captures
```

### Individual tools

| Tool | Purpose |
|------|---------|
| `neo-query.cjs` | Query captures: `count`, `domains`, `list [domain]`, `detail <id>`, `clear` |
| `neo-schema.cjs` | Generate API schema for a domain from captured traffic |
| `neo-exec.cjs` | Execute `fetch()` in browser context with `--auto-headers` and `--eval` |

## Architecture

```
┌─────────────────────────────────────┐
│  Chrome Extension (Manifest V3)      │
│                                      │
│  inject/interceptor.ts               │
│    ├─ Monkey-patches fetch & XHR     │
│    ├─ Records full request/response  │
│    └─ Correlates with DOM events     │
│                                      │
│  content/index.ts                    │
│    └─ Bridges page ↔ extension       │
│                                      │
│  background/index.ts                 │
│    ├─ Persists to IndexedDB (Dexie)  │
│    └─ Per-domain cap (500 entries)   │
│                                      │
│  popup/ — Capture viewer UI          │
└──────────────┬──────────────────────┘
               │ Chrome DevTools Protocol (port 9222)
┌──────────────┴──────────────────────┐
│  CLI Tools (Node.js)                 │
│  ├─ neo-query   → read captures      │
│  ├─ neo-schema  → analyze → schema   │
│  ├─ neo-exec    → execute in browser │
│  └─ neo-web     → unified interface  │
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│  AI Agent (OpenClaw / any LLM)       │
│  ├─ Reads schema to understand APIs  │
│  ├─ Plans multi-step operations      │
│  └─ Calls neo-exec to act            │
└──────────────────────────────────────┘
```

## Real-World Demo

Neo posted its own announcement tweet on X/Twitter:

1. Browsed X normally — Neo captured 655 API calls including the GraphQL `CreateTweet` mutation
2. Extracted the endpoint structure, auth headers (Bearer token + CSRF), and required feature flags
3. Called `CreateTweet` directly via CDP — tweet posted in <1 second, zero UI interaction

Then deleted it the same way via `DeleteTweet`. Full API control.

## Storage

- **Per-domain cap**: 500 captures max per domain, oldest auto-cleaned
- **Body truncation**: Response bodies capped at 100KB
- **Location**: Chrome's IndexedDB (`neo-capture-v01` database)
- **Schemas**: Exportable as JSON files for persistence across devices

## Smart Filtering

The interceptor ignores noise automatically:
- Static assets (images, fonts, CSS, JS bundles)
- Analytics/tracking (Google Analytics, Meta Pixel, Sentry, etc.)
- Browser internals (chrome-extension://, data:, blob:)
- Duplicate requests within 100ms window

## Tech Stack

- TypeScript, Vite (multi-entry build)
- Chrome Manifest V3
- Dexie.js (IndexedDB wrapper)
- Chrome DevTools Protocol for CLI ↔ browser communication
- No backend server, no external dependencies at runtime

## Roadmap

- [x] Extension: capture + store + popup viewer
- [x] CLI tools: query, schema, execute, unified interface
- [x] Storage management: per-domain caps, auto-cleanup
- [ ] Incremental schema updates, export/import
- [ ] Dual-channel: Neo API-first → browser-use fallback
- [ ] Multi-step workflow replay

## License

MIT
