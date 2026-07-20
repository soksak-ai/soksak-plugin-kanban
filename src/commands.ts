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

// 프롬프트 템플릿의 콘텐츠 주소(sha256) — 여기가 해시 계산의 단일 진실(Rust 엔 sha 없음, workflow 는 텍스트만 relay).
// Web Crypto(globalThis.crypto.subtle) 사용 — node:crypto 불요(esbuild platform:"browser" 빌드 통과), node·브라우저 공통.
// node:crypto 와 동일 sha256 값(검증됨). async 지만 유일 호출처(prompt.put)가 async 핸들러라 파급 없음.
const sha256 = async (s: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};
// {{key}} 마커를 vars 로 치환 — 소비 시점 조립(exec-one·UI 공유). 미정의 키는 마커 보존(loud 아님).
const bindVars = (tmpl: string, vars: Record<string, unknown>): string =>
  tmpl.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : `{{${k}}}`));
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
  // 성공 결과(data)를 한 문장으로 요약 — 코어 message 프로토콜(command.message).
  message?: (d: any) => string;
  // 후속 명령 제시(코어 hint 와 동형) — 성공 data 를 받아 다음에 둘 만한 명령을 최대 3개 제안.
  // 지시가 아니라 가능성의 제시(제안 어조) — 마땅한 사이클이 없는 명령엔 안 붙인다.
  hint?: (d: any, ctx?: unknown) => { cmd: string; why: string }[];
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

type Resolved = { ok: true; node: Node } | { ok: false; code: string; message: string; did_you_mean?: string[]; candidates?: string[] };

/** id 또는 key 로 노드 해석. 모호/미존재 시 후보 제시. */
function resolve(nodes: Node[], ref: unknown): Resolved {
  const s = String(ref ?? "");
  const direct = byId(nodes, s);
  if (direct) return { ok: true, node: direct };
  const byKey = nodes.filter((n) => n.key.toLowerCase() === s.toLowerCase());
  if (byKey.length === 1) return { ok: true, node: byKey[0] };
  if (byKey.length > 1) return { ok: false, code: "AMBIGUOUS", message: `ambiguous key: '${s}'`, candidates: byKey.map((n) => n.id) };
  const fuzzy = nodes
    .filter((n) => n.key.toLowerCase().includes(s.toLowerCase()) || n.title.toLowerCase().includes(s.toLowerCase()))
    .slice(0, 5)
    .map((n) => n.key);
  return { ok: false, code: "NOT_FOUND", message: `node not found: '${s}'`, did_you_mean: fuzzy };
}

/** parentId 파라미터(생략/빈문자/'root'/null → 최상위) 해석. */
function resolveParent(nodes: Node[], ref: unknown): { ok: true; id: string | null } | { ok: false; code: string; message: string } {
  if (ref == null || ref === "" || ref === "root" || ref === "null") return { ok: true, id: null };
  const r = resolve(nodes, ref);
  return r.ok ? { ok: true, id: r.node.id } : { ok: false, code: r.code, message: r.message };
}

