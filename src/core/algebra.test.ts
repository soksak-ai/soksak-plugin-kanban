import { describe, it, expect } from "vitest";
import type { Node } from "@/types";
import { byId, childrenOf, descendantIds } from "@/core/tree";
import {
  indent,
  outdent,
  reorder,
  moveNode,
  removeNode,
  setStatus,
  insertNode,
  normalizeOrders,
  sortChildren,
} from "@/core/algebra";

// ── 테스트 헬퍼 ──
function n(id: string, parentId: string | null, order: number, extra: Partial<Node> = {}): Node {
  return {
    id,
    key: "K-" + id,
    parentId,
    order,
    title: id,
    body: "",
    type: "task",
    status: "todo",
    assignee: "me",
    priority: "medium",
    points: 0,
    start: "2026-06-01",
    due: "2026-06-02",
    collapsed: false,
    history: [],
    created: Number(order),
    updated: 0,
    ...extra,
  };
}
const ids = (nodes: Node[], parentId: string | null): string[] =>
  childrenOf(nodes, parentId).map((x) => x.id);

/** I1(비순환) + I2(형제 order 0..n-1 연속) 검증. */
function assertInvariants(nodes: Node[]): void {
  // I2
  const groups = new Map<string | null, Node[]>();
  for (const node of nodes) {
    const g = groups.get(node.parentId);
    if (g) g.push(node);
    else groups.set(node.parentId, [node]);
  }
  for (const [, g] of groups) {
    const orders = g.map((x) => x.order).sort((a, b) => a - b);
    orders.forEach((o, i) => expect(o).toBe(i));
  }
  // I1: 모든 노드가 N+1 스텝 내 null 도달, 사이클 없음
  for (const node of nodes) {
    let cur: Node | null = node;
    const seen = new Set<string>();
    let steps = 0;
    while (cur && cur.parentId != null) {
      expect(seen.has(cur.id)).toBe(false);
      seen.add(cur.id);
      cur = byId(nodes, cur.parentId);
      expect(++steps).toBeLessThanOrEqual(nodes.length);
    }
  }
}

describe("outdent — Workflowy 골든 케이스", () => {
  it("1>(1-1>1-1-1),2 에서 outdent(1-1) → 1, 1-1>1-1-1, 2", () => {
    const tree = [n("1", null, 0), n("1-1", "1", 0), n("1-1-1", "1-1", 0), n("2", null, 1)];
    const out = outdent(tree, "1-1");
    // 1-1 이 최상위로, 1 바로 뒤에
    expect(ids(out, null)).toEqual(["1", "1-1", "2"]);
    // 자식 1-1-1 은 1-1 을 따라옴
    expect(ids(out, "1-1")).toEqual(["1-1-1"]);
    // 1 의 자식은 비었음
    expect(ids(out, "1")).toEqual([]);
    assertInvariants(out);
  });

  it("뒤따르는 형제를 자식으로 흡수: 1>(a,b,c) outdent(a) → 1, a>(b,c)", () => {
    const tree = [n("1", null, 0), n("a", "1", 0), n("b", "1", 1), n("c", "1", 2)];
    const out = outdent(tree, "a");
    expect(ids(out, null)).toEqual(["1", "a"]);
    expect(ids(out, "1")).toEqual([]);
    expect(ids(out, "a")).toEqual(["b", "c"]); // b,c 흡수, 순서 보존
    assertInvariants(out);
  });

  it("최상위는 outdent 불가(무변경)", () => {
    const tree = [n("1", null, 0), n("2", null, 1)];
    expect(outdent(tree, "1")).toEqual(tree);
  });
});

describe("indent — Tab", () => {
  it("직전 형제의 자식으로", () => {
    const tree = [n("a", null, 0), n("b", null, 1), n("c", null, 2)];
    const out = indent(tree, "b");
    expect(ids(out, null)).toEqual(["a", "c"]);
    expect(ids(out, "a")).toEqual(["b"]);
    assertInvariants(out);
  });
  it("직전 형제 없으면 무변경", () => {
    const tree = [n("a", null, 0), n("b", null, 1)];
    expect(indent(tree, "a")).toEqual(tree);
  });
});

