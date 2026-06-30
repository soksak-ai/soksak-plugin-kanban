// 6뷰 투영 — 전부 순수. 한 트리(Node[])를 관점(focus)에 따라 여러 뷰모델로.
// 데이터 전용(색/스타일 없음 — 뷰가 refs 로 해석). 디자인 build* 로직 포팅.
//   focus 스코프: Board / Outline / Tree (children(focus))
//   전역: Gantt / Timeline / Table / Calendar / Flow / stats (디자인 동작 일치)
import type { Node, NodeType, StatusId, ViewId, Badge } from "@/types";
import { STATUSES, STATUS_IDS, PRIORITY, RANGE_START, TODAY, TOTAL_DAYS } from "@/refs";
import type { L10nLabel } from "@/refs";
import {
  byId,
  childrenOf,
  descendantIds,
  depthOf,
  rootOf,
  hasChildren,
  subProgress,
  focusChain,
  effectiveType,
} from "@/core/tree";
import { dayIdx, fmtShort, staleInfo } from "@/core/dates";
import type { SortKey } from "@/core/algebra";

export const shortTitle = (n: Node): string => (n.title || "").split(" · ")[0] || n.key;

// ── 드래프트 검증 집계(규칙 D) ──
// 항목(badge 보유)만 판정 단위. 그룹·덩어리 부모는 자손 항목 badge 를 집계한다(감사).
// 자기 자신은 제외 — 항목은 자기 badge 를 직접 단다(집계 아님 → null).
export interface SubValidation {
  pending: number; // 검수전
  o: number; // 통과
  x: number; // 검증 후 버림
  f: number; // 치명
  total: number; // 판정 단위(badge 보유 자손) 수
  discard: boolean; // f≥1 → 덩어리 폐기 대상(개선·복제 재제출)
}
/** id 의 자손 중 badge 를 가진 항목들의 oxf 집계. badge 항목이 없으면 null. f≥1 → discard. */
export function subValidation(nodes: Node[], id: string): SubValidation | null {
  const items = descendantIds(nodes, id)
    .map((x) => byId(nodes, x))
    .filter((n): n is Node => n != null && n.badge != null);
  if (!items.length) return null;
  let pending = 0;
  let o = 0;
  let x = 0;
  let f = 0;
  for (const n of items) {
    const b = n.badge as Badge;
    if (b === "o") o++;
    else if (b === "x") x++;
    else if (b === "f") f++;
    else pending++;
  }
  return { pending, o, x, f, total: items.length, discard: f >= 1 };
}

/** 비최상위(작업) 노드 = 디자인 children(). 전역 뷰·통계 대상. */
const workItems = (nodes: Node[]): Node[] => nodes.filter((n) => n.parentId != null);

export interface Crumb {
  id: string | null;
  label: string;
}
export function breadcrumb(nodes: Node[], focusId: string | null): Crumb[] {
  const chain = focusChain(nodes, focusId);
  return [{ id: null, label: "전체" }, ...chain.map((n) => ({ id: n.id, label: shortTitle(n) }))];
}

// ── 통계 ──
export interface Stats {
  total: number;
  done: number;
  inProgress: number;
  progress: number;
  totalPts: number;
  donePts: number;
  bottlenecks: number;
  stale: number;
}
export function stats(nodes: Node[], focusId: string | null = null): Stats {
  const items =
    focusId != null
      ? (descendantIds(nodes, focusId).map((id) => byId(nodes, id)!).filter(Boolean) as Node[])
      : workItems(nodes);
  const done = items.filter((i) => i.status === "done").length;
  const totalPts = items.reduce((a, i) => a + i.points, 0);
  const donePts = items.filter((i) => i.status === "done").reduce((a, i) => a + i.points, 0);
  const bottlenecks = STATUSES.filter(
    (s) => s.wip != null && items.filter((i) => i.status === s.id).length > s.wip,
  ).length;
  const stale = items.filter((i) => staleInfo(i, TODAY).stale).length;
  return {
    total: items.length,
    done,
    inProgress: items.filter((i) => i.status === "inprogress").length,
    progress: items.length ? Math.round((done / items.length) * 100) : 0,
    totalPts,
    donePts,
    bottlenecks,
    stale,
  };
}

