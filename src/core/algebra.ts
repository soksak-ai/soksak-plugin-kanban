// 재귀 트리 연산 대수 — 전부 순수(Node[] → Node[]). 구조는 parentId + order 만 바꾼다.
// 모든 변이는 normalizeOrders 로 끝나 I2(형제 order 0..n-1 연속)를 보장한다.
// 위치 지정은 분수 order(예: 0.5)로 끼워넣은 뒤 normalize 가 정수로 재배열한다.
import type { Node, StatusId, PriorityId } from "@/types";
import { byId, childrenOf, descendantIds, isAncestor } from "@/core/tree";
import { PRIORITY, STATUS_IDS } from "@/refs";

/** 부모 그룹마다 order 를 0..n-1 정수로 재배열(상대 순서 보존). 모든 op 의 종결자. */
export function normalizeOrders(nodes: Node[]): Node[] {
  const groups = new Map<string | null, Node[]>();
  for (const n of nodes) {
    const k = n.parentId;
    const g = groups.get(k);
    if (g) g.push(n);
    else groups.set(k, [n]);
  }
  const orderMap = new Map<string, number>();
  for (const [, group] of groups) {
    group.sort((a, b) => a.order - b.order || a.created - b.created);
    group.forEach((n, i) => orderMap.set(n.id, i));
  }
  return nodes.map((n) => {
    const o = orderMap.get(n.id);
    return o === n.order ? n : { ...n, order: o ?? n.order };
  });
}

const patch = (nodes: Node[], id: string, fn: (n: Node) => Node): Node[] =>
  nodes.map((n) => (n.id === id ? fn(n) : n));

/** newNode 를 parentId 자식으로 삽입. afterId 지정 시 그 뒤, 아니면 끝에. */
export function insertNode(nodes: Node[], newNode: Node, afterId?: string): Node[] {
  const siblings = childrenOf(nodes, newNode.parentId);
  let order: number;
  if (afterId) {
    const a = siblings.find((s) => s.id === afterId);
    order = a ? a.order + 0.5 : siblings.length;
  } else {
    order = siblings.length;
  }
  return normalizeOrders([...nodes, { ...newNode, order }]);
}

/** Tab — 직전 형제의 자식으로(끝에 append). 직전 형제 없으면 무변경. */
export function indent(nodes: Node[], id: string): Node[] {
  const node = byId(nodes, id);
  if (!node) return nodes;
  const siblings = childrenOf(nodes, node.parentId);
  const k = siblings.findIndex((s) => s.id === id);
  if (k <= 0) return nodes; // 직전 형제 없음
  const prev = siblings[k - 1];
  const prevKids = childrenOf(nodes, prev.id);
  return normalizeOrders(patch(nodes, id, (n) => ({ ...n, parentId: prev.id, order: prevKids.length })));
}

/**
 * Shift+Tab — 한 단계만 위로(조부모 밑), 옛 부모 바로 뒤에 놓고, 자식은 데려가며,
 * 뒤따르는 형제는 이 노드의 자식으로 흡수. 맨 아래로 가지 않음(Workflowy).
 * 골든: 1>(1-1>1-1-1),2 에서 outdent(1-1) → 1, 1-1>1-1-1, 2
 */
export function outdent(nodes: Node[], id: string): Node[] {
  const node = byId(nodes, id);
  if (!node || node.parentId == null) return nodes; // 최상위는 더 못 올림
  const oldParent = byId(nodes, node.parentId)!;
  const newParentId = oldParent.parentId; // 조부모(null 가능)
  const oldSiblings = childrenOf(nodes, node.parentId);
  const k = oldSiblings.findIndex((s) => s.id === id);
  const following = oldSiblings.slice(k + 1); // 뒤따르는 형제
  const nodeKidCount = childrenOf(nodes, id).length; // 흡수 형제는 기존 자식 뒤에

  let next = patch(nodes, id, (n) => ({
    ...n,
    parentId: newParentId,
    order: oldParent.order + 0.5, // 옛 부모 바로 뒤
  }));
  following.forEach((f, i) => {
    next = patch(next, f.id, (n) => ({ ...n, parentId: id, order: nodeKidCount + i }));
  });
  return normalizeOrders(next);
}

