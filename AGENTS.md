# AGENTS.md — Neo v2 UI Layer

## Project
Neo is a CLI tool (`tools/neo.cjs`) that turns web apps into AI-callable tools. 
Currently it captures APIs passively via a Chrome extension and replays them.

We're adding a **UI operation layer** — snapshot, click, fill, screenshot — via pure CDP protocol.
This makes Neo a superset of agent-browser (Vercel's tool).

## Architecture
- Single file: `tools/neo.cjs` (3643 lines currently)
- Tests: `tools/neo.test.cjs` (hand-written assert, no frameworks)
- Chrome extension: `extension/` (DO NOT modify)
- The CLI connects to Chrome/Electron via CDP (port 9222 by default)

## Coding Standards
- **Zero new dependencies** — only use `ws` (already installed) + Node.js builtins
- **Tests required** — every new function gets unit tests in `neo.test.cjs`
- **Small commits** — one feature per commit, descriptive Chinese message
- **Backward compatible** — existing commands must not change behavior

## Upgrade Plan
See `UPGRADE-v2.md` for the full design. Implement in this order:

### Phase 1: Session Management + Connect
1. Session state management (read/write `/tmp/neo-sessions.json`)
2. `neo connect [port]` — connect to CDP, store session
3. `neo discover` — scan ports 9222-9299 for CDP targets
4. `neo sessions` — list active sessions
5. `--session <name>` global flag support

### Phase 2: Snapshot + @ref System  
6. `neo snapshot [-i] [-C] [--json]` — Accessibility.getFullAXTree → a11y tree with @ref numbering
7. @ref storage in session state (ref → backendDOMNodeId mapping)

### Phase 3: UI Interaction
8. `neo click @ref` — resolveNode → getBoxModel → dispatchMouseEvent
9. `neo fill @ref "text"` — focus → selectAll → delete → insertText
10. `neo type @ref "text"` — focus → insertText (no clear)
11. `neo press <key>` — dispatchKeyEvent
12. `neo hover @ref` — dispatchMouseEvent(mouseMoved)
13. `neo scroll <dir> [px]` — dispatchMouseEvent(mouseWheel)
14. `neo select @ref "value"` — DOM.setAttributeValue or JS eval

### Phase 4: Screenshot + Info
15. `neo screenshot [path] [--full] [--annotate]` — Page.captureScreenshot
16. `neo get text @ref` / `neo get url` / `neo get title`
17. `neo wait @ref` / `neo wait --load networkidle` / `neo wait <ms>`

### Phase 5: Electron + Inject
18. `neo launch <app> [--port N]` — launch Electron with CDP flag
19. `neo connect --electron <app-name>` — find running Electron CDP
20. `neo inject [--persist]` — inject capture script via CDP (for Electron apps without extension)
21. `neo tab` / `neo tab <index>` / `neo tab --url <pattern>`

## CDP Protocol Reference

### Snapshot
```
Accessibility.enable → Accessibility.getFullAXTree
Filter: role ∈ {button, textbox, link, combobox, checkbox, menuitem, tab, radio, slider, switch, searchbox, spinbutton, option, treeitem}
```

### Click
```
DOM.resolveNode({backendNodeId}) → objectId
DOM.getBoxModel({objectId}) → content quad → center (x, y)
Input.dispatchMouseEvent({type:'mousePressed', x, y, button:'left', clickCount:1})
Input.dispatchMouseEvent({type:'mouseReleased', x, y, button:'left', clickCount:1})
```

### Fill
```
DOM.focus({backendNodeId})
Input.dispatchKeyEvent({type:'keyDown', key:'a', code:'KeyA', modifiers:2}) // Ctrl+A
Input.dispatchKeyEvent({type:'keyUp', key:'a', code:'KeyA', modifiers:2})
Input.dispatchKeyEvent({type:'keyDown', key:'Backspace', code:'Backspace'})
Input.dispatchKeyEvent({type:'keyUp', key:'Backspace', code:'Backspace'})
Input.insertText({text})
```

### Screenshot
```
Page.captureScreenshot({format:'png', captureBeyondViewport:true}) // --full
```

### Key mapping for press
```
Enter → {key:'Enter', code:'Enter'}
Tab → {key:'Tab', code:'Tab'}  
Escape → {key:'Escape', code:'Escape'}
Backspace → {key:'Backspace', code:'Backspace'}
Ctrl+a → modifiers:2 + key:'a'
```

## Test with Feishu
Feishu desktop client (Electron) will be used as the primary test target.
- Linux binary: `/opt/bytedance/feishu/feishu` or `feishu` if in PATH
- Launch: `feishu --remote-debugging-port=9225`