// ── 카드(보드 항목) ──
export interface CardVM {
  id: string;
  key: string;
  title: string;
  description: string; // 요건 설명(사람용 부제). body(exec 입력)와 별개.
  type: NodeType; // 실효 타입
  status: StatusId;
  priority: Node["priority"];
  assignee: string;
  points: number;
  start: string;
  due: string;
  staleDays: number;
  stale: boolean;
  hasChildren: boolean;
  childCount: number;
  progress: { done: number; total: number; pct: number } | null;
  preview: { title: string; status: StatusId }[];
  parentId: string | null;
  parentLabel: string;
  showPath: boolean;
  badge: Badge | null; // 항목 자기 검증 배지(드래프트 항목)
  isDraft: boolean; // 덩어리 부모
  validation: SubValidation | null; // 그룹·덩어리 부모의 자손 oxf 집계(감사)
}
function cardVM(nodes: Node[], n: Node, focusId: string | null, scope: BoardScope): CardVM {
  const { days, stale } = staleInfo(n, TODAY);
  const kids = childrenOf(nodes, n.id);
  const prog = subProgress(nodes, n.id);
  const parent = n.parentId != null ? byId(nodes, n.parentId) : null;
  return {
    id: n.id,
    key: n.key,
    title: n.title,
    description: n.description ?? "",
    type: effectiveType(n, depthOf(nodes, n.id)),
    status: n.status,
    priority: n.priority,
    assignee: n.assignee,
    points: n.points,
    start: n.start,
    due: n.due,
    staleDays: days,
    stale,
    hasChildren: kids.length > 0,
    childCount: kids.length,
    progress: prog,
    preview: kids.slice(0, 3).map((c) => ({ title: shortTitle(c), status: c.status })),
    parentId: n.parentId,
    parentLabel: parent ? shortTitle(parent) : "",
    showPath: scope === "all" && !!parent && n.parentId !== (focusId ?? null),
    badge: n.badge ?? null,
    isDraft: n.isDraft === true,
    validation: subValidation(nodes, n.id),
  };
}

export type BoardScope = "direct" | "all";

/** 포커스 이하 말단 작업(보드 scope='all'용). */
export function leavesUnder(nodes: Node[], focusId: string | null): Node[] {
  const res: Node[] = [];
  const walk = (pid: string | null) => {
    for (const i of childrenOf(nodes, pid)) {
      if (childrenOf(nodes, i.id).length === 0) res.push(i);
      else walk(i.id);
    }
  };
  walk(focusId ?? null);
  return res;
}

export interface BoardColumnVM {
  id: StatusId;
  label: L10nLabel;
  color: string;
  wip: number | null;
  count: number;
  bottleneck: boolean;
  cards: CardVM[];
}
export interface BoardVM {
  focusId: string | null;
  breadcrumb: Crumb[];
  scope: BoardScope;
  columns: BoardColumnVM[];
}
export function toBoard(
  nodes: Node[],
  focusId: string | null = null,
  scope: BoardScope = "direct",
  search = "",
): BoardVM {
  const base = scope === "all" ? leavesUnder(nodes, focusId) : childrenOf(nodes, focusId);
  const q = search.trim().toLowerCase();
  const match = (n: Node) => !q || n.key.toLowerCase().includes(q) || n.title.toLowerCase().includes(q);
  const columns = STATUSES.map((s) => {
    const cards = base.filter((i) => i.status === s.id && match(i));
    return {
      id: s.id,
      label: s.label,
      color: s.color,
      wip: s.wip ?? null,
      count: cards.length,
      bottleneck: s.wip != null && cards.length > s.wip,
      cards: cards.map((c) => cardVM(nodes, c, focusId, scope)),
    };
  });
  return { focusId, breadcrumb: breadcrumb(nodes, focusId), scope, columns };
}

// ── 아웃라인/트리 행(focus 이하 재귀 평탄) ──
export interface OutlineRowVM {
  id: string;
  key: string;
  title: string;
  description: string; // 요건 설명(사람용 부제). body(exec 입력)와 별개.
  depth: number;
  isEpic: boolean;
  type: NodeType;
  status: StatusId;
  assignee: string;
  hasChildren: boolean;
  childCount: number;
  doneCount: number;
  progress: { done: number; total: number; pct: number } | null;
  badge: Badge | null; // 항목 자기 검증 배지
  isDraft: boolean; // 덩어리 부모
  validation: SubValidation | null; // 자손 oxf 집계(그룹·덩어리 감사)
}
export function toOutlineRows(nodes: Node[], focusId: string | null = null): OutlineRowVM[] {
  const rows: OutlineRowVM[] = [];
  const seen = new Set<string>();
  const walk = (pid: string | null, depth: number) => {
    for (const n of childrenOf(nodes, pid)) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      const kids = childrenOf(nodes, n.id);
      // isEpic/타입은 전역 깊이 기준(디자인 _normalize — 전역 루트만 epic). depth 는 들여쓰기용 로컬.
      const gdepth = depthOf(nodes, n.id);
      const isEpic = gdepth === 0;
      rows.push({
        id: n.id,
        key: n.key,
        title: n.title,
        description: n.description ?? "",
        depth,
        isEpic,
        type: effectiveType(n, gdepth),
        status: n.status,
        assignee: n.assignee,
        hasChildren: kids.length > 0,
        childCount: kids.length,
        doneCount: kids.filter((k) => k.status === "done").length,
        progress: subProgress(nodes, n.id),
        badge: n.badge ?? null,
        isDraft: n.isDraft === true,
        validation: subValidation(nodes, n.id),
      });
      walk(n.id, depth + 1);
    }
  };
  walk(focusId ?? null, 0);
  return rows;
}

