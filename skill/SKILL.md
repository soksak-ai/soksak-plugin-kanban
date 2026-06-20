---
name: soksak-kanban
description: Use when managing tasks/issues as a tree inside soksak — drive the kanban plugin entirely by CLI/MCP commands (`sok plugin.soksak-plugin-kanban.*`) to add/edit/move nodes, indent/outdent (re-parent) in the outline, set status for board columns, and project the one tree into board/outline/timeline/column views. Headless: works without opening the GUI. 칸반, 이슈/할일 트리, 아웃라이너, 들여쓰기/내어쓰기, 노드 이동, 상태 변경, 보드도 여기.
---

# soksak kanban — one tree, many views

The kanban plugin is **an outliner, not a flat board**. There is exactly one tree of nodes; every node has a `parentId` and an `order` among its siblings. A status field (`todo`/`doing`/`done`…) is just a node field — the board view groups by it, but the data is always the tree. Board, outline, timeline, and column views are **projections of the same tree**; mutate the tree and every view reflects it. Drive it all by command — a view, if open, only renders.

## Discover first

Names/params evolve — never guess. List the live surface:

```
sok commands | grep plugin.soksak-plugin-kanban
```

`node.list` and `view.get` read the tree; `stats` summarizes. `node.get node=<id> withChildren=true` returns a subtree.

## Mental model (read this before mutating)

- **A node's position = `parentId` + `order`.** Nothing else. Siblings are ordered by `order`; depth comes from the parent chain.
- **`outline.indent` = re-parent under the previous sibling.** `outline.outdent` = move up to the grandparent, after its parent. This is the single source of structure — "indent" is not cosmetic, it changes the tree.
- **`outline.move node=<id> parentId=<id> position=<n>`** re-parents explicitly; **`outline.reorder`** changes order among current siblings only.
- **`board.move node=<id> status=<col> position=<n>`** sets the status field (which board column it lands in) and its order within that column — the tree parent is unchanged.
- **`focus.set node=<id>`** zooms into a subtree (fractal focus): subsequent views scope to that node's descendants. `focus.set` with no node resets to root. `breadcrumb` shows the current focus path.

## Core workflow (build from a prompt)

```
# add a top-level epic, then children under it
sok plugin.soksak-plugin-kanban.node.add title='Auth' type=epic status=todo
sok plugin.soksak-plugin-kanban.node.add title='Login form' parentId=<epicId> status=todo points=3
# nest an existing node one level deeper (under its previous sibling)
sok plugin.soksak-plugin-kanban.outline.indent node=<id>
# move a card across board columns
sok plugin.soksak-plugin-kanban.board.move node=<id> status=doing position=0
```

Read back with `view.get view=board` (or `outline`/`timeline`) and `node.list parentId=<id> status=doing search=<text>`.

## Conventions

- Every command returns `{ok:true,…}` or `{ok:false,error}`. No throws — branch on `ok`.
- Address nodes by id (from `node.add`/`node.list`). `node.remove promoteChildren=true` lifts children to the grandparent instead of deleting them.
- It is **headless-complete** — you never need the GUI. The tree is the single source of truth; views only project it.
