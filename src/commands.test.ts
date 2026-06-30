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
  const emits: string[] = [];
  return { data, project: { current: () => null }, bus: { emit: (topic: string) => emits.push(topic) }, emits };
}

let handlers: Map<string, (p: Record<string, unknown>, ctx?: unknown) => Promise<object> | object>;
let busEmits: string[];
const call = async (name: string, params: Record<string, unknown> = {}) => {
  const h = handlers.get(name);
  if (!h) throw new Error("no command: " + name);
  return (await h(params)) as Record<string, unknown>;
};

beforeEach(async () => {
  const app = mockApp();
  busEmits = app.emits;
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

// 워크플로 의존(blockedBy)·결과(result) — 태스크 DAG 스케줄러용 확장.
describe("blockedBy / result", () => {
  const id = (r: Record<string, unknown>) => r.nodeId as string;
  const node = (r: Record<string, unknown>) => r.node as Record<string, unknown>;

  it("기본값: 미설정 시 blockedBy=[] · result=''", async () => {
    const a = await call("node.add", { title: "A" });
    const got = await call("node.get", { node: id(a) });
    expect(node(got).blockedBy).toEqual([]);
    expect(node(got).result).toBe("");
  });

  it("node.add 로 blockedBy 설정 → node.get 이 반환(관계 표시)", async () => {
    const a = await call("node.add", { title: "A" });
    const b = await call("node.add", { title: "B", blockedBy: [id(a)] });
    const got = await call("node.get", { node: id(b) });
    expect(node(got).blockedBy).toEqual([id(a)]);
  });

  it("node.edit 로 result 기록 + status 전환(실행 완료)", async () => {
    const a = await call("node.add", { title: "A" });
    await call("node.edit", { node: id(a), result: "R", status: "done" });
    const got = await call("node.get", { node: id(a) });
    expect(node(got).result).toBe("R");
    expect(node(got).status).toBe("done");
  });

  it("node.edit 로 blockedBy 갱신(의존 변경)", async () => {
    const a = await call("node.add", { title: "A" });
    const b = await call("node.add", { title: "B" });
    await call("node.edit", { node: id(b), blockedBy: [id(a)] });
    const got = await call("node.get", { node: id(b) });
    expect(node(got).blockedBy).toEqual([id(a)]);
  });

  it("재실행: status→todo · result 초기화 가능", async () => {
    const a = await call("node.add", { title: "A" });
    await call("node.edit", { node: id(a), result: "R", status: "done" });
    await call("node.edit", { node: id(a), result: "", status: "todo" });
    const got = await call("node.get", { node: id(a) });
    expect(node(got).status).toBe("todo");
    expect(node(got).result).toBe("");
  });
});

// 워크플로 파생 노드 보호 — 사람의 드래그 이동·트리 분리 거부(스케줄러 충돌·그룹 게이트 깨짐 방지).
describe("locked", () => {
  const id = (r: Record<string, unknown>) => r.nodeId as string;

  it("locked 노드는 board.move(드래그 status) 거부", async () => {
    const a = await call("node.add", { title: "A", locked: true });
    expect((await call("board.move", { node: id(a), status: "done" })).ok).toBe(false);
  });

  it("locked 노드는 outline.move(트리 분리) 거부", async () => {
    const a = await call("node.add", { title: "A", locked: true });
    const b = await call("node.add", { title: "B" });
    expect((await call("outline.move", { node: id(a), parentId: id(b) })).ok).toBe(false);
  });

  it("locked 노드는 node.remove 거부", async () => {
    const a = await call("node.add", { title: "A", locked: true });
    expect((await call("node.remove", { node: id(a) })).ok).toBe(false);
  });

  it("locked 노드도 node.edit 는 허용(스케줄러·재실행)", async () => {
    const a = await call("node.add", { title: "A", locked: true });
    expect((await call("node.edit", { node: id(a), status: "done" })).ok).toBe(true);
  });

  it("unlocked 노드는 board.move 허용", async () => {
    const a = await call("node.add", { title: "A" });
    expect((await call("board.move", { node: id(a), status: "done" })).ok).toBe(true);
  });

  it("부모가 locked 면 자식의 이동·status 도 거부(상속)", async () => {
    const p = await call("node.add", { title: "P", locked: true });
    const c = await call("node.add", { title: "C", parentId: id(p) });
    const o = await call("node.add", { title: "O" });
    expect((await call("outline.move", { node: id(c), parentId: id(o) })).ok).toBe(false);
    expect((await call("board.move", { node: id(c), status: "done" })).ok).toBe(false);
  });

  it("locked 부모의 자식도 node.edit 는 허용(스케줄러)", async () => {
    const p = await call("node.add", { title: "P", locked: true });
    const c = await call("node.add", { title: "C", parentId: id(p) });
    expect((await call("node.edit", { node: id(c), status: "done" })).ok).toBe(true);
  });
});

// 드래프트 모델(규칙 D) — 검증 배지(oxf)·덩어리(isDraft)·복제 계보(parentDraftId)·감사 집계·락인.
describe("draft 모델", () => {
  const id = (r: Record<string, unknown>) => r.nodeId as string;
  const node = (r: Record<string, unknown>) => r.node as Record<string, unknown>;

  it("기본값: 미설정 시 badge/isDraft/parentDraftId 없음(일반 노드)", async () => {
    const a = await call("node.add", { title: "A" });
    const got = node(await call("node.get", { node: id(a) }));
    expect(got.badge).toBeUndefined();
    expect(got.isDraft).toBeUndefined();
    expect(got.parentDraftId).toBeUndefined();
  });

  it("node.add 로 badge 설정 → node.get 반환(검증 축)", async () => {
    const a = await call("node.add", { title: "항목", badge: "검수전" });
    expect(node(await call("node.get", { node: id(a) })).badge).toBe("검수전");
    const b = await call("node.add", { title: "통과", badge: "o" });
    expect(node(await call("node.get", { node: id(b) })).badge).toBe("o");
  });

  it("잘못된 badge 값은 무시(undefined)", async () => {
    const a = await call("node.add", { title: "A", badge: "예정" });
    expect(node(await call("node.get", { node: id(a) })).badge).toBeUndefined();
  });

  it("node.add 로 덩어리 부모(isDraft) + 복제 계보(parentDraftId)", async () => {
    const v1 = await call("node.add", { title: "덩어리 v1", isDraft: true });
    const v2 = await call("node.add", { title: "덩어리 v2", isDraft: true, parentDraftId: id(v1) });
    const g2 = node(await call("node.get", { node: id(v2) }));
    expect(g2.isDraft).toBe(true);
    expect(g2.parentDraftId).toBe(id(v1));
  });

  // kind — 워크플로 노드 종류 마커(chunk/group/item/task). 칸반은 해석 안 하고 round-trip만.
  // reconcile 가 compact 에서 읽어 "검증할 드래프트 항목(item) vs 실행할 stage 노드(task)" 를 가른다.
  it("node.add kind → node.get + node.list(compact) 에 노출", async () => {
    const a = await call("node.add", { title: "Generate", kind: "task" });
    expect(node(await call("node.get", { node: id(a) })).kind).toBe("task");
    const listed = (await call("node.list")).nodes as { id: string; kind?: string }[];
    expect(listed.find((n) => n.id === id(a))!.kind).toBe("task"); // compact 에 kind 노출(reconcile 가 읽음)
  });

  it("kind 미설정 시 undefined(일반 노드)", async () => {
    const a = await call("node.add", { title: "A" });
    expect(node(await call("node.get", { node: id(a) })).kind).toBeUndefined();
  });

  it("node.edit 로 kind 갱신", async () => {
    const a = await call("node.add", { title: "A", kind: "item" });
    await call("node.edit", { node: id(a), kind: "group" });
    expect(node(await call("node.get", { node: id(a) })).kind).toBe("group");
  });

  it("node.edit 로 badge 갱신(검수전 → o)", async () => {
    const a = await call("node.add", { title: "A", badge: "검수전" });
    await call("node.edit", { node: id(a), badge: "o" });
    expect(node(await call("node.get", { node: id(a) })).badge).toBe("o");
  });

  it("node.edit 로 f 판정해도 status 축과 무관(별개 축)", async () => {
    const a = await call("node.add", { title: "A", badge: "검수전", status: "backlog" });
    await call("node.edit", { node: id(a), badge: "f" });
    const got = node(await call("node.get", { node: id(a) }));
    expect(got.badge).toBe("f");
    expect(got.status).toBe("backlog"); // 검증 배지는 status 를 건드리지 않는다
  });

  it("덩어리 부모 락인 → 드래프트 자식 자동 보호(board.move/분리 거부)", async () => {
    const chunk = await call("node.add", { title: "덩어리", isDraft: true, locked: true });
    const g = await call("node.add", { title: "기능분류", parentId: id(chunk) });
    const item = await call("node.add", { title: "항목", parentId: id(g), badge: "검수전" });
    expect((await call("board.move", { node: id(item), status: "done" })).ok).toBe(false);
    const other = await call("node.add", { title: "딴 곳" });
    expect((await call("outline.move", { node: id(item), parentId: id(other) })).ok).toBe(false);
  });

  it("view.get outline: 덩어리 부모는 감사 집계, 항목은 자기 배지", async () => {
    const chunk = await call("node.add", { title: "덩어리", isDraft: true });
    const g = await call("node.add", { title: "기능분류", parentId: id(chunk) });
    await call("node.add", { title: "i1", parentId: id(g), badge: "o" });
    await call("node.add", { title: "i2", parentId: id(g), badge: "f" });
    const proj = (await call("view.get", { view: "outline", focus: "root" })).projection as {
      rows: { id: string; badge: string | null; validation: { o: number; f: number; total: number; discard: boolean } | null }[];
    };
    const chunkRow = proj.rows.find((r) => r.id === id(chunk))!;
    expect(chunkRow.validation).toMatchObject({ o: 1, f: 1, total: 2, discard: true });
    const i1Row = proj.rows.find((r) => r.badge === "o")!;
    expect(i1Row.validation).toBeNull(); // 항목은 집계 아님
  });
});

// ② 트리거 — 노드 변이마다 글로벌 bus 로 "kanban:changed" 발화(워크플로가 구독해 즉시 재반영).
describe("bus kanban:changed (② 트리거)", () => {
  const id = (r: Record<string, unknown>) => r.nodeId as string;

  it("node.add → kanban:changed 발화", async () => {
    busEmits.length = 0;
    await call("node.add", { title: "A" });
    expect(busEmits.filter((t) => t === "kanban:changed").length).toBeGreaterThan(0);
  });

  it("node.edit → kanban:changed 발화", async () => {
    const a = await call("node.add", { title: "A" });
    busEmits.length = 0;
    await call("node.edit", { node: id(a), status: "done" });
    expect(busEmits).toContain("kanban:changed");
  });

  it("node.remove → kanban:changed 발화", async () => {
    const a = await call("node.add", { title: "A" });
    busEmits.length = 0;
    await call("node.remove", { node: id(a) });
    expect(busEmits).toContain("kanban:changed");
  });

  it("board.move/outline.move 등 변이도 발화", async () => {
    const a = await call("node.add", { title: "A" });
    busEmits.length = 0;
    await call("board.move", { node: id(a), status: "inprogress" });
    expect(busEmits).toContain("kanban:changed");
  });

  it("거부된 변이(locked)는 발화 안 함", async () => {
    const a = await call("node.add", { title: "A", locked: true });
    busEmits.length = 0;
    await call("node.remove", { node: id(a) }); // LOCKED → store.apply 호출 안 됨
    expect(busEmits).not.toContain("kanban:changed");
  });
});

// description — 규칙 B 3축: title(요건명) + description(사람용 설명) + body(exec-one 입력). description 추가.
describe("description 축(요건 설명, 사람용)", () => {
  const id = (r: Record<string, unknown>) => r.nodeId as string;
  const node = (r: Record<string, unknown>) => r.node as Record<string, unknown>;

  it("node.add description → node.get + node.list(compact) 노출", async () => {
    const a = await call("node.add", { title: "재고 동기화", description: "주문 시 캐니스터 슬롯 재고를 차감한다" });
    expect(node(await call("node.get", { node: id(a) })).description).toBe("주문 시 캐니스터 슬롯 재고를 차감한다");
    const listed = (await call("node.list")).nodes as { id: string; description?: string }[];
    expect(listed.find((n) => n.id === id(a))!.description).toBe("주문 시 캐니스터 슬롯 재고를 차감한다");
  });

  it("description(표시)과 body(exec-one 입력)는 별개 축", async () => {
    const a = await call("node.add", { title: "T", description: "사람용 요건 설명", body: '{"prompt":"검증"}' });
    const g = await call("node.get", { node: id(a) });
    expect(node(g).description).toBe("사람용 요건 설명");
    expect((g.node as Record<string, unknown>).body).toBe('{"prompt":"검증"}'); // body 는 그대로(exec 입력)
  });

  it("node.edit 로 description 갱신", async () => {
    const a = await call("node.add", { title: "T", description: "v1" });
    await call("node.edit", { node: id(a), description: "v2" });
    expect(node(await call("node.get", { node: id(a) })).description).toBe("v2");
  });

  it("description 미설정 시 undefined", async () => {
    const a = await call("node.add", { title: "T" });
    expect(node(await call("node.get", { node: id(a) })).description).toBeUndefined();
  });
});
