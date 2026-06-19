import { describe, it, expect } from "vitest";
import { seedNodes } from "@/core/seed";
import { depthOf } from "@/core/tree";
import {
  toBoard,
  toOutlineRows,
  toGantt,
  toTimeline,
  toTable,
  toCalendar,
  toFlow,
  stats,
  breadcrumb,
  leavesUnder,
} from "@/core/projections";

const seed = seedNodes();

describe("seed 무결성", () => {
  it("29 노드, depth 4 까지(421)", () => {
    expect(seed.length).toBe(29);
    expect(depthOf(seed, "421")).toBe(4); // E1>101>401>412>421
    expect(depthOf(seed, "E1")).toBe(0);
  });
});

describe("toBoard — focus 스코프", () => {
  it("focus=null: 최상위 에픽을 상태별로", () => {
    const b = toBoard(seed, null, "direct");
    const col = (id: string) => b.columns.find((c) => c.id === id)!;
    expect(col("inprogress").cards.map((c) => c.id).sort()).toEqual(["E1", "E2"]);
    expect(col("todo").cards.map((c) => c.id)).toEqual(["E3"]);
  });
  it("focus=E1: E1 직계 자식을 상태별로", () => {
    const b = toBoard(seed, "E1", "direct");
    const col = (id: string) => b.columns.find((c) => c.id === id)!;
    expect(col("inprogress").cards.map((c) => c.id).sort()).toEqual(["101", "105"]);
    expect(col("review").cards.map((c) => c.id)).toEqual(["102"]);
    expect(col("todo").cards.map((c) => c.id)).toEqual(["103"]);
    expect(col("done").cards.map((c) => c.id)).toEqual(["104"]);
    // 101 은 자식(401,402)이 있어 hasChildren + 진행률
    const c101 = b.columns.flatMap((c) => c.cards).find((c) => c.id === "101")!;
    expect(c101.hasChildren).toBe(true);
    expect(c101.childCount).toBe(2);
  });
  it("focus=101: 더 깊이 들어가면 그 자식들로 재구성", () => {
    const b = toBoard(seed, "101", "direct");
    const all = b.columns.flatMap((c) => c.cards).map((c) => c.id).sort();
    expect(all).toEqual(["401", "402"]);
  });
  it("scope=all: 포커스 이하 말단만(자식 없는 노드)", () => {
    const b = toBoard(seed, "E1", "all");
    const all = b.columns.flatMap((c) => c.cards);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((c) => !c.hasChildren)).toBe(true);
    expect(all.map((c) => c.id).sort()).toEqual(leavesUnder(seed, "E1").map((n) => n.id).sort());
  });
});

describe("toOutlineRows — 재귀 + 전역 epic 판정", () => {
  it("focus=null: E1 depth0 epic, 421 은 depth4", () => {
    const rows = toOutlineRows(seed, null);
    const r = (id: string) => rows.find((x) => x.id === id)!;
    expect(r("E1").depth).toBe(0);
    expect(r("E1").isEpic).toBe(true);
    expect(r("421").depth).toBe(4);
    expect(r("421").isEpic).toBe(false);
  });
  it("focus=E1: 자식은 로컬 depth0 이지만 전역 비루트라 epic 아님", () => {
    const rows = toOutlineRows(seed, "E1");
    const r101 = rows.find((x) => x.id === "101")!;
    expect(r101.depth).toBe(0); // 로컬 들여쓰기
    expect(r101.isEpic).toBe(false); // 전역 비루트
    expect(r101.type).toBe("task");
  });
});

describe("breadcrumb", () => {
  it("focus=101 → 전체 / E1 / 101", () => {
    const bc = breadcrumb(seed, "101");
    expect(bc.map((c) => c.id)).toEqual([null, "E1", "101"]);
  });
});

describe("전역 뷰 + 통계", () => {
  it("stats: 작업항목 26개(에픽 3 제외)", () => {
    expect(stats(seed).total).toBe(26);
  });
  it("toGantt: 에픽 + 자손 행", () => {
    const g = toGantt(seed);
    expect(g.rows.find((r) => r.id === "E1" && r.isEpic)).toBeTruthy();
    expect(g.rows.find((r) => r.id === "421")).toBeTruthy(); // 깊은 자손도 포함
    expect(g.weeks.length).toBe(4);
  });
  it("toTimeline: 날짜 내림차순 그룹", () => {
    const t = toTimeline(seed);
    expect(t.length).toBeGreaterThan(0);
  });
  it("toTable: 정렬", () => {
    const asc = toTable(seed, "points", "asc").map((r) => r.points);
    const desc = toTable(seed, "points", "desc").map((r) => r.points);
    expect(asc[0]).toBeLessThanOrEqual(asc[asc.length - 1]);
    expect(desc[0]).toBeGreaterThanOrEqual(desc[desc.length - 1]);
  });
  it("toCalendar: 6월 그리드", () => {
    const c = toCalendar(seed);
    expect(c.weekdays.length).toBe(7);
    expect(c.weeks.length).toBeGreaterThanOrEqual(5);
  });
  it("toFlow: 상태 노드 5 + 전환/리워크", () => {
    const f = toFlow(seed);
    expect(f.nodes.length).toBe(5);
    expect(f.edges.length).toBe(4);
    expect(typeof f.rework).toBe("number");
  });
});
