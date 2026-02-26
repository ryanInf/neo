# Neo — Web App API Discovery & Execution

## What
Chrome extension that passively captures web app APIs + CLI to query/execute them.
Captures fetch, XHR, WebSocket, and EventSource/SSE traffic with DOM trigger correlation.

## When to use
- Before browser-use: check if Neo has API knowledge for the domain
- User asks to interact with any website (GitHub, X, SaaS)
- User asks what APIs a website uses
- Replaying or debugging API calls

## CLI: `node ~/clawd/neo/neo.cjs`

```bash
# Overview
neo status                              # Domains + capture counts

# Capture management
neo capture summary                     # Quick overview (best for AI agents)
neo capture list [domain] [--limit N] [--since 1h]  # Recent captures (shows IDs)
neo capture search <query> [--method POST] [--status 200] [--limit N]
                                        # Search by URL pattern
neo capture count                       # Total count
neo capture domains                     # Domains with counts
neo capture detail <id>                 # Full capture details
neo capture stats <domain>              # Method/status/timing breakdown
neo capture watch [domain]              # Live tail (like tail -f)
neo capture clear [domain]              # Clear captures
neo capture export [domain] [--since 1h] [--format har]  # Export as JSON or HAR 1.2
neo capture import <file>               # Import from JSON (cross-device)
neo capture prune [--older-than 7d]     # Delete old captures
neo capture gc [domain] [--dry-run]     # Smart dedup: keep one per unique pattern

# Schema (API knowledge base)
neo schema generate <domain>            # Generate + save schema (with diff + versioning)
neo schema generate --all               # Batch generate for all domains with captures
neo schema show <domain>                # Human-readable with triggers
neo schema show <domain> --json         # Raw JSON
neo schema list                         # All known schemas (with versions)
neo schema search <query>               # Search all schemas by endpoint/path
neo schema coverage                     # Show schema vs capture coverage
neo schema openapi <domain>             # Export as OpenAPI 3.0 spec

# Execute
neo exec <url> [--method POST] [--header "K:V"] [--body "{}"] [--tab pattern] [--auto-headers]
                                        # Execute fetch in browser (auto auth)
neo api <domain> <search-term> [--body '{}']  # Smart API call: schema lookup + auto-auth + auto-tab
neo replay <id> [--tab pattern]         # Replay a captured API call

# Analyze
neo flows <domain> [--window <ms>] [--min-count <n>]
                                        # Discover API call sequence patterns
neo deps <domain> [--window <ms>] [--min-confidence <n>]
                                        # Discover API dependency chains (response→request data flow)

# Page interaction
neo eval "<js>" --tab <pattern>         # Run JS in page context
neo open <url>                          # Open URL in Chrome
neo read <tab-pattern>                  # Extract readable page text

# Diagnostics
neo doctor                              # Check Chrome, extension, schemas, bridge
neo reload                              # Reload the Neo extension
neo tabs [filter]                       # List open Chrome tabs
neo mock <domain> [--port N] [--latency ms]  # Mock server from schema
neo suggest <domain>                    # Suggest AI capabilities for a domain
neo export-skill <domain>               # Generate agent-ready API reference (Markdown)
neo version                             # Show version
```

## Workflow: Find → Understand → Execute

```
1. neo capture search "CreateTweet"     # Find the API call
2. neo capture detail <id>              # Inspect full request/response
3. neo replay <id>                      # Replay it, or:
   neo api x.com CreateTweet --body '{}'  # Smart call (finds URL + auth automatically)
   neo exec <url> --auto-headers        # Execute with custom params
```

## Smart API Call (neo api)

```bash
neo api x.com badge_count               # GET badge count — zero config
neo api x.com HomeTimeline              # Finds endpoint, reconstructs URL, auto-auth
neo api github.com notifications        # Works across any domain with schema
neo api x.com CreateTweet --body '{"variables":{"tweet_text":"hello"}}'
```

`neo api` = schema lookup + capture URL reconstruction + auto-auth headers + auto tab selection.
Requires: captures exist + schema generated for the domain.

## Schema with Trigger Mapping & Field Variability

`neo schema show <domain>` shows which UI elements trigger which APIs and which body fields vary:

```
POST /i/api/graphql/:hash/CreateTweet  (12x, 340ms) [auth: x-csrf-token] body:{variables, features} [varies: variables]
  ← click button.tweet-btn "Post" (8x)
```

This maps: user intent → UI element → API call → parameterizable fields.

## Schema Knowledge Base

Schemas at `~/clawd/skills/neo/schemas/<domain>.json` — local API knowledge.

Before calling an API, check schema: `neo schema show <domain>`
No schema? Generate: `neo schema generate <domain>` (requires captures)

Schemas are local-only, never in git. Personal browsing knowledge.

## Decision: Neo vs Browser-Use

1. `neo status` — does Neo have captures for this domain?
2. **Yes** → `neo exec` or `neo replay` (fast, precise)
3. **No** → `neo open <url>`, browse, captures accumulate, then use Neo
4. **Fallback** → browser-use for complex UI interactions

## WebSocket Bridge (real-time streaming)

```bash
neo bridge                              # Start bridge on ws://127.0.0.1:9234
neo bridge 9234 --json                  # NDJSON output (pipe to jq, etc.)
neo bridge --quiet                      # No stderr status messages
neo bridge --interactive                # Type commands to query extension
```

The extension auto-connects to the bridge. Features:
- **Real-time capture streaming**: see every API call as it happens
- **Bidirectional commands**: ping, status, capture.count, capture.list
- **NDJSON mode**: `neo bridge --json | jq .` for structured processing
- **Auto-reconnect**: extension reconnects if bridge restarts

Use bridge for long-running monitoring. Use CLI commands for one-off queries.

## Key facts
- Extension ID: `ikikhldfkbfmcbandaagjomhchlehjap`
- Extension dist: `~/neo/extension-dist`
- Source: `/tmp/neo/` (git repo at github.com/4ier/neo)
- API calls execute in browser context — cookies/auth inherited automatically
- Chrome must run with CDP on port 9222
- Per-domain capture cap: 500 entries, auto-cleanup
- Captures: fetch + XHR + WebSocket + EventSource/SSE
- Trigger tracking: click/submit → API call correlation (2s window)
