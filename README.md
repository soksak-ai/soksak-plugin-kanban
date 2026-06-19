# soksak-plugin-kanban

A tree (outliner) based multi-view issue tracking soksak plugin.

## Core

A single node tree projected into seven views — **Outliner** (primary editing surface) · Kanban · Gantt · Timeline · Tree · Table · Calendar. The Kanban board is one of those projections.

- **Data structure = parentId + order only.** Infinite depth via parentId chains; sibling order via `order` within the same parent. Flat node list, no nested objects. All structural operations change only parentId/order.
- **Fractal focus zoom**: clicking any node reconstructs its children as the board/list. Board/Outliner/Tree share a focus scope (breadcrumb + up-to-parent navigation); Gantt/Timeline/Table/Calendar are global. Navigate up and down with the breadcrumb.
- **Outliner editing**: Tab to indent / Shift+Tab to outdent (one level up, children follow, absorbs trailing siblings) / Enter for new line / ⌫ to delete. Bullet click = zoom in, chip click = change status.
- **Follows platform theme**: uses soksak theme variables directly rather than an internal palette. Theme changes apply automatically.
- **Every operation is a command** — LLMs control the tree directly via CLI/MCP (see below).

## Commands (CLI / MCP)

Call as `sok plugin.soksak-plugin-kanban.<command>` or via MCP tool. The `node` argument accepts an id or key (WMP-NNN).

### Nodes (content)
| Command | Description |
|---|---|
| `node.add {parentId?, title, type?, status?, after?}` | Add a node (top-level when omitted) → `{nodeId, key}` |
| `node.edit {node, title?, body?, type?, status?, assignee?, priority?, points?, start?, due?}` | Edit fields (status change records history) |
| `node.remove {node, promoteChildren?}` | Delete (subtree or promote children) |
| `node.get {node, withChildren?}` · `node.list {parentId?, status?, type?, assignee?, search?}` | Query |

### Outline (tree position/order)
| Command | Description |
|---|---|
| `outline.indent {node}` / `outline.outdent {node}` | Tab / Shift+Tab |
| `outline.move {node, parentId, position?}` | Reparent + position (cycle rejected) |
| `outline.reorder {node, position}` | Reorder among siblings |

### Board (status)
| Command | Description |
|---|---|
| `board.move {node, status, position?}` | Change status (history) + position in column |
| `board.reorder {node, position}` · `board.sort {parentId?, by, dir?}` | Reorder / sort |

### Projection · focus · lifecycle
| Command | Description |
|---|---|
| `view.get {view, focus?, scope?, sortKey?, sortDir?}` | Query a view projection (board/outline/tree apply focus) |
| `focus.set {node?, view?}` | Move the open GUI to a different perspective or view |
| `stats {focus?}` · `timeline` · `column.list` · `breadcrumb {focus?}` | Derived queries |
| `seed {force?}` · `reset` | Load demo tree / delete everything |

## Development

```bash
npm install
npm run dev          # esbuild watch → main.js
npm test             # vitest — core invariants, golden outdent, 6 projections, commands
npm run typecheck

# Load into a running soksak app as a dev plugin
sok plugin.dev.load '{"path":"'"$PWD"'"}'
sok plugin.enable '{"id":"soksak-plugin-kanban"}'
node scripts/e2e/kanban.mjs   # socket E2E
```

## Architecture

Headless core (`src/core/`: tree · algebra · projections · seed — all pure) ↔ store (`src/store.ts`: app.data mirror + cross-window watch) ↔ commands (`src/commands.ts`) ↔ views (`src/view/`: React + Shadow DOM). Built with esbuild as a single ESM (`main.js`). Persistence uses the app.data `nodes` collection (indexes on parentId/order/status).
