import { describe, it, expect, beforeEach } from "vitest";
import { createStore } from "@/store";
import { registerCommands } from "@/commands";

// ── mock app.data (인메모리, scope 별) ──
function mockApp() {
  const scopes = new Map<string, Map<string, Record<string, unknown>>>();
  const sc = (scope?: string) => {
    const k = scope ?? "default";
    let m = scopes.get(k);
    if (!m) scopes.set(k, (m = new Map()));
    return m;
  };
  const watchers: Array<(e: unknown) => void> = [];
  const data = {
    async define() {},
    async put(_c: string, doc: Record<string, unknown>, opts?: { scope?: string; id?: string }) {
      const id = opts?.id ?? (doc.id as string);
      sc(opts?.scope).set(id, JSON.parse(JSON.stringify(doc)));
      watchers.forEach((w) => w(null));
      return id;
    },
    async delete(_c: string, id: string, opts?: { scope?: string }) {
      const d = sc(opts?.scope).delete(id);
      watchers.forEach((w) => w(null));
      return d;
    },
    async query(_c: string, opts?: { scope?: string }) {
      return [...sc(opts?.scope).values()];
    },
    watch(_c: string, _o: unknown, cb: (e: unknown) => void) {
      watchers.push(cb);
      return () => {};
    },
  };
  return { data, project: { current: () => null }, bus: { emit: () => {} } };
}

let handlers: Map<string, (p: Record<string, unknown>, ctx?: unknown) => Promise<object> | object>;
const call = async (name: string, params: Record<string, unknown> = {}) => {
  const h = handlers.get(name);
  if (!h) throw new Error("no command: " + name);
  return (await h(params)) as Record<string, unknown>;
};

beforeEach(async () => {
  const app = mockApp();
  handlers = new Map();
  const ctx = {
    app: {
      ...app,
      commands: {
        register(name: string, spec: { handler: (p: Record<string, unknown>) => Promise<object> | object }) {
          handlers.set(name, spec.handler);
          return { dispose() {} };
        },
      },
    },
    subscriptions: [] as Array<{ dispose(): void } | (() => void)>,
  };
  const store = createStore(ctx.app);
  await store.init();
  registerCommands(ctx, store);
});

describe("명령 전면 — 헤드리스 E2E", () => {
  it("seed 는 멱등(두 번째는 skip)", async () => {
    const r1 = await call("seed");
    expect(r1).toMatchObject({ ok: true, count: 29 });
    const r2 = await call("seed");
    expect(r2).toMatchObject({ ok: true, skipped: true, count: 29 });
  });

  it("node.list parentId 로 직계 자식", async () => {
    await call("seed");
    const r = await call("node.list", { parentId: "WMP-100" });
    expect(r.ok).toBe(true);
    expect((r.nodes as unknown[]).length).toBe(5); // 101,102,103,104,105
  });

  it("view.get board 는 focus 로 재구성(프랙탈)", async () => {
    await call("seed");
    const root = (await call("view.get", { view: "board", focus: "root" })).projection as {
      columns: { id: string; cards: { id: string }[] }[];
    };
    const ip = root.columns.find((c) => c.id === "inprogress")!;
    expect(ip.cards.map((c) => c.id).sort()).toEqual(["E1", "E2"]);

    const e1 = (await call("view.get", { view: "board", focus: "WMP-100" })).projection as {
      columns: { id: string; cards: { id: string }[] }[];
    };
    const all = e1.columns.flatMap((c) => c.cards).map((c) => c.id).sort();
    expect(all).toEqual(["101", "102", "103", "104", "105"]);
  });

  it("board.move 로 상태 변경 + history", async () => {
    await call("seed");
    expect(await call("board.move", { node: "WMP-103", status: "inprogress" })).toMatchObject({ ok: true });
    const g = (await call("node.get", { node: "WMP-103" })).node as { status: string; history: unknown[] };
    expect(g.status).toBe("inprogress");
    expect(g.history.length).toBeGreaterThan(0);
  });

  it("outline.outdent 는 한 단계 위로 + 뒤 형제 흡수(401 outdent)", async () => {
    await call("seed");
    // 401 의 부모는 101, 조부모는 E1. 101 자식: [401, 402]. outdent(401) → 401 부모=E1, 402 는 401 자식으로 흡수.
    expect(await call("outline.outdent", { node: "WMP-401" })).toMatchObject({ ok: true });
    const n401 = (await call("node.get", { node: "WMP-401" })).node as { parentId: string };
    const n402 = (await call("node.get", { node: "WMP-402" })).node as { parentId: string };
    expect(n401.parentId).toBe("E1");
    expect(n402.parentId).toBe("401");
  });

  it("node.add → 새 노드, node.remove 로 제거", async () => {
    await call("seed");
    const added = await call("node.add", { parentId: "WMP-100", title: "추가 작업", status: "todo" });
    expect(added.ok).toBe(true);
    const id = added.nodeId as string;
    const list = (await call("node.list", { parentId: "WMP-100" })).nodes as { id: string }[];
    expect(list.some((n) => n.id === id)).toBe(true);
    expect(await call("node.remove", { node: id })).toMatchObject({ ok: true, removed: 1 });
  });

  it("board.sort 로 칸 정렬, stats/timeline/column.list 동작", async () => {
    await call("seed");
    const sorted = await call("board.sort", { parentId: "WMP-100", by: "points", dir: "desc" });
    expect(sorted.ok).toBe(true);
    expect((await call("stats")).stats).toMatchObject({ total: 26 });
    expect(((await call("timeline")).groups as unknown[]).length).toBeGreaterThan(0);
    expect(((await call("column.list")).columns as unknown[]).length).toBe(5);
  });

  it("미존재 노드는 did_you_mean 으로 실패", async () => {
    await call("seed");
    const r = await call("node.get", { node: "WMP-999" });
    expect(r.ok).toBe(false);
    expect(r).toHaveProperty("error");
  });

  it("reset 는 전체 삭제", async () => {
    await call("seed");
    expect(await call("reset")).toMatchObject({ ok: true, removed: 29 });
    expect((await call("node.list")).nodes).toEqual([]);
  });
});