/** 같은 부모 안에서 position(0-based)으로 재배치. */
export function reorder(nodes: Node[], id: string, position: number): Node[] {
  const node = byId(nodes, id);
  if (!node) return nodes;
  const siblings = childrenOf(nodes, node.parentId).filter((s) => s.id !== id);
  return normalizeOrders(patch(nodes, id, (n) => ({ ...n, order: orderForPosition(siblings, position) })));
}

/** 다른 부모로 이동(reparent) + 위치. 순환(자기/자손 밑) 거부. */
export function moveNode(
  nodes: Node[],
  id: string,
  newParentId: string | null,
  position?: number,
): Node[] {
  const node = byId(nodes, id);
  if (!node) return nodes;
  if (newParentId != null) {
    if (newParentId === id) return nodes;
    if (isAncestor(nodes, id, newParentId)) return nodes; // 자손 밑으로 → 순환
  }
  const siblings = childrenOf(nodes, newParentId).filter((s) => s.id !== id);
  const pos = position == null ? siblings.length : position;
  return normalizeOrders(
    patch(nodes, id, (n) => ({ ...n, parentId: newParentId, order: orderForPosition(siblings, pos) })),
  );
}

/** id 삭제. promoteChildren=true 면 자식을 id 자리로 승격, 아니면 서브트리 통째 삭제. */
export function removeNode(nodes: Node[], id: string, promoteChildren = false): Node[] {
  const node = byId(nodes, id);
  if (!node) return nodes;
  if (promoteChildren) {
    const kids = childrenOf(nodes, id);
    let next = nodes.filter((n) => n.id !== id);
    kids.forEach((kid, i) => {
      next = patch(next, kid.id, (n) => ({ ...n, parentId: node.parentId, order: node.order + (i + 1) * 0.001 }));
    });
    return normalizeOrders(next);
  }
  const remove = new Set<string>([id, ...descendantIds(nodes, id)]);
  return normalizeOrders(nodes.filter((n) => !remove.has(n.id)));
}

/** 상태 변경(보드 이동) — status + history. order 불변. 같은 상태면 무변경. */
export function setStatus(
  nodes: Node[],
  id: string,
  status: StatusId,
  by: string,
  today: string,
): Node[] {
  const node = byId(nodes, id);
  if (!node || node.status === status) return nodes;
  return patch(nodes, id, (n) => ({
    ...n,
    status,
    history: [...n.history, { from: n.status, to: status, by, at: today }],
  }));
}

/** 보드 이동 — 상태 변경 + 같은 (부모) 형제 중 position 으로 재배치. */
export function boardMove(
  nodes: Node[],
  id: string,
  status: StatusId,
  by: string,
  today: string,
  position?: number,
): Node[] {
  let next = setStatus(nodes, id, status, by, today);
  if (position != null) next = reorder(next, id, position);
  return next;
}

export type SortKey = "key" | "title" | "priority" | "points" | "due" | "status" | "assignee";

/** parentId 자식들을 by 기준 정렬해 order 영속. */
export function sortChildren(
  nodes: Node[],
  parentId: string | null,
  by: SortKey,
  dir: "asc" | "desc" = "asc",
): Node[] {
  const kids = childrenOf(nodes, parentId);
  const sorted = [...kids].sort((a, b) => cmp(a, b, by) * (dir === "desc" ? -1 : 1));
  let next = nodes;
  sorted.forEach((n, i) => {
    next = patch(next, n.id, (x) => ({ ...x, order: i }));
  });
  return normalizeOrders(next);
}

// ── 내부 ──
function orderForPosition(siblings: Node[], position: number): number {
  const pos = Math.max(0, Math.min(position, siblings.length));
  if (siblings.length === 0) return 0;
  if (pos === 0) return siblings[0].order - 0.5;
  if (pos >= siblings.length) return siblings[siblings.length - 1].order + 0.5;
  return (siblings[pos - 1].order + siblings[pos].order) / 2;
}

function sortVal(n: Node, by: SortKey): number | string {
  switch (by) {
    case "status":
      return STATUS_IDS.indexOf(n.status);
    case "priority":
      return PRIORITY[n.priority as PriorityId].rank;
    case "points":
      return n.points;
    case "due":
      return n.due;
    case "assignee":
      return n.assignee;
    default:
      return n[by];
  }
}
function cmp(a: Node, b: Node, by: SortKey): number {
  const x = sortVal(a, by);
  const y = sortVal(b, by);
  return x < y ? -1 : x > y ? 1 : 0;
}
