# Neo — Turn any Web App into an AI-callable tool

A Chrome extension that passively learns any web app's API from network traffic, then lets AI replay them directly. No official API needed. No browser automation.

## How it works

```
You browse normally → Neo captures all API calls → AI learns the patterns → AI replays them
```

1. **Capture**: Always-on fetch/XHR interception. Every API call is recorded with full headers, body, and response.
2. **Learn**: Auto-generate API schema per domain — endpoints, parameters, auth headers, response structure.
3. **Execute**: Run API calls in browser context, inheriting your cookies and auth. Zero authentication setup.

## Why

AI agents operating web apps today have two bad options:
- **Official APIs**: Most SaaS has none, or only exposes 10% of functionality
- **Browser automation** (Playwright/browser-use): Screenshot → recognize → click. Slow, fragile, imprecise

Neo is the **third way**: operate at the API layer, but without needing official APIs. Every web app's frontend already figured out the APIs — Neo just learns from it.

## Quick Start

```bash
# Build the extension
npm install && npm run build

# Load in Chrome
# chrome://extensions → Developer mode → Load unpacked → select extension/dist/

# Query captured data
node tools/neo-query.cjs domains        # List captured domains
node tools/neo-query.cjs list x.com     # List API calls for a domain

# Generate API schema
node tools/neo-schema.cjs x.com         # Auto-analyze and output schema

# Execute API calls in browser context
node tools/neo-exec.cjs "https://x.com/i/api/..." --method POST --tab-url "x.com"
```

## Tools

| Tool | Purpose |
|------|---------|
| `neo-query` | Query captured API data (count, list, detail, clear) |
| `neo-schema` | Auto-generate API schema from captures |
| `neo-exec` | Execute API calls in browser tab context (inherits auth) |

## Architecture

```
┌─────────────────────────────────┐
│  Chrome Extension (always-on)    │
│  ├─ Intercept fetch/XHR         │
│  ├─ Store in IndexedDB          │
│  └─ Filter noise (static/analytics) │
└──────────────┬──────────────────┘
               │ Chrome DevTools Protocol
┌──────────────┴──────────────────┐
│  CLI Tools                       │
│  ├─ neo-query: read captures     │
│  ├─ neo-schema: analyze → schema │
│  └─ neo-exec: execute in browser │
└──────────────┬──────────────────┘
               │
┌──────────────┴──────────────────┐
│  AI Layer (OpenClaw / any LLM)   │
│  ├─ Understand API semantics     │
│  ├─ Plan multi-step operations   │
│  └─ Execute via neo-exec         │
└──────────────────────────────────┘
```

## Real-world demo

Neo was used to post its own announcement tweet on X — by capturing X's GraphQL API structure from normal browsing, then calling `CreateTweet` mutation directly. Zero UI automation.

## Tech Stack

- TypeScript + Vite
- Chrome Manifest V3
- Dexie.js (IndexedDB)
- Chrome DevTools Protocol for CLI tools

## Status

v0.2 — Core pipeline working (Capture → Schema → Execute). See [PRD.md](PRD.md) for full roadmap.
