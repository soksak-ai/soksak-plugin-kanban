// 명령 카탈로그 — 전부 같은 트리(store)를 조작. app.commands.register 로 CLI/MCP 자동노출.
// node(내용) / outline(트리 위치) / board(상태) / focus(줌) / view(투영) / 수명주기.
import type { Node, NodeType, StatusId, PriorityId, ViewId } from "@/types";
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

const compact = (n: Node) => ({ id: n.id, key: n.key, title: n.title, type: n.type, status: n.status, parentId: n.parentId, order: n.order, assignee: n.assignee, priority: n.priority, points: n.points, due: n.due });

export function registerCommands(ctx: AppCtx, store: KanbanStore): void {
  const cmds = ctx.app.commands;
  if (!cmds) return;
  const sub = (name: string, spec: CommandSpec) => ctx.subscriptions.push(cmds.register(name, spec));

  const STATUS_ENUM = STATUS_IDS;
  const TYPE_ENUM: NodeType[] = ["epic", "story", "task", "bug"];
  const PRIORITY_ENUM: PriorityId[] = ["highest", "high", "medium", "low"];
  const VIEW_ENUM: ViewId[] = ["outline", "board", "gantt", "timeline", "tree", "table", "calendar"];
  const SORT_ENUM: SortKey[] = ["key", "title", "priority", "points", "due", "status", "assignee"];

  // ── 노드(내용/식별) ──
  sub("node.add", {
    description: "노드 추가. parentId 생략 시 최상위. after(형제 id/key) 뒤에 삽입.",
    params: {
      parentId: { type: "string", description: "부모 노드 id/key (생략=최상위)" },
      title: { type: "string", description: "제목" },
      type: { type: "string", description: "유형", enum: TYPE_ENUM },
      status: { type: "string", description: "상태", enum: STATUS_ENUM },
      assignee: { type: "string", description: "담당자 id" },
      priority: { type: "string", description: "우선순위", enum: PRIORITY_ENUM },
      points: { type: "number", description: "스토리 포인트" },
      after: { type: "string", description: "이 형제(id/key) 뒤에 삽입" },
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
        body: "",
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
    description: "노드 필드 수정. status 변경 시 history 자동 기록.",
    params: {
      node: { type: "string", description: "노드 id/key", required: true },
      title: { type: "string", description: "제목" },
      body: { type: "string", description: "본문" },
      type: { type: "string", description: "유형", enum: TYPE_ENUM },
      status: { type: "string", description: "상태(변경 시 history)", enum: STATUS_ENUM },
      assignee: { type: "string", description: "담당자 id" },
      priority: { type: "string", description: "우선순위", enum: PRIORITY_ENUM },
      points: { type: "number", description: "스토리 포인트" },
      start: { type: "string", description: "시작 YYYY-MM-DD" },
      due: { type: "string", description: "마감 YYYY-MM-DD" },
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
            body: typeof p.body === "string" ? p.body : n.body,
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
    description: "노드 삭제. promoteChildren=true 면 자식을 부모로 승격, 아니면 서브트리 통째 삭제.",
    params: {
      node: { type: "string", description: "노드 id/key", required: true },
      promoteChildren: { type: "boolean", description: "자식 승격(기본 false=서브트리 삭제)" },
    },
    returns: "{ ok, removed }",
    danger: "destructive",
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      const before = store.get().length;
      await store.apply((ns) => removeNode(ns, r.node.id, p.promoteChildren === true));
      return { ok: true, removed: before - store.get().length };
    },
  });

  sub("node.get", {
    description: "노드 조회. withChildren=true 면 직계 자식도.",
    params: {
      node: { type: "string", description: "노드 id/key", required: true },
      withChildren: { type: "boolean", description: "직계 자식 포함" },
    },
    returns: "{ ok, node, children? }",
    handler: (p) => {
      const nodes = store.get();
      const r = resolve(nodes, p.node);
      if (!r.ok) return r;
      const out: Record<string, unknown> = { ok: true, node: { ...compact(r.node), body: r.node.body, history: r.node.history } };
      if (p.withChildren === true) out.children = childrenOf(nodes, r.node.id).map(compact);
      return out;
    },
  });

  sub("node.list", {
    description: "노드 목록(필터). parentId/status/type/assignee/search.",
    params: {
      parentId: { type: "string", description: "부모로 한정(생략=전체)" },
      status: { type: "string", description: "상태", enum: STATUS_ENUM },
      type: { type: "string", description: "유형", enum: TYPE_ENUM },
      assignee: { type: "string", description: "담당자 id" },
      search: { type: "string", description: "키/제목 검색어" },
      limit: { type: "number", description: "최대 개수(기본 200)" },
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
    description: "Tab — 직전 형제의 자식으로 들여쓰기.",
    params: { node: { type: "string", description: "노드 id/key", required: true } },
    returns: "{ ok }",
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      await store.apply((ns) => indent(ns, r.node.id));
      return { ok: true };
    },
  });
  sub("outline.outdent", {
    description: "Shift+Tab — 한 단계 위로(조부모 밑, 옛 부모 뒤). 자식 동반, 뒤 형제 흡수.",
    params: { node: { type: "string", description: "노드 id/key", required: true } },
    returns: "{ ok }",
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      await store.apply((ns) => outdent(ns, r.node.id));
      return { ok: true };
    },
  });
  sub("outline.move", {
    description: "노드를 다른 부모로 이동(reparent) + 위치. 자손 밑으로 이동은 거부(순환).",
    params: {
      node: { type: "string", description: "노드 id/key", required: true },
      parentId: { type: "string", description: "새 부모 id/key (생략/root=최상위)" },
      position: { type: "number", description: "형제 중 0-based 위치(생략=끝)" },
    },
    returns: "{ ok }",
    handler: async (p) => {
      const nodes = store.get();
      const r = resolve(nodes, p.node);
      if (!r.ok) return r;
      const par = resolveParent(nodes, p.parentId);
      if (!par.ok) return { ok: false, error: par.error };
      await store.apply((ns) => moveNode(ns, r.node.id, par.id, typeof p.position === "number" ? p.position : undefined));
      return { ok: true };
    },
  });
  sub("outline.reorder", {
    description: "같은 부모 안에서 position(0-based)으로 순서 변경.",
    params: {
      node: { type: "string", description: "노드 id/key", required: true },
      position: { type: "number", description: "0-based 위치", required: true },
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
    description: "보드 이동 — 상태 변경(history) + 선택적 position 재배치.",
    params: {
      node: { type: "string", description: "노드 id/key", required: true },
      status: { type: "string", description: "대상 상태", required: true, enum: STATUS_ENUM },
      position: { type: "number", description: "칸 내 0-based 위치" },
    },
    returns: "{ ok }",
    examples: ['sok plugin.soksak-plugin-kanban.board.move \'{"node":"WMP-103","status":"inprogress"}\''],
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      if (!STATUS_ENUM.includes(p.status as StatusId)) return { ok: false, error: `invalid status: '${p.status}'` };
      await store.apply((ns) => boardMove(ns, r.node.id, p.status as StatusId, "me", TODAY, typeof p.position === "number" ? p.position : undefined));
      return { ok: true };
    },
  });
  sub("board.reorder", {
    description: "보드 칸 안에서 position(0-based)으로 순서 변경(형제 order).",
    params: {
      node: { type: "string", description: "노드 id/key", required: true },
      position: { type: "number", description: "0-based 위치", required: true },
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
    description: "parentId 자식들을 by 기준 정렬해 order 영속.",
    params: {
      parentId: { type: "string", description: "부모 id/key (생략=최상위)" },
      by: { type: "string", description: "정렬 키", required: true, enum: SORT_ENUM },
      dir: { type: "string", description: "asc|desc(기본 asc)", enum: ["asc", "desc"] },
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
    description: "열린 칸반 GUI 의 관점(focus)을 그 노드로 이동. 헤드리스 조회는 view.get 의 focus 파라미터를 쓸 것.",
    params: { node: { type: "string", description: "노드 id/key (생략/root=최상위)" } },
    returns: "{ ok, focusId }",
    handler: (p) => {
      const nodes = store.get();
      let focusId: string | null = null;
      if (p.node != null && p.node !== "" && p.node !== "root") {
        const r = resolve(nodes, p.node);
        if (!r.ok) return r;
        focusId = r.node.id;
      }
      ctx.app.bus?.emit?.("kanban:focus", { focusId });
      return { ok: true, focusId };
    },
  });

  // ── 투영/파생 ──
  sub("view.get", {
    description: "뷰 투영 반환. board/outline/tree 는 focus 적용(그 자식들로 재구성), 나머지는 전역.",
    params: {
      view: { type: "string", description: "뷰", required: true, enum: VIEW_ENUM },
      focus: { type: "string", description: "기준 노드 id/key (board/outline/tree)" },
      scope: { type: "string", description: "보드 범위 direct|all", enum: ["direct", "all"] },
      search: { type: "string", description: "검색어(board)" },
      sortKey: { type: "string", description: "정렬 키(table)", enum: SORT_ENUM },
      sortDir: { type: "string", description: "asc|desc(table)", enum: ["asc", "desc"] },
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
    description: "진행 통계(완료/진행/포인트/병목/정체). focus 지정 시 그 자손만.",
    params: { focus: { type: "string", description: "기준 노드 id/key(생략=전체)" } },
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
    description: "상태 전환 타임라인(날짜 내림차순 그룹).",
    returns: "{ ok, groups }",
    handler: () => ({ ok: true, groups: toTimeline(store.get()) }),
  });

  sub("column.list", {
    description: "고정 컬럼(상태) 메타 + 현재 카드 수.",
    returns: "{ ok, columns }",
    handler: () => {
      const items = store.get().filter((n) => n.parentId != null);
      return {
        ok: true,
        columns: STATUSES.map((s) => ({
          id: s.id,
          label: s.label,
          kr: s.kr,
          color: s.color,
          wip: s.wip ?? null,
          count: items.filter((i) => i.status === s.id).length,
        })),
      };
    },
  });

  // ── 수명주기 ──
  sub("seed", {
    description: "데모 트리(depth 4) 적재. 기존 데이터가 있으면 force 없이는 건너뜀.",
    params: { force: { type: "boolean", description: "기존을 데모로 교체" } },
    returns: "{ ok, count, skipped? }",
    handler: async (p) => {
      const cur = store.get();
      if (cur.length && p.force !== true) return { ok: true, skipped: true, count: cur.length };
      await store.apply(() => seedNodes(Date.now()));
      return { ok: true, count: store.get().length };
    },
  });

  sub("reset", {
    description: "모든 노드 삭제(빈 보드).",
    returns: "{ ok, removed }",
    danger: "destructive",
    handler: async () => {
      const before = store.get().length;
      await store.apply(() => []);
      return { ok: true, removed: before };
    },
  });

  sub("breadcrumb", {
    description: "focus 기준 브레드크럼(전체→…→focus).",
    params: { focus: { type: "string", description: "기준 노드 id/key" } },
    returns: "{ ok, crumbs }",
    handler: (p) => {
      const nodes = store.get();
      let focusId: string | null = null;
      if (p.focus != null && p.focus !== "" && p.focus !== "root") {
        const r = resolve(nodes, p.focus);
        if (!r.ok) return r;
        focusId = r.node.id;
      }
      return { ok: true, crumbs: breadcrumb(nodes, focusId), label: focusId ? shortTitle(byId(nodes, focusId)!) : "전체 워크스페이스" };
    },
  });

  // descendantIds 는 향후 확장(progress 등)용 — 명령 표면엔 미노출.
  void descendantIds;
}