describe("reorder / move / remove / status", () => {
  it("reorder 로 형제 순서 변경", () => {
    const tree = [n("a", null, 0), n("b", null, 1), n("c", null, 2)];
    expect(ids(reorder(tree, "c", 0), null)).toEqual(["c", "a", "b"]);
    expect(ids(reorder(tree, "a", 2), null)).toEqual(["b", "c", "a"]);
  });
  it("moveNode 는 자손 밑으로 이동(순환)을 거부", () => {
    const tree = [n("a", null, 0), n("a1", "a", 0)];
    expect(moveNode(tree, "a", "a1")).toEqual(tree); // 무변경
  });
  it("moveNode reparent", () => {
    const tree = [n("a", null, 0), n("b", null, 1), n("x", "a", 0)];
    const out = moveNode(tree, "x", "b");
    expect(ids(out, "a")).toEqual([]);
    expect(ids(out, "b")).toEqual(["x"]);
    assertInvariants(out);
  });
  it("removeNode 서브트리 삭제 vs 자식 승격", () => {
    const tree = [n("a", null, 0), n("a1", "a", 0), n("a11", "a1", 0)];
    expect(removeNode(tree, "a").length).toBe(0); // 서브트리 전체
    const promoted = removeNode(tree, "a1", true);
    expect(byId(promoted, "a1")).toBe(null);
    expect(ids(promoted, "a")).toEqual(["a11"]); // a11 이 a 의 자식으로 승격
    assertInvariants(promoted);
  });
  it("setStatus 는 history 를 append, 같은 상태면 무변경", () => {
    const tree = [n("a", null, 0, { status: "todo" })];
    const moved = setStatus(tree, "a", "done", "me", "2026-06-18");
    expect(byId(moved, "a")!.status).toBe("done");
    expect(byId(moved, "a")!.history).toEqual([
      { from: "todo", to: "done", by: "me", at: "2026-06-18" },
    ]);
    expect(setStatus(moved, "a", "done", "me", "2026-06-19")).toBe(moved); // 무변경
  });
  it("insertNode append / afterId", () => {
    const tree = [n("a", null, 0), n("b", null, 1)];
    const appended = insertNode(tree, n("c", null, 0));
    expect(ids(appended, null)).toEqual(["a", "b", "c"]);
    const after = insertNode(tree, n("c", null, 0), "a");
    expect(ids(after, null)).toEqual(["a", "c", "b"]);
  });
  it("sortChildren 로 정렬→order 영속", () => {
    const tree = [
      n("a", null, 0, { points: 3 }),
      n("b", null, 1, { points: 1 }),
      n("c", null, 2, { points: 8 }),
    ];
    expect(ids(sortChildren(tree, null, "points", "asc"), null)).toEqual(["b", "a", "c"]);
    expect(ids(sortChildren(tree, null, "points", "desc"), null)).toEqual(["c", "a", "b"]);
  });
});

describe("불변식 — 임의 연산 시퀀스 후 I1·I2 유지(속성 기반)", () => {
  // 결정적 시드 RNG(Math.random 미사용 — 실패 재현 가능).
  function lcg(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  it("250 회 무작위 연산 후에도 불변식 유지", () => {
    const rnd = lcg(42);
    const pick = <T>(arr: T[]): T | undefined => (arr.length ? arr[Math.floor(rnd() * arr.length)] : undefined);
    let nodes: Node[] = [
      n("r1", null, 0),
      n("r2", null, 1),
      n("r1a", "r1", 0),
      n("r1b", "r1", 1),
      n("r1a1", "r1a", 0),
    ];
    let counter = 0;
    for (let i = 0; i < 250; i++) {
      assertInvariants(nodes);
      const all = nodes.map((x) => x.id);
      const target = pick(all);
      const op = Math.floor(rnd() * 6);
      if (op === 0 && target) nodes = indent(nodes, target);
      else if (op === 1 && target) nodes = outdent(nodes, target);
      else if (op === 2 && target) nodes = reorder(nodes, target, Math.floor(rnd() * 4));
      else if (op === 3 && target) {
        const dest = pick([null, ...all]) ?? null;
        nodes = moveNode(nodes, target, dest as string | null, Math.floor(rnd() * 4));
      } else if (op === 4 && target && nodes.length > 1) nodes = removeNode(nodes, target, rnd() > 0.5);
      else {
        const parent = pick([null, ...all]) ?? null;
        nodes = insertNode(nodes, n("x" + counter++, parent as string | null, 0));
      }
      // descendantIds 가 끝나야(무한 루프 없음 = 비순환) 함도 암묵 검증
      if (target) expect(descendantIds(nodes, target).length).toBeLessThan(nodes.length + 1);
    }
    assertInvariants(nodes);
    expect(normalizeOrders(nodes)).toEqual(nodes); // 이미 정규형
  });
});