// ── 간트(전역) ──
export interface GanttRowVM {
  id: string;
  key: string;
  title: string;
  isEpic: boolean;
  status: StatusId;
  leftPct: number;
  widthPct: number;
}
export interface GanttVM {
  rows: GanttRowVM[];
  weeks: { label: L10nLabel; range: string }[];
  todayPct: number;
}
export function toGantt(nodes: Node[]): GanttVM {
  const rows: GanttRowVM[] = [];
  const push = (n: Node, isEpic: boolean) => {
    const sIdx = Math.max(0, dayIdx(n.start, RANGE_START));
    const eIdx = Math.min(TOTAL_DAYS - 1, dayIdx(n.due, RANGE_START));
    rows.push({
      id: n.id,
      key: n.key,
      title: shortTitle(n),
      isEpic,
      status: n.status,
      leftPct: (sIdx / TOTAL_DAYS) * 100,
      widthPct: Math.max(2, ((eIdx - sIdx + 1) / TOTAL_DAYS) * 100),
    });
  };
  for (const epic of childrenOf(nodes, null)) {
    push(epic, true);
    for (const id of descendantIds(nodes, epic.id)) {
      const n = byId(nodes, id);
      if (n) push(n, false);
    }
  }
  const weeks = [];
  for (let w = 0; w < 4; w++) weeks.push({ label: { en: "Jun W" + (w + 1), ko: "6월 " + (w + 1) + "주" } as L10nLabel, range: "6/" + (w * 7 + 1) + " – 6/" + (w * 7 + 7) });
  return { rows, weeks, todayPct: (dayIdx(TODAY, RANGE_START) / TOTAL_DAYS) * 100 };
}

// ── 타임라인(전역) ──
export interface TimelineEventVM {
  id: string;
  key: string;
  title: string;
  from: StatusId;
  to: StatusId;
  by: string;
  at: string;
}
export interface TimelineGroupVM {
  dateLabel: string;
  items: TimelineEventVM[];
}
export function toTimeline(nodes: Node[]): TimelineGroupVM[] {
  const evs: { n: Node; h: Node["history"][number] }[] = [];
  for (const n of workItems(nodes)) for (const hh of n.history) evs.push({ n, h: hh });
  evs.sort((a, b) => (a.h.at < b.h.at ? 1 : a.h.at > b.h.at ? -1 : 0));
  const groups: TimelineGroupVM[] = [];
  for (const { n, h } of evs) {
    const dl = fmtShort(h.at);
    let g = groups.find((x) => x.dateLabel === dl);
    if (!g) {
      g = { dateLabel: dl, items: [] };
      groups.push(g);
    }
    g.items.push({ id: n.id, key: n.key, title: shortTitle(n), from: h.from, to: h.to, by: h.by, at: h.at });
  }
  return groups;
}

// ── 테이블(전역) ──
export interface TableRowVM {
  id: string;
  key: string;
  title: string;
  type: NodeType;
  status: StatusId;
  assignee: string;
  priority: Node["priority"];
  points: number;
  due: string;
}
export function toTable(nodes: Node[], sortKey: SortKey = "key", sortDir: "asc" | "desc" = "asc"): TableRowVM[] {
  const val = (i: Node): number | string => {
    if (sortKey === "status") return STATUS_IDS.indexOf(i.status);
    if (sortKey === "priority") return PRIORITY[i.priority].rank;
    if (sortKey === "points") return i.points;
    if (sortKey === "due") return i.due;
    if (sortKey === "assignee") return i.assignee;
    if (sortKey === "title") return i.title;
    return i.key;
  };
  return workItems(nodes)
    .slice()
    .sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const r = x < y ? -1 : x > y ? 1 : 0;
      return sortDir === "asc" ? r : -r;
    })
    .map((i) => ({
      id: i.id,
      key: i.key,
      title: i.title,
      type: i.type,
      status: i.status,
      assignee: i.assignee,
      priority: i.priority,
      points: i.points,
      due: i.due,
    }));
}

