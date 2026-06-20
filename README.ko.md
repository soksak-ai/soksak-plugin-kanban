# soksak-plugin-kanban

트리(아웃라이너) 기반 멀티뷰 이슈 추적 soksak 플러그인.

## 핵심

하나의 노드 트리를 일곱 뷰로 투영한다 — **Outliner**(기본·편집 본진) · Kanban · Gantt · Timeline · Tree · Table · Calendar. 칸반 보드는 그중 한 투영이다.

- **데이터 구조 = parentId + order 둘로만.** 무한 깊이는 parentId 사슬, 순서는 같은 부모 안 order. 평면 노드 리스트, 중첩 객체 없음. 모든 구조 연산은 parentId/order만 바꾼다.
- **프랙탈 focus 줌**: 어떤 노드든 클릭하면 그 자식들이 보드/리스트로 재구성된다. Board/Outliner/Tree 는 focus 스코프(브레드크럼·↑상위로 공유), Gantt/Timeline/Table/Calendar 는 전역. 브레드크럼으로 오르내림.
- **아웃라이너 편집**: Tab 들여쓰기 / Shift+Tab 내어쓰기(한 단계 위로, 자식 동반, 뒤 형제 흡수) / Enter 새 줄 / ⌫ 삭제. 불릿 클릭=줌인, 칩 클릭=상태 변경.
- **플랫폼 테마 추종**: 자체 팔레트 없이 soksak 테마 변수를 그대로 사용. 테마 변경 시 자동 반영.
- **모든 조작이 command** — CLI/MCP 로 LLM 이 직접 트리를 제어한다(아래 참조).

## 명령 (CLI / MCP)

`sok plugin.soksak-plugin-kanban.<command>` 또는 MCP 도구로 호출. node 인자는 id 또는 key(WMP-NNN).

### 노드(내용)
| 명령 | 설명 |
|---|---|
| `node.add {parentId?, title, type?, status?, after?}` | 노드 추가(생략 시 최상위) → `{nodeId, key}` |
| `node.edit {node, title?, body?, type?, status?, assignee?, priority?, points?, start?, due?}` | 필드 수정(status 변경 시 history) |
| `node.remove {node, promoteChildren?}` | 삭제(서브트리 또는 자식 승격) |
| `node.get {node, withChildren?}` · `node.list {parentId?, status?, type?, assignee?, search?}` | 조회 |

### 아웃라인(트리 위치/순서)
| 명령 | 설명 |
|---|---|
| `outline.indent {node}` / `outline.outdent {node}` | Tab / Shift+Tab |
| `outline.move {node, parentId, position?}` | reparent + 위치(순환 거부) |
| `outline.reorder {node, position}` | 형제 중 순서 변경 |

### 보드(상태)
| 명령 | 설명 |
|---|---|
| `board.move {node, status, position?}` | 상태 변경(history) + 칸 내 위치 |
| `board.reorder {node, position}` · `board.sort {parentId?, by, dir?}` | 순서/정렬 |

### 투영 · focus · 수명주기
| 명령 | 설명 |
|---|---|
| `view.get {view, focus?, scope?, sortKey?, sortDir?}` | 뷰 투영 조회(board/outline/tree 는 focus 적용) |
| `focus.set {node?, view?}` | 열린 GUI 의 관점·뷰 이동 |
| `stats {focus?}` · `timeline` · `column.list` · `breadcrumb {focus?}` | 파생 조회 |
| `seed {force?}` · `reset` | 데모 트리 적재 / 전체 삭제 |

## 개발

```bash
npm install
npm run dev          # esbuild watch → main.js
npm test             # vitest — 코어 불변식·골든 outdent·6투영·명령
npm run typecheck

# 실행 중인 soksak 앱에 dev 적재
sok plugin.dev.load '{"path":"'"$PWD"'"}'
sok plugin.enable '{"id":"soksak-plugin-kanban"}'
node scripts/e2e/kanban.mjs   # 소켓 E2E
```

## 아키텍처

헤드리스 코어(`src/core/`: tree·algebra·projections·seed — 전부 순수) ↔ 스토어(`src/store.ts`: app.data 미러 + cross-window watch) ↔ 명령(`src/commands.ts`) ↔ 뷰(`src/view/`: React + Shadow DOM). 빌드는 esbuild 단일 ESM(`main.js`). 영속은 app.data `nodes` 컬렉션(parentId/order/status 인덱스).