const compact = (n: Node) => ({ id: n.id, key: n.key, title: n.title, description: n.description, type: n.type, status: n.status, parentId: n.parentId, order: n.order, assignee: n.assignee, priority: n.priority, points: n.points, start: n.start, due: n.due, blockedBy: n.blockedBy ?? [], locked: n.locked === true, badge: n.badge, origin: n.origin, category: n.category, isDraft: n.isDraft, parentDraftId: n.parentDraftId, kind: n.kind });
// 워크플로 파생 노드는 사람의 드래그 이동·트리 분리·삭제 금지(스케줄러 충돌·그룹 게이트 깨짐 방지). node.edit(명시적)는 허용.
const LOCKED = { ok: false as const, code: "LOCKED", message: "locked: 워크플로 노드는 드래그 이동·트리 분리·삭제 불가(스케줄러 전용)" };
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

  // ── 프롬프트 템플릿 store(콘텐츠 주소화) — 정규화: 템플릿 1벌 저장, node 는 promptHash 참조 ──
  sub("prompt.put", {
    description: "콘텐츠 주소(sha256) store — JSON 값(문자열 템플릿/directive 또는 객체 schema) 저장·dedup. hash 반환. 값은 네이티브 보관(stringify 왕복 없음).",
    params: {
      value: { type: "json", description: "저장 값(문자열 또는 객체). 문자열=sha256(raw), 객체=sha256(JSON)." },
      text: { type: "string", description: "(하위호환) 문자열 값 별칭" },
    },
    returns: "{ ok, hash }",
    message: (d) => `프롬프트를 저장했습니다 (${String(d.hash).slice(0, 12)})`,
    handler: async (p) => {
      const value = p.value !== undefined ? p.value : p.text;
      if (value == null || value === "") return { ok: false, code: "INVALID_INPUT", message: "value 필수" };
      const canon = typeof value === "string" ? value : JSON.stringify(value);
      const hash = await sha256(canon);
      await store.putPrompt(hash, value);
      return { ok: true, hash };
    },
  });
  sub("prompt.get", {
    description: "hash 로 저장 값 조회(네이티브 JSON — 문자열/객체). 소비 시점 조립용. 미등록 주소는 NOT_FOUND.",
    params: { hash: { type: "string", description: "콘텐츠 주소 sha256", required: true } },
    returns: "{ ok, value, text }",
    message: () => "값을 조회했습니다",
    handler: async (p) => {
      // 미발견은 거절이다. ok:true+value:null 로 답하면 "조회는 됐고 값이 비었다"를 말한 것이 되는데,
      // 그건 "없다" 와 다른 사실이라 소비자를 엉뚱한 수리로 보낸다(soksak-spec-plugin-prompt-store).
      const value = typeof p.hash === "string" ? await store.getPrompt(p.hash) : null;
      if (value == null) return { ok: false, code: "NOT_FOUND", message: "저장된 값이 없습니다", value: null };
      return { ok: true, value, text: typeof value === "string" ? value : undefined };
    },
  });
  sub("prompt.resolve", {
    description: "promptHash + vars(+refs) → 완성 프롬프트. {{key}}→vars(인라인 작은 값) 또는 refs(콘텐츠 주소 deref). exec-one·UI 공용 조립.",
    params: {
      hash: { type: "string", description: "프롬프트 템플릿 sha256", required: true },
      vars: { type: "json", description: "{{key}} 인라인 바인딩(작은 per-item 값)" },
      refs: { type: "json", description: "{{key}} → 콘텐츠 주소 hash. 큰 공유값(directive 등)은 저장소에 1행만, 노드는 hash 참조 — 소비 시점 deref(중복 제거)." },
    },
    returns: "{ ok, prompt }",
    message: () => "프롬프트를 완성했습니다",
    handler: async (p) => {
      const tmpl = typeof p.hash === "string" ? await store.getPrompt(p.hash) : null;
      if (typeof tmpl !== "string") return { ok: false, code: "NOT_FOUND", message: "템플릿 미발견(또는 비문자열)", prompt: null };
      const vars: Record<string, unknown> = { ...(p.vars && typeof p.vars === "object" ? (p.vars as Record<string, unknown>) : {}) };
      // refs: {{key}} 를 콘텐츠 주소(hash)에서 deref — 큰 공유값(directive)은 prompts 저장소 1행, 노드는 hash 만 보유.
      const refs = p.refs && typeof p.refs === "object" ? (p.refs as Record<string, unknown>) : {};
      for (const [k, h] of Object.entries(refs)) {
        if (typeof h !== "string") continue;
        const t = await store.getPrompt(h);
        if (t == null) return { ok: false, code: "NOT_FOUND", message: `ref 미발견(${k}=${h.slice(0, 12)})`, prompt: null };
        vars[k] = t;
      }
      return { ok: true, prompt: bindVars(tmpl, vars) };
    },
  });

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
      origin: { type: "string", description: "요건 출처(user/agent/search) — 규칙 D 출처 추적" },
      category: { type: "string", description: "분류 카테고리 — classify stage 가 완성 원장 보고 부여(node.edit). generate 는 안 붙임(평탄)" },
      isDraft: { type: "boolean", description: "덩어리 부모(구체화 백로그 덩어리; 자식 oxf 감사 집계)" },
      parentDraftId: { type: "string", description: "복제 계보 — 개선본 덩어리의 원본 덩어리 id(덩어리 수준만)" },
      kind: { type: "string", description: "워크플로 노드 종류 마커(chunk/group/item/task 등; reconcile 가 항목 vs stage 구분)" },
    },
    returns: "{ ok, nodeId, key }",
    examples: ['sok plugin.soksak-plugin-kanban.node.add \'{"title":"새 작업","parentId":"WMP-100"}\''],
    message: (d) => `${d.key} 노드를 추가했습니다`,
    hint: (d) => [
      { cmd: `sok plugin.soksak-plugin-kanban.outline.indent node=${d.nodeId}`, why: "직전 형제 아래로 들여쓰기해 계층을 만들 수 있습니다" },
      { cmd: `sok plugin.soksak-plugin-kanban.board.move node=${d.nodeId} status=doing`, why: "보드 컬럼(상태)을 지정할 수 있습니다" },
    ],
    handler: async (p) => {
      const nodes = store.get();
      const par = resolveParent(nodes, p.parentId);
      if (!par.ok) return par;
      // ① 락인 비대칭 방지: 잠긴 subtree 에 unlocked 노드 주입 금지(node.remove 불가·subValidation 오염). 워크플로 발행은 locked:true 시그니처라 허용.
      if (par.id != null && p.locked !== true) {
        const parentNode = byId(nodes, par.id);
        if (parentNode && isLockedTree(nodes, parentNode)) return LOCKED;
      }
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
        origin: typeof p.origin === "string" ? p.origin : undefined,
        category: typeof p.category === "string" ? p.category : undefined,
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
        collapsed: p.collapsed === true,
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
      origin: { type: "string", description: "요건 출처 갱신(user/agent/search)" },
      category: { type: "string", description: "분류 카테고리 갱신 — classify stage 가 완성 원장 보고 각 항목에 부여" },
      isDraft: { type: "boolean", description: "덩어리 부모 표시 변경" },
      parentDraftId: { type: "string", description: "복제 계보 — 원본 덩어리 id" },
      kind: { type: "string", description: "워크플로 노드 종류 마커(chunk/group/item/task 등)" },
    },
    returns: "{ ok, node }",
    message: (d) => `${d.node?.key ?? "노드"}를 수정했습니다`,
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
            origin: typeof p.origin === "string" ? p.origin : n.origin,
            category: typeof p.category === "string" ? p.category : n.category,
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
    message: (d) => `${d.removed}개 노드를 삭제했습니다`,
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
    message: (d) => `${d.node?.key ?? "노드"} 노드를 조회했습니다`,
    handler: (p) => {
      const nodes = store.get();
      const r = resolve(nodes, p.node);
      if (!r.ok) return r;
      const out: Record<string, unknown> = { ok: true, node: { ...compact(r.node), body: r.node.body, result: r.node.result ?? "", collapsed: r.node.collapsed, history: r.node.history } };
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
    message: (d) => `${(d.nodes ?? []).length}개 노드`,
    handler: (p) => {
      let nodes = store.get();
      if (p.parentId != null && p.parentId !== "") {
        const par = resolveParent(nodes, p.parentId);
        if (!par.ok) return par;
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
    message: () => "들여쓰기했습니다",
    hint: () => [{ cmd: "sok plugin.soksak-plugin-kanban.view.get view=outline", why: "변경된 트리 구조를 확인할 수 있습니다" }],
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      if (isLockedTree(store.get(), r.node)) return LOCKED;
      // ① 주입 금지: indent 는 직전 형제의 자식이 된다 — 직전 형제가 잠긴 트리면 거부.
      const sibs = childrenOf(store.get(), r.node.parentId);
      const ix = sibs.findIndex((s) => s.id === r.node.id);
      const prevSib = ix > 0 ? sibs[ix - 1] : null;
      if (prevSib && isLockedTree(store.get(), prevSib)) return LOCKED;
      await store.apply((ns) => indent(ns, r.node.id));
      return { ok: true };
    },
  });
  sub("outline.outdent", {
    description: "Outdent a node — move it up one level under the grandparent, after the former parent. Carries children along and absorbs trailing siblings.",
    triggers: { ko: "내어쓰기 outdent 상위로 부모 올리기" },
    params: { node: { type: "string", description: "Node id or key", required: true } },
    returns: "{ ok }",
    message: () => "내어쓰기했습니다",
    hint: () => [{ cmd: "sok plugin.soksak-plugin-kanban.view.get view=outline", why: "변경된 트리 구조를 확인할 수 있습니다" }],
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
    message: () => "노드를 이동했습니다",
    hint: () => [{ cmd: "sok plugin.soksak-plugin-kanban.view.get view=outline", why: "변경된 트리 구조를 확인할 수 있습니다" }],
    handler: async (p) => {
      const nodes = store.get();
      const r = resolve(nodes, p.node);
      if (!r.ok) return r;
      if (isLockedTree(store.get(), r.node)) return LOCKED;
      const par = resolveParent(nodes, p.parentId);
      if (!par.ok) return par;
      // ① 주입 금지: unlocked 노드를 잠긴 subtree 로 이동 거부(source 가 locked 면 위에서 차단됨 — 여기 도달=unlocked).
      if (par.id != null) {
        const pn = byId(nodes, par.id);
        if (pn && isLockedTree(nodes, pn)) return LOCKED;
      }
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
    message: () => "순서를 변경했습니다",
    hint: () => [{ cmd: "sok plugin.soksak-plugin-kanban.view.get view=outline", why: "변경된 트리 구조를 확인할 수 있습니다" }],
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      if (isLockedTree(store.get(), r.node)) return LOCKED; // ② reorder 도 드래그 이동 — lock 금지
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
    message: () => "카드를 다른 컬럼으로 옮겼습니다",
    hint: () => [{ cmd: "sok plugin.soksak-plugin-kanban.view.get view=board", why: "옮긴 컬럼을 보드에서 확인할 수 있습니다" }],
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      if (isLockedTree(store.get(), r.node)) return LOCKED;
      if (!STATUS_ENUM.includes(p.status as StatusId)) return { ok: false, code: "INVALID_INPUT", message: `invalid status: '${p.status}'` };
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
    message: () => "카드 순서를 변경했습니다",
    hint: () => [{ cmd: "sok plugin.soksak-plugin-kanban.view.get view=board", why: "변경된 순서를 보드에서 확인할 수 있습니다" }],
    handler: async (p) => {
      const r = resolve(store.get(), p.node);
      if (!r.ok) return r;
      if (isLockedTree(store.get(), r.node)) return LOCKED; // ② reorder 도 드래그 이동 — lock 금지
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
    message: (d) => `${(d.order ?? []).length}개를 정렬했습니다`,
    hint: () => [{ cmd: "sok plugin.soksak-plugin-kanban.view.get view=board", why: "정렬된 순서를 보드에서 확인할 수 있습니다" }],
    handler: async (p) => {
      const nodes = store.get();
      const par = resolveParent(nodes, p.parentId);
      if (!par.ok) return par;
      if (!SORT_ENUM.includes(p.by as SortKey)) return { ok: false, code: "INVALID_INPUT", message: `invalid sort key: '${p.by}'` };
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
    message: (d) => (d.focusId ? "포커스를 이동했습니다" : "최상위로 이동했습니다"),
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
    message: (d) => `${d.view} 뷰를 투영했습니다`,
    handler: (p) => {
      const nodes = store.get();
      if (!VIEW_ENUM.includes(p.view as ViewId)) return { ok: false, code: "INVALID_INPUT", message: `invalid view: '${p.view}'` };
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
    message: (d) => `총 ${d.stats?.total ?? 0}개 노드 현황`,
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
    message: (d) => `${(d.groups ?? []).length}개 날짜의 활동`,
    handler: () => ({ ok: true, groups: toTimeline(store.get()) }),
  });

  sub("column.list", {
    description: "List all board columns (statuses) with their metadata and current card count.",
    triggers: { ko: "컬럼 목록 보드 상태 칸 현황" },
    returns: "{ ok, columns }",
    message: (d) => `${(d.columns ?? []).length}개 컬럼`,
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
    message: (d) => (d.skipped ? `이미 ${d.count}개가 있어 건너뜀` : `${d.count}개 노드를 생성했습니다`),
    hint: () => [{ cmd: "sok plugin.soksak-plugin-kanban.view.get view=board", why: "생성된 데모 트리를 보드에서 확인할 수 있습니다" }],
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
    message: (d) => `${d.removed}개를 삭제하고 초기화했습니다`,
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
    message: (d) => `${d.label ?? "전체"} 경로`,
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
