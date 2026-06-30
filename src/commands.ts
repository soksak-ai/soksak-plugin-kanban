// 명령 카탈로그 — 전부 같은 트리(store)를 조작. app.commands.register 로 CLI/MCP 자동노출.
// node(내용) / outline(트리 위치) / board(상태) / focus(줌) / view(투영) / 수명주기.
import type { Node, NodeType, StatusId, PriorityId, ViewId, Badge } from "@/types";
import type { KanbanStore } from "@/store";
import { TODAY, RANGE_END, STATUSES, STATUS_IDS } from "@/refs";
import { byId, childrenOf, descendantIds } from "@/core/tree";
import {
  insertNode,
  indent,
  outdent,
  moveNode,
  reorder,
  removeNode,
  boardMove,
  sortChildren,
  type SortKey,
} from "@/core/algebra";
import { projectView, stats, toTimeline, breadcrumb, shortTitle } from "@/core/projections";
import { seedNodes } from "@/core/seed";

interface ParamSpec {
  type: "string" | "number" | "boolean" | "json" | "string[]" | "number[]";
  description: string;
  required?: boolean;
  enum?: readonly string[];
  default?: unknown;
}
interface CommandSpec {
  description: string;
  triggers?: { ko?: string };
  params?: Record<string, ParamSpec>;
  returns?: string;
  danger?: "destructive" | "inject";
  examples?: readonly string[];
  handler: (params: Record<string, unknown>, ctx?: unknown) => Promise<object> | object;
}
interface CommandsApi {
  register(name: string, spec: CommandSpec): { dispose(): void } | (() => void);
}
interface AppCtx {
  app: {
    commands?: CommandsApi;
    bus?: { emit?: (topic: string, payload: unknown) => void };
  };
  subscriptions: Array<{ dispose(): void } | (() => void)>;
}

type Resolved = { ok: true; node: Node } | { ok: false; error: string; did_you_mean?: string[]; candidates?: string[] };

/** id 또는 key 로 노드 해석. 모호/미존재 시 후보 제시. */
function resolve(nodes: Node[], ref: unknown): Resolved {
  const s = String(ref ?? "");
  const direct = byId(nodes, s);
  if (direct) return { ok: true, node: direct };
  const byKey = nodes.filter((n) => n.key.toLowerCase() === s.toLowerCase());
  if (byKey.length === 1) return { ok: true, node: byKey[0] };
  if (byKey.length > 1) return { ok: false, error: `ambiguous key: '${s}'`, candidates: byKey.map((n) => n.id) };
  const fuzzy = nodes
    .filter((n) => n.key.toLowerCase().includes(s.toLowerCase()) || n.title.toLowerCase().includes(s.toLowerCase()))
    .slice(0, 5)
    .map((n) => n.key);
  return { ok: false, error: `node not found: '${s}'`, did_you_mean: fuzzy };
}

/** parentId 파라미터(생략/빈문자/'root'/null → 최상위) 해석. */
function resolveParent(nodes: Node[], ref: unknown): { ok: true; id: string | null } | { ok: false; error: string } {
  if (ref == null || ref === "" || ref === "root" || ref === "null") return { ok: true, id: null };
  const r = resolve(nodes, ref);
  return r.ok ? { ok: true, id: r.node.id } : { ok: false, error: r.error };
}

const compact = (n: Node) => ({ id: n.id, key: n.key, title: n.title, description: n.description, type: n.type, status: n.status, parentId: n.parentId, order: n.order, assignee: n.assignee, priority: n.priority, points: n.points, due: n.due, blockedBy: n.blockedBy ?? [], locked: n.locked === true, badge: n.badge, isDraft: n.isDraft, parentDraftId: n.parentDraftId, kind: n.kind });
// 워크플로 파생 노드는 사람의 드래그 이동·트리 분리·삭제 금지(스케줄러 충돌·그룹 게이트 깨짐 방지). node.edit(명시적)는 허용.
const LOCKED = { ok: false as const, error: "locked: 워크플로 노드는 드래그 이동·트리 분리·삭제 불가(스케줄러 전용)" };
// lock 은 조상으로 상속 — 노드 또는 조상 중 하나라도 locked 면 보호(부모 컨테이너 lock 이 자식 트리 전체 보호 → 그룹 게이트 보존).
const isLockedTree = (nodes: Node[], n: Node): boolean => {
  let cur: Node | null | undefined = n;
  while (cur) {
    if (cur.locked) return true;
    cur = cur.parentId ? byId(nodes, cur.parentId) : undefined;
  }
  return false;
};

