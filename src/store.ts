// 스토어 — app.data(SQLite) 위 in-memory 미러. 단일 진실은 app.data "nodes" 컬렉션.
// 변이: 순수 op 적용 → 낙관적 미러 갱신·notify → 변경분만 app.data 영속(diff). data.watch 로
// 다른 창 변경 시 재수화. scope 는 init 시점 프로젝트로 고정(v1; 멀티프로젝트 전환은 범위 외).
import type { Node, NodeType, StatusId, PriorityId } from "@/types";

export interface DataApi {
  define(coll: string, opts: { indexes?: string[]; fts?: string[] }): Promise<void>;
  put(coll: string, doc: Record<string, unknown>, opts?: { scope?: string; id?: string }): Promise<string>;
  delete(coll: string, id: string, opts?: { scope?: string }): Promise<boolean>;
  query(
    coll: string,
    opts?: { scope?: string; where?: Record<string, unknown>; order?: string; desc?: boolean; limit?: number; offset?: number },
  ): Promise<unknown[]>;
  watch(coll: string, opts: { scope?: string } | undefined, cb: (e: unknown) => void): Disposable | (() => void);
}
export interface Disposable {
  dispose(): void;
}
export interface AppLike {
  data?: DataApi;
  project?: { current?: () => { id: string; root: string | null } | null };
}

const COLL = "nodes";
const VALID_STATUS: StatusId[] = ["backlog", "todo", "inprogress", "review", "done"];
const VALID_TYPE: NodeType[] = ["epic", "story", "task", "bug"];
const VALID_PRIORITY: PriorityId[] = ["highest", "high", "medium", "low"];

function asStr(v: unknown, d = ""): string {
  return typeof v === "string" ? v : d;
}
function asNum(v: unknown, d = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

/** app.data 원시 doc → Node(방어적 coercion). 필수 필드 없으면 null. */
function rowToNode(raw: unknown): Node | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  const type = VALID_TYPE.includes(r.type as NodeType) ? (r.type as NodeType) : "task";
  const status = VALID_STATUS.includes(r.status as StatusId) ? (r.status as StatusId) : "todo";
  const priority = VALID_PRIORITY.includes(r.priority as PriorityId) ? (r.priority as PriorityId) : "medium";
  return {
    id: r.id,
    key: asStr(r.key, r.id),
    parentId: typeof r.parentId === "string" ? r.parentId : null,
    order: asNum(r.order, 0),
    title: asStr(r.title),
    body: asStr(r.body),
    blockedBy: Array.isArray(r.blockedBy) ? (r.blockedBy as unknown[]).filter((x): x is string => typeof x === "string") : [],
    result: asStr(r.result),
    type,
    status,
    assignee: asStr(r.assignee, "me"),
    priority,
    points: asNum(r.points, 0),
    start: asStr(r.start, "2026-06-01"),
    due: asStr(r.due, "2026-06-02"),
    collapsed: r.collapsed === true,
    history: Array.isArray(r.history) ? (r.history as Node["history"]) : [],
    created: asNum(r.created, 0),
    updated: asNum(r.updated, 0),
  };
}

function disposeOf(d: Disposable | (() => void)): void {
  if (typeof d === "function") d();
  else if (d && typeof d.dispose === "function") d.dispose();
}

export interface KanbanStore {
  get(): Node[];
  apply(fn: (nodes: Node[]) => Node[]): Promise<void>;
  subscribe(cb: () => void): () => void;
  nextKey(): string;
  genId(): string;
  init(): Promise<void>;
  dispose(): void;
}

export function createStore(app: AppLike): KanbanStore {
  const data = app.data;
  const scope: string = app.project?.current?.()?.id ?? "default";
  let nodes: Node[] = [];
  let writing = 0;
  const subs = new Set<() => void>();
  let watchSub: Disposable | (() => void) | null = null;
  const notify = () => {
    for (const cb of subs) cb();
  };

  async function hydrate() {
    if (!data) return;
    const rows = await data.query(COLL, { scope, limit: 100000 });
    nodes = rows.map(rowToNode).filter((n): n is Node => n != null);
    notify();
  }

  async function persist(prev: Node[], next: Node[]) {
    if (!data) return;
    const prevMap = new Map(prev.map((n) => [n.id, n]));
    const nextIds = new Set(next.map((n) => n.id));
    writing++;
    try {
      for (const n of next) {
        const p = prevMap.get(n.id);
        if (!p || JSON.stringify(p) !== JSON.stringify(n)) {
          await data.put(COLL, n as unknown as Record<string, unknown>, { scope, id: n.id });
        }
      }
      for (const p of prev) if (!nextIds.has(p.id)) await data.delete(COLL, p.id, { scope });
    } finally {
      writing--;
    }
  }

  return {
    get: () => nodes,
    async apply(fn) {
      const prev = nodes;
      const next = fn(prev);
      if (next === prev) return;
      nodes = next;
      notify(); // 낙관적
      await persist(prev, next);
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    nextKey() {
      const nums = nodes.map((n) => parseInt(n.key.split("-")[1], 10) || 0);
      return "WMP-" + (Math.max(0, ...nums) + 1);
    },
    genId() {
      try {
        return crypto.randomUUID();
      } catch {
        return "n-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36);
      }
    },
    async init() {
      if (!data) return;
      await data.define(COLL, {
        indexes: ["parentId", "order", "status", "assignee", "priority", "due", "type"],
        fts: ["key", "title", "body"],
      });
      await hydrate();
      watchSub = data.watch(COLL, { scope }, () => {
        if (writing === 0) void hydrate();
      });
    },
    dispose() {
      if (watchSub) disposeOf(watchSub);
      watchSub = null;
      subs.clear();
    },
  };
}
