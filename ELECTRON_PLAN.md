# Neo Electron Support — Implementation Plan

## Goal
Make `neo capture list/detail/stats/search`, `neo schema generate`, `neo exec`, `neo replay` work for Electron apps that don't have the Chrome extension installed.

## Current Architecture
1. Chrome extension's **inject/interceptor.ts** monkey-patches fetch/XHR in page context
2. Intercepted calls → `window.postMessage({ type: 'neo:capture_request', payload })` 
3. Extension's **content script** listens for postMessage → forwards to **background/service worker**
4. Background stores in **IndexedDB** (`neo-capture-v01` / `capturedRequests`)
5. CLI reads from IndexedDB via `Runtime.evaluate` in the extension's service worker context

## Problem
In Electron apps, steps 3-4 don't exist (no extension). Data posted via postMessage goes nowhere.

## Solution

### A. Inject script enhancement (`buildInjectScript` in neo.cjs)
In the wrapper that `buildInjectScript()` creates, add a `message` event listener that catches `neo:capture_request` messages and pushes them to `globalThis.__NEO_CAPTURES__[]`. This is already partially there (`__NEO_CAPTURES__` array exists) but it's not populated by the interceptor's postMessage flow.

Add after the inject script execution:
```js
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'neo:capture_request' && e.data.payload) {
    globalThis.__NEO_CAPTURES__.push(e.data.payload);
    // Cap at 500 per the existing design
    if (globalThis.__NEO_CAPTURES__.length > 500) {
      globalThis.__NEO_CAPTURES__.shift();
    }
  }
});
```

### B. CLI capture commands: session-aware fallback
Currently all capture commands read from IndexedDB via the extension service worker. Add a fallback path:

1. Add a helper function `isSessionMode(sessionName)` — returns true if there's an active session with a pageWsUrl but no extension service worker available
2. Add `getSessionCaptures(sessionName, filters)` — reads `__NEO_CAPTURES__` from the page via `Runtime.evaluate`
3. In each capture command handler, check: if session mode → use `getSessionCaptures()`, else → use existing extension IndexedDB path

Commands to update:
- `capture list` 
- `capture count`
- `capture domains`
- `capture detail <id>`
- `capture stats <domain>`
- `capture search <query>`
- `capture clear`
- `capture export`

### C. Schema generate & exec/replay
- `schema generate`: Already works with capture data arrays. Just feed it session captures instead of extension captures.
- `exec`: Already works via CDP `Runtime.evaluate` in page context — should work as-is with session mode.
- `replay`: Same as exec, needs the original capture data which can come from session captures.

### D. Testing
1. Build extension: `npm run build` (needed for inject.js)
2. Find/create a simple Electron app on the system
3. Test flow: `neo launch <app>` or `neo connect <port>` → `neo inject` → browse → `neo capture list` → `neo schema generate`

## Files to modify
- `tools/neo.cjs`: 
  - `buildInjectScript()` — add postMessage listener
  - Add `getSessionCaptures()` helper
  - Update capture command handlers with session fallback
  - Update `findExtensionWs()` to not throw when in session mode

## Key constraint
- Don't break existing Chrome extension flow
- Session mode is opt-in (only when user explicitly does `neo connect` + `neo inject`)
- Keep the 500 capture cap
- Captures in session mode are in-memory only (lost on page reload unless `--persist` was used)