export function registerCommands(ctx: AppCtx, store: KanbanStore): void {
  const cmds = ctx.app.commands;
  if (!cmds) return;
  const sub = (name: string, spec: CommandSpec) => ctx.subscriptions.push(cmds.register(name, spec));

  const STATUS_ENUM = STATUS_IDS;
  const TYPE_ENUM: NodeType[] = ["epic", "story", "task", "bug"];
  const PRIORITY_ENUM: PriorityId[] = ["highest", "high", "medium", "low"];
  const BADGE_ENUM: Badge[] = ["검수전", "o", "x", "f"];
  const VIEW_ENUM: ViewId[] = ["outline", "board", "gantt", "timeline", "tree", "table", "calendar"];
  const SORT_ENUM: SortKey[] = ["key", "title", "priority", "points", "due", "status", "assignee"];

  // ── 노드(내용/식별) ──
  sub("node.add", {
    description: "Add a node to the tree. Omit parentId to add at root level. Inserts after the sibling specified by 'after'.",
    triggers: { ko: "노드 추가 항목 생성 이슈 만들기" },
    params: {
      parentId: { type: "string", description: "Parent node id or key (omit for root)" },
      title: { type: "string", description: "Node title" },
      type: { type: "string", description: "Node type", enum: TYPE_ENUM },
      status: { type: "string", description: "Initial status", enum: STATUS_ENUM },
      assignee: { type: "string", description: "Assignee id" },
      priority: { type: "string", description: "Priority level", enum: PRIORITY_ENUM },
      points: { type: "number", description: "Story points" },
      after: { type: "string", description: "Insert after this sibling id/key" },
      description: { type: "string", description: "요건 설명(사람용 부제 — 칸반 표시). body 와 별개: body 는 exec-one 실행 입력(표시 X)" },
      body: { type: "string", description: "Body / exec-one 실행 지시(prompt/schema; 사람 표시 X)" },
      blockedBy: { type: "string[]", description: "선행 의존 노드 id 배열(전부 done 이어야 시작)" },
      locked: { type: "boolean", description: "워크플로 노드 보호(드래그 이동·분리·삭제 금지)" },
      badge: { type: "string", description: "검증 배지(드래프트 항목; status 와 별개 축, 기본 검수전)", enum: BADGE_ENUM },
      isDraft: { type: "boolean", description: "덩어리 부모(구체화 백로그 덩어리; 자식 oxf 감사 집계)" },
      parentDraftId: { type: "string", description: "복제 계보 — 개선본 덩어리의 원본 덩어리 id(덩어리 수준만)" },
      kind: { type: "string", description: "워크플로 노드 종류 마커(chunk/group/item/task 등; reconcile 가 항목 vs stage 구분)" },
    },
    returns: "{ ok, nodeId, key }",
    examples: ['sok plugin.soksak-plugin-kanban.node.add \'{"title":"새 작업","parentId":"WMP-100"}\''],
    handler: async (p) => {
      const nodes = store.get();
      const par = resolveParent(nodes, p.parentId);
      if (!par.ok) return { ok: false, error: par.error };
      const afterRef = p.after != null ? resolve(nodes, p.after) : null;
      const now = Date.now();
      const node: Node = {
        id: store.genId(),
        key: store.nextKey(),
        parentId: par.id,
        order: 0,
        title: typeof p.title === "string" ? p.title : "새 항목",
        description: typeof p.description === "string" ? p.description : undefined,
        body: typeof p.body === "string" ? p.body : "",
        blockedBy: Array.isArray(p.blockedBy) ? (p.blockedBy as unknown[]).filter((x): x is string => typeof x === "string") : [],
        result: "",
        locked: p.locked === true,
        badge: BADGE_ENUM.includes(p.badge as Badge) ? (p.badge as Badge) : undefined,
        isDraft: p.isDraft === true ? true : undefined,
        parentDraftId: typeof p.parentDraftId === "string" ? p.parentDraftId : undefined,
        kind: typeof p.kind === "string" && p.kind ? p.kind : undefined,
        type: (TYPE_ENUM.includes(p.type as NodeType) ? p.type : par.id == null ? "epic" : "task") as NodeType,
        status: (STATUS_ENUM.includes(p.status as StatusId) ? p.status : "todo") as StatusId,
        assignee: typeof p.assignee === "string" ? p.assignee : "me",
        priority: (PRIORITY_ENUM.includes(p.priority as PriorityId) ? p.priority : "medium") as PriorityId,
        points: typeof p.points === "number" ? p.points : par.id == null ? 0 : 3,
        start: TODAY,
        due: RANGE_END,
        collapsed: false,
        history: [],
        created: now,
        updated: now,
      };
      await store.apply((ns) => insertNode(ns, node, afterRef && afterRef.ok ? afterRef.node.id : undefined));
      // 최상위 'id' 는 JSON-RPC 엔벨로프 id 와 충돌(소켓 머지) → nodeId 로 노출.
      return { ok: true, nodeId: node.id, key: node.key };
    },
  });

  sub("node.edit", {
    description: "Edit fields of a node. Changing status automatically appends a history entry.",
    triggers: { ko: "노드 수정 편집 제목 상태 변경" },
    params: {
      node: { type: "string", description: "Node id or key", required: true },
      title: { type: "string", description: "New title" },
      description: { type: "string", description: "요건 설명(사람용 부제 — 칸반 표시; body 와 별개)" },
      body: { type: "string", description: "Body / exec-one 실행 입력(prompt/schema; 표시 X)" },
      type: { type: "string", description: "Node type", enum: TYPE_ENUM },
      status: { type: "string", description: "New status (appends history entry on change)", enum: STATUS_ENUM },
      assignee: { type: "string", description: "Assignee id" },
      priority: { type: "string", description: "Priority level", enum: PRIORITY_ENUM },
      points: { type: "number", description: "Story points" },
      start: { type: "string", description: "Start date YYYY-MM-DD" },
      due: { type: "string", description: "Due date YYYY-MM-DD" },
      blockedBy: { type: "string[]", description: "선행 의존 노드 id 배열(의존 변경)" },
      result: { type: "string", description: "실행 결과(완료 기록; 재실행 시 '' 로 초기화)" },
      badge: { type: "string", description: "검증 배지(검수전 → o/x/f). status 와 별개 축", enum: BADGE_ENUM },
      isDraft: { type: "boolean", description: "덩어리 부모 표시 변경" },
      parentDraftId: { type: "string", description: "복제 계보 — 원본 덩어리 id" },
      kind: { type: "string", description: "워크플로 노드 종류 마커(chunk/group/item/task 등)" },
    },
    returns: "{ ok, node }",
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      const id = r.node.id;
      await store.apply((ns) =>
        ns.map((n) => {
          if (n.id !== id) return n;
          let history = n.history;
          const nextStatus = typeof p.status === "string" && STATUS_ENUM.includes(p.status as StatusId) ? (p.status as StatusId) : n.status;
          if (nextStatus !== n.status) history = [...history, { from: n.status, to: nextStatus, by: "me", at: TODAY }];
          return {
            ...n,
            title: typeof p.title === "string" ? p.title : n.title,
            description: typeof p.description === "string" ? p.description : n.description,
            body: typeof p.body === "string" ? p.body : n.body,
            blockedBy: Array.isArray(p.blockedBy) ? (p.blockedBy as unknown[]).filter((x): x is string => typeof x === "string") : (n.blockedBy ?? []),
            result: typeof p.result === "string" ? p.result : (n.result ?? ""),
            badge: BADGE_ENUM.includes(p.badge as Badge) ? (p.badge as Badge) : n.badge,
            isDraft: typeof p.isDraft === "boolean" ? (p.isDraft === true ? true : undefined) : n.isDraft,
            parentDraftId: typeof p.parentDraftId === "string" ? p.parentDraftId : n.parentDraftId,
            kind: typeof p.kind === "string" && p.kind ? p.kind : n.kind,
            type: TYPE_ENUM.includes(p.type as NodeType) ? (p.type as NodeType) : n.type,
            status: nextStatus,
            assignee: typeof p.assignee === "string" ? p.assignee : n.assignee,
            priority: PRIORITY_ENUM.includes(p.priority as PriorityId) ? (p.priority as PriorityId) : n.priority,
            points: typeof p.points === "number" ? p.points : n.points,
            start: typeof p.start === "string" ? p.start : n.start,
            due: typeof p.due === "string" ? p.due : n.due,
            history,
            updated: Date.now(),
          };
        }),
      );
      const updated = byId(store.get(), id);
      return { ok: true, node: updated ? compact(updated) : null };
    },
  });

  sub("node.remove", {
    description: "Remove a node. With promoteChildren=true, children are re-parented to the grandparent; otherwise the entire subtree is deleted.",
    triggers: { ko: "노드 삭제 제거 지우기" },
    params: {
      node: { type: "string", description: "Node id or key", required: true },
      promoteChildren: { type: "boolean", description: "Promote children to grandparent instead of deleting the subtree (default false)" },
    },
    returns: "{ ok, removed }",
    danger: "destructive",
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      if (isLockedTree(store.get(), r.node)) return LOCKED;
      const before = store.get().length;
      await store.apply((ns) => removeNode(ns, r.node.id, p.promoteChildren === true));
      return { ok: true, removed: before - store.get().length };
    },
  });

  sub("node.get", {
    description: "Fetch a single node by id or key. Use withChildren=true to include its direct children.",
    triggers: { ko: "노드 조회 가져오기 보기" },
    params: {
      node: { type: "string", description: "Node id or key", required: true },
      withChildren: { type: "boolean", description: "Include direct children in the response" },
    },
    returns: "{ ok, node, children? }",
    handler: (p) => {
      const nodes = store.get();
      const r = resolve(nodes, p.node);
      if (!r.ok) return r;
      const out: Record<string, unknown> = { ok: true, node: { ...compact(r.node), body: r.node.body, result: r.node.result ?? "", history: r.node.history } };
      if (p.withChildren === true) out.children = childrenOf(nodes, r.node.id).map(compact);
      return out;
    },
  });

  sub("node.list", {
    description: "List nodes with optional filters. Filter by parentId, status, type, assignee, or a search term against key and title.",
    triggers: { ko: "노드 목록 리스트 검색 조회" },
    params: {
      parentId: { type: "string", description: "Limit to direct children of this parent (omit for all nodes)" },
      status: { type: "string", description: "Filter by status", enum: STATUS_ENUM },
      type: { type: "string", description: "Filter by node type", enum: TYPE_ENUM },
      assignee: { type: "string", description: "Filter by assignee id" },
      search: { type: "string", description: "Search term matched against key and title" },
      limit: { type: "number", description: "Maximum number of results (default 200)" },
    },
    returns: "{ ok, nodes }",
    handler: (p) => {
      let nodes = store.get();
      if (p.parentId != null && p.parentId !== "") {
        const par = resolveParent(nodes, p.parentId);
        if (!par.ok) return { ok: false, error: par.error };
        nodes = nodes.filter((n) => n.parentId === par.id);
      }
      if (typeof p.status === "string") nodes = nodes.filter((n) => n.status === p.status);
      if (typeof p.type === "string") nodes = nodes.filter((n) => n.type === p.type);
      if (typeof p.assignee === "string") nodes = nodes.filter((n) => n.assignee === p.assignee);
      if (typeof p.search === "string" && p.search.trim()) {
        const q = p.search.trim().toLowerCase();
        nodes = nodes.filter((n) => n.key.toLowerCase().includes(q) || n.title.toLowerCase().includes(q));
      }
      const limit = typeof p.limit === "number" ? p.limit : 200;
      return { ok: true, nodes: nodes.slice(0, limit).map(compact) };
    },
  });

  // ── 아웃라인(트리 위치/순서) ──
  sub("outline.indent", {
    description: "Indent a node — make it a child of its previous sibling (re-parents in the tree). Use to nest an item under another.",
    triggers: { ko: "들여쓰기 indent 하위로 자식 트리" },
    params: { node: { type: "string", description: "Node id or key", required: true } },
    returns: "{ ok }",
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      if (isLockedTree(store.get(), r.node)) return LOCKED;
      await store.apply((ns) => indent(ns, r.node.id));
      return { ok: true };
    },
  });
  sub("outline.outdent", {
    description: "Outdent a node — move it up one level under the grandparent, after the former parent. Carries children along and absorbs trailing siblings.",
    triggers: { ko: "내어쓰기 outdent 상위로 부모 올리기" },
    params: { node: { type: "string", description: "Node id or key", required: true } },
    returns: "{ ok }",
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      if (isLockedTree(store.get(), r.node)) return LOCKED;
      await store.apply((ns) => outdent(ns, r.node.id));
      return { ok: true };
    },
  });
  sub("outline.move", {
    description: "Move a node to a different parent (reparent) at an optional position. Rejects moves that would create a cycle (moving under a descendant).",
    triggers: { ko: "이동 reparent 부모 변경 옮기기" },
    params: {
      node: { type: "string", description: "Node id or key", required: true },
      parentId: { type: "string", description: "New parent id or key (omit or 'root' for top level)" },
      position: { type: "number", description: "0-based position among siblings (omit to append at end)" },
    },
    returns: "{ ok }",
    handler: async (p) => {
      const nodes = store.get();
      const r = resolve(nodes, p.node);
      if (!r.ok) return r;
      if (isLockedTree(store.get(), r.node)) return LOCKED;
      const par = resolveParent(nodes, p.parentId);
      if (!par.ok) return { ok: false, error: par.error };
      await store.apply((ns) => moveNode(ns, r.node.id, par.id, typeof p.position === "number" ? p.position : undefined));
      return { ok: true };
    },
  });
  sub("outline.reorder", {
    description: "Reorder a node within its current parent by setting a new 0-based sibling position.",
    triggers: { ko: "순서 변경 reorder 위치 정렬" },
    params: {
      node: { type: "string", description: "Node id or key", required: true },
      position: { type: "number", description: "Target 0-based position among siblings", required: true },
    },
    returns: "{ ok }",
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      await store.apply((ns) => reorder(ns, r.node.id, typeof p.position === "number" ? p.position : 0));
      return { ok: true };
    },
  });

  // ── 보드(상태) ──
  sub("board.move", {
    description: "Move a node to a different board column by changing its status. Records a history entry. Optionally sets its position within the target column.",
    triggers: { ko: "보드 이동 상태 변경 컬럼 칸반" },
    params: {
      node: { type: "string", description: "Node id or key", required: true },
      status: { type: "string", description: "Target status column", required: true, enum: STATUS_ENUM },
      position: { type: "number", description: "0-based position within the target column" },
    },
    returns: "{ ok }",
    examples: ['sok plugin.soksak-plugin-kanban.board.move \'{"node":"WMP-103","status":"inprogress"}\''],
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      if (isLockedTree(store.get(), r.node)) return LOCKED;
      if (!STATUS_ENUM.includes(p.status as StatusId)) return { ok: false, error: `invalid status: '${p.status}'` };
      await store.apply((ns) => boardMove(ns, r.node.id, p.status as StatusId, "me", TODAY, typeof p.position === "number" ? p.position : undefined));
      return { ok: true };
    },
  });
  sub("board.reorder", {
    description: "Reorder a node within its current board column by setting a new 0-based position.",
    triggers: { ko: "보드 순서 카드 위치 변경" },
    params: {
      node: { type: "string", description: "Node id or key", required: true },
      position: { type: "number", description: "Target 0-based position within the column", required: true },
    },
    returns: "{ ok }",
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      await store.apply((ns) => reorder(ns, r.node.id, typeof p.position === "number" ? p.position : 0));
      return { ok: true };
    },
  });
  sub("board.sort", {
    description: "Sort the children of a parent node by a given key and persist the new order.",
    triggers: { ko: "정렬 sort 보드 자동 순서" },
    params: {
      parentId: { type: "string", description: "Parent node id or key (omit for root)" },
      by: { type: "string", description: "Sort key", required: true, enum: SORT_ENUM },
      dir: { type: "string", description: "Sort direction asc or desc (default asc)", enum: ["asc", "desc"] },
    },
    returns: "{ ok, order }",
    handler: async (p) => {
      const nodes = store.get();
      const par = resolveParent(nodes, p.parentId);
      if (!par.ok) return { ok: false, error: par.error };
      if (!SORT_ENUM.includes(p.by as SortKey)) return { ok: false, error: `invalid sort key: '${p.by}'` };
      const dir = p.dir === "desc" ? "desc" : "asc";
      await store.apply((ns) => sortChildren(ns, par.id, p.by as SortKey, dir));
      return { ok: true, order: childrenOf(store.get(), par.id).map((n) => n.key) };
    },
  });

  // ── focus(줌) ── 열린 GUI 의 관점 이동(view 가 구독). 헤드리스 조회는 view.get 의 focus 파라미터.
  sub("focus.set", {
    description: "Navigate the open kanban GUI to a node and/or switch its view. For headless queries without a GUI, use view.get with the focus parameter instead.",
    triggers: { ko: "focus 줌 이동 포커스 뷰 전환" },
    params: {
      node: { type: "string", description: "Node id or key to focus (omit or 'root' for top level)" },
      view: { type: "string", description: "View to switch to simultaneously", enum: VIEW_ENUM },
    },
    returns: "{ ok, focusId, view }",
    handler: (p) => {
      const nodes = store.get();
      let focusId: string | null = null;
      if (p.node != null && p.node !== "" && p.node !== "root") {
        const r = resolve(nodes, p.node);
        if (!r.ok) return r;
        focusId = r.node.id;
      }
      const view = VIEW_ENUM.includes(p.view as ViewId) ? (p.view as ViewId) : undefined;
      ctx.app.bus?.emit?.("kanban:nav", { focusId, view });
      return { ok: true, focusId, view: view ?? null };
    },
  });

  // ── 투영/파생 ──
  sub("view.get", {
    description: "Return a view projection. board/outline/tree projections are scoped to the focus node's children; other views (gantt, timeline, table, calendar) are global.",
    triggers: { ko: "뷰 투영 보기 board outline tree gantt table calendar" },
    params: {
      view: { type: "string", description: "View type", required: true, enum: VIEW_ENUM },
      focus: { type: "string", description: "Root node id or key for scoped views (board/outline/tree)" },
      scope: { type: "string", description: "Board scope: direct children only or all descendants", enum: ["direct", "all"] },
      search: { type: "string", description: "Search term (board view)" },
      sortKey: { type: "string", description: "Sort key (table view)", enum: SORT_ENUM },
      sortDir: { type: "string", description: "Sort direction asc or desc (table view)", enum: ["asc", "desc"] },
    },
    returns: "{ ok, view, projection }",
    examples: ['sok plugin.soksak-plugin-kanban.view.get \'{"view":"board","focus":"WMP-100"}\''],
    handler: (p) => {
      const nodes = store.get();
      if (!VIEW_ENUM.includes(p.view as ViewId)) return { ok: false, error: `invalid view: '${p.view}'` };
      let focusId: string | null = null;
      if (p.focus != null && p.focus !== "" && p.focus !== "root") {
        const r = resolve(nodes, p.focus);
        if (!r.ok) return r;
        focusId = r.node.id;
      }
      const projection = projectView(nodes, p.view as ViewId, focusId, {
        scope: p.scope === "all" ? "all" : "direct",
        search: typeof p.search === "string" ? p.search : "",
        sortKey: SORT_ENUM.includes(p.sortKey as SortKey) ? (p.sortKey as SortKey) : "key",
        sortDir: p.sortDir === "desc" ? "desc" : "asc",
      });
      return { ok: true, view: p.view, focus: focusId, projection };
    },
  });

  sub("stats", {
    description: "Return progress statistics: completion rate, in-progress count, story points, bottlenecks, and stale nodes. Scoped to a focus node's descendants when specified.",
    triggers: { ko: "통계 진행 완료율 포인트 병목 현황" },
    params: { focus: { type: "string", description: "Root node id or key to scope stats (omit for all nodes)" } },
    returns: "{ ok, stats }",
    handler: (p) => {
      const nodes = store.get();
      let focusId: string | null = null;
      if (p.focus != null && p.focus !== "" && p.focus !== "root") {
        const r = resolve(nodes, p.focus);
        if (!r.ok) return r;
        focusId = r.node.id;
      }
      return { ok: true, stats: stats(nodes, focusId) };
    },
  });

  sub("timeline", {
    description: "Return the status-transition timeline grouped by date in descending order. Useful for reviewing recent activity.",
    triggers: { ko: "타임라인 timeline 활동 히스토리 상태 전환" },
    returns: "{ ok, groups }",
    handler: () => ({ ok: true, groups: toTimeline(store.get()) }),
  });

  sub("column.list", {
    description: "List all board columns (statuses) with their metadata and current card count.",
    triggers: { ko: "컬럼 목록 보드 상태 칸 현황" },
    returns: "{ ok, columns }",
    handler: () => {
      const items = store.get().filter((n) => n.parentId != null);
      return {
        ok: true,
        columns: STATUSES.map((s) => ({
          id: s.id,
          label: s.label,
          color: s.color,
          wip: s.wip ?? null,
          count: items.filter((i) => i.status === s.id).length,
        })),
      };
    },
  });

  // ── 수명주기 ──
  sub("seed", {
    description: "Load a demo tree (depth 4) for exploration. Skips if data already exists unless force=true.",
    triggers: { ko: "시드 데모 샘플 초기 데이터 seed" },
    params: { force: { type: "boolean", description: "Replace existing data with the demo tree" } },
    returns: "{ ok, count, skipped? }",
    handler: async (p) => {
      const cur = store.get();
      if (cur.length && p.force !== true) return { ok: true, skipped: true, count: cur.length };
      await store.apply(() => seedNodes(Date.now()));
      return { ok: true, count: store.get().length };
    },
  });

  sub("reset", {
    description: "Delete all nodes and return to an empty board. This action is irreversible.",
    triggers: { ko: "초기화 리셋 전체 삭제 비우기" },
    returns: "{ ok, removed }",
    danger: "destructive",
    handler: async () => {
      const before = store.get().length;
      await store.apply(() => []);
      return { ok: true, removed: before };
    },
  });

  sub("breadcrumb", {
    description: "Return the ancestor path from the root to the focus node, useful for showing current position in the tree.",
    triggers: { ko: "브레드크럼 경로 위치 ancestors 탐색" },
    params: { focus: { type: "string", description: "Node id or key to trace ancestors for" } },
    returns: "{ ok, crumbs }",
    handler: (p) => {
      const nodes = store.get();
      let focusId: string | null = null;
      if (p.focus != null && p.focus !== "" && p.focus !== "root") {
        const r = resolve(nodes, p.focus);
        if (!r.ok) return r;
        focusId = r.node.id;
      }
      return { ok: true, crumbs: breadcrumb(nodes, focusId), label: focusId ? shortTitle(byId(nodes, focusId)!) : "전체" };
    },
  });

  // descendantIds 는 향후 확장(progress 등)용 — 명령 표면엔 미노출.
  void descendantIds;
}
