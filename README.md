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

All commands go through a single CLI: `node tools/neo.cjs <command>`.

Requires Chrome launched with `--remote-debugging-port=9222`.

Single CLI, subcommand-style (inspired by [notion-cli](https://github.com/4ier/notion-cli)):

```bash
# Overview
node tools/neo.cjs status

# Captured traffic
node tools/neo.cjs capture summary                    # Quick overview
node tools/neo.cjs capture list github.com --limit 10  # Shows IDs for replay/detail
node tools/neo.cjs capture list --since 1h             # Time-filtered
node tools/neo.cjs capture domains
node tools/neo.cjs capture search "CreateTweet" --method POST
node tools/neo.cjs capture watch x.com          # Live tail (like tail -f)
node tools/neo.cjs capture stats x.com           # Method/status/timing breakdown
node tools/neo.cjs capture export x.com --since 2h > x-captures.json
node tools/neo.cjs capture export x.com --format har > x.har  # HAR 1.2 for Postman/devtools
node tools/neo.cjs capture import x-captures.json     # Import captures from file
node tools/neo.cjs capture prune --older-than 7d       # Delete old captures
node tools/neo.cjs capture gc x.com              # Smart dedup (keep one per pattern)
node tools/neo.cjs capture gc x.com --dry-run    # Preview what would be removed

# Replay a captured API call
node tools/neo.cjs replay <capture-id> --tab x.com

# API schema (auto-saves to local knowledge base)
node tools/neo.cjs schema list                   # List all known schemas
node tools/neo.cjs schema generate x.com         # Generate from captures
node tools/neo.cjs schema generate --all         # Batch generate for all domains
node tools/neo.cjs schema show x.com             # Human-readable summary
node tools/neo.cjs schema show x.com --json      # Raw JSON
node tools/neo.cjs schema openapi x.com          # Export as OpenAPI 3.0 spec
node tools/neo.cjs schema diff x.com             # Show changes from previous version
node tools/neo.cjs schema coverage               # Which domains have schemas vs just captures

# Execute API calls (auth headers auto-detected from captures)
node tools/neo.cjs exec "https://api.example.com/data" --method POST --body '{"key":"value"}' --tab example.com

# Smart API call (schema lookup + auto-auth + auto-tab)
node tools/neo.cjs api x.com badge_count           # Zero-config authenticated call
node tools/neo.cjs api x.com HomeTimeline           # Finds URL, auth, tab automatically
node tools/neo.cjs api github.com notifications

# Analyze API patterns
node tools/neo.cjs flows x.com                      # Discover call sequence patterns
node tools/neo.cjs flows x.com --window 5000        # Custom time window
node tools/neo.cjs suggest x.com                    # AI capability analysis for domain

# Mock server
node tools/neo.cjs mock x.com                       # Start mock server from schema
node tools/neo.cjs mock x.com --port 8080 --latency 200

# Page interaction
node tools/neo.cjs read github.com
node tools/neo.cjs eval "document.title" --tab github.com
node tools/neo.cjs open https://example.com

# WebSocket Bridge (real-time streaming)
node tools/neo.cjs bridge                    # Start bridge, see captures live
node tools/neo.cjs bridge --json             # NDJSON output for piping
node tools/neo.cjs bridge --json | jq .      # Structured processing
node tools/neo.cjs bridge --interactive      # Send commands to extension

# Diagnostics
node tools/neo.cjs doctor                    # Check Chrome, extension, schemas, bridge
node tools/neo.cjs reload                    # Reload the extension from CLI
node tools/neo.cjs tabs                      # List open Chrome tabs
node tools/neo.cjs tabs github               # Filter tabs by URL/title
```

The bridge creates a persistent WebSocket channel between the extension and CLI. The extension auto-connects to `ws://127.0.0.1:9234` and streams every capture in real-time. In interactive mode, you can query the extension directly: `ping`, `status`, `capture.count`, `capture.list`, `capture.domains`, `capture.search`, `capture.clear`.

## Architecture

```
┌─────────────────────────────────────┐
│  Chrome Extension (Manifest V3)      │
│                                      │
│  inject/interceptor.ts               │
│    ├─ Monkey-patches fetch & XHR     │
│    ├─ Intercepts WebSocket traffic   │
│    ├─ Intercepts EventSource/SSE     │
│    ├─ Tracks DOM triggers (click →   │
│    │   API correlation)              │
│    ├─ Records full request/response  │
│    └─ Correlates with DOM events     │
│                                      │
│  content/index.ts                    │
│    └─ Bridges page ↔ extension       │
│                                      │
│  background/index.ts                 │
│    ├─ Persists to IndexedDB (Dexie)  │
│    ├─ Per-domain cap (500 entries)   │
│    └─ WebSocket Bridge client        │
│       (auto-connects to bridge)      │
│                                      │
│  popup/ — Capture viewer UI          │
└──────────────┬──────────────────────┘
               │ Chrome DevTools Protocol (port 9222)
┌──────────────┴──────────────────────┐
│  CLI: tools/neo.cjs (Node.js)        │
│  ├─ neo capture → read/export/search  │
│  ├─ neo schema  → analyze → schema   │
│  ├─ neo exec    → execute in browser │
│  ├─ neo api     → smart schema call  │
│  ├─ neo flows   → sequence analysis  │
│  ├─ neo replay  → re-run captured    │
│  ├─ neo eval    → run JS in tab      │
│  └─ neo read    → extract page text  │
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

### Post a tweet via captured API

```bash
# 1. Browse X normally — Neo captures GraphQL mutations
neo schema show api.x.com

# 2. Find the CreateTweet endpoint
neo capture search "CreateTweet" --method POST

# 3. Replay with the original auth (cookies inherited automatically)
neo replay abc123 --tab x.com

# 4. Or craft a new call with auto-detected auth headers
neo exec "https://x.com/i/api/graphql/.../CreateTweet" \
  --method POST --auto-headers \
  --body '{"variables":{"tweet_text":"Hello from Neo!"},...}'
```

### Understand what a button does

Neo's trigger tracking maps UI interactions to API calls:

```bash
neo schema show github.com
# Output includes:
#   POST /repos/:owner/:repo/star  (3x, 280ms)
#     ← click button.js-social-form "Star" (3x)
```

### Live-monitor API traffic

```bash
neo capture watch api.openai.com
# 14:23:01  POST 200 /v1/chat/completions (1230ms)
# 14:23:05  SSE_MSG 200 /v1/chat/completions (0ms) [sse]
```

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
- **Rate limiting**: Max 3 captures per URL pattern per minute (prevents polling endpoint bloat)

## Tech Stack

- TypeScript, Vite (multi-entry build)
- Chrome Manifest V3
- Dexie.js (IndexedDB wrapper)
- Chrome DevTools Protocol for CLI ↔ browser communication
- No backend server, no external dependencies at runtime

## Roadmap

- [x] Extension: capture + store + popup viewer
- [x] CLI tools: unified `neo` CLI with subcommands
- [x] Storage management: per-domain caps, auto-cleanup, rate limiting
- [x] Schema: browser-side analysis, URL normalization, body structure extraction
- [x] Smart filtering: static assets, analytics, duplicate suppression
- [x] WebSocket capture (open/close/send/recv with throttling)
- [x] Capture replay: `neo replay <id>` re-executes captured calls
- [x] Import/export: cross-device capture migration
- [x] Smart API call: `neo api` with schema lookup + auto-auth
- [x] Flow analysis: `neo flows` discovers API call sequences
- [x] Schema versioning with diff detection and history
- [x] Diagnostics: `neo doctor` for setup verification
- [x] Body field variability: schema tracks constant vs variable request fields
- [x] Pure function extraction + 47 unit tests + CI
- [x] HAR 1.2 export format for Postman/Charles/devtools interop
- [x] OpenAPI 3.0 spec generation from captured schemas
- [x] Batch schema generation (`--all`)
- [ ] Dual-channel: Neo API-first → browser-use fallback
- [ ] Multi-step workflow replay

## License

MIT