// ── 캘린더(전역, 6월) ──
export interface CalendarDayVM {
  show: boolean;
  day?: number;
  isToday?: boolean;
  items?: { id: string; key: string; status: StatusId }[];
}
export interface CalendarVM {
  weekdays: { ko: string; en: string }[];
  weeks: { days: CalendarDayVM[] }[];
  monthLabel: L10nLabel;
}
export function toCalendar(nodes: Node[]): CalendarVM {
  const weekdays = [
    ["월", "Mon"], ["화", "Tue"], ["수", "Wed"], ["목", "Thu"], ["금", "Fri"], ["토", "Sat"], ["일", "Sun"],
  ].map(([ko, en]) => ({ ko, en }));
  const offset = (new Date(2026, 5, 1).getDay() + 6) % 7; // 월=0
  const byDay: Record<number, Node[]> = {};
  for (const i of workItems(nodes)) {
    const a = i.due.split("-");
    if (+a[1] === 6) (byDay[+a[2]] ||= []).push(i);
  }
  const cells: CalendarDayVM[] = [];
  for (let k = 0; k < offset; k++) cells.push({ show: false });
  for (let d = 1; d <= 30; d++) {
    cells.push({
      show: true,
      day: d,
      isToday: d === 18,
      items: (byDay[d] || []).map((i) => ({ id: i.id, key: i.key, status: i.status })),
    });
  }
  while (cells.length % 7 !== 0) cells.push({ show: false });
  const weeks = [];
  for (let w = 0; w < cells.length / 7; w++) weeks.push({ days: cells.slice(w * 7, w * 7 + 7) });
  return { weekdays, weeks, monthLabel: { en: "June 2026", ko: "2026년 6월" } };
}

// ── 플로우(전역) ──
export interface FlowNodeVM {
  id: StatusId;
  label: L10nLabel;
  color: string;
  count: number;
  wip: number | null;
  bottleneck: boolean;
  pct: number;
}
export interface FlowVM {
  nodes: FlowNodeVM[];
  edges: number[]; // 인접 상태 간 전환 건수(STATUSES 순)
  rework: number;
}
export function toFlow(nodes: Node[]): FlowVM {
  const items = workItems(nodes);
  const allH = items.flatMap((i) => i.history);
  const counts = STATUSES.map((s) => items.filter((i) => i.status === s.id).length);
  const maxCount = Math.max(1, ...counts);
  const edges: number[] = [];
  for (let i = 0; i < STATUSES.length - 1; i++)
    edges.push(allH.filter((hh) => hh.from === STATUSES[i].id && hh.to === STATUSES[i + 1].id).length);
  const ord = (id: StatusId) => STATUS_IDS.indexOf(id);
  const rework = allH.filter((hh) => ord(hh.to) < ord(hh.from)).length;
  return {
    nodes: STATUSES.map((s, idx) => ({
      id: s.id,
      label: s.label,
      color: s.color,
      count: counts[idx],
      wip: s.wip ?? null,
      bottleneck: s.wip != null && counts[idx] > s.wip,
      pct: Math.round((counts[idx] / maxCount) * 100),
    })),
    edges,
    rework,
  };
}

/** 헤드리스 kanban.view.get — 뷰별 투영 디스패치(focus 는 board/outline/tree 만 적용). */
export function projectView(
  nodes: Node[],
  view: ViewId,
  focusId: string | null = null,
  opts: { scope?: BoardScope; search?: string; sortKey?: SortKey; sortDir?: "asc" | "desc" } = {},
): unknown {
  switch (view) {
    case "board":
      return toBoard(nodes, focusId, opts.scope ?? "direct", opts.search ?? "");
    case "outline":
    case "tree":
      return { focusId, breadcrumb: breadcrumb(nodes, focusId), rows: toOutlineRows(nodes, focusId) };
    case "gantt":
      return toGantt(nodes);
    case "timeline":
      return toTimeline(nodes);
    case "table":
      return toTable(nodes, opts.sortKey ?? "key", opts.sortDir ?? "asc");
    case "calendar":
      return toCalendar(nodes);
    default:
      return null;
  }
}

export { rootOf, hasChildren };
