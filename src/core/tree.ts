// 순수 트리 프리미티브 — Node[] 위에서 parentId(부모) + order(형제 순서)만으로 동작.
// 부수효과 없음. 모든 함수는 입력 Node[] 를 변형하지 않는다.
import type { Node, NodeType } from "@/types";

export function byId(nodes: Node[], id: string | null): Node | null {
  if (id == null) return null;
  return nodes.find((n) => n.id === id) ?? null;
}

/** 같은 parentId 형제를 order 오름차순으로. */
export function childrenOf(nodes: Node[], parentId: string | null): Node[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.created - b.created);
}

export function hasChildren(nodes: Node[], id: string): boolean {
  return nodes.some((n) => n.parentId === id);
}

/** 루트(parentId==null)로부터의 깊이. 최상위=0. 순환 방어. */
export function depthOf(nodes: Node[], id: string): number {
  let d = 0;
  let cur = byId(nodes, id);
  const seen = new Set<string>();
  while (cur && cur.parentId != null && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId(nodes, cur.parentId);
    d++;
  }
  return d;
}

/** id 를 품은 최상위(루트) 노드. id 가 최상위면 자기 자신. */
export function rootOf(nodes: Node[], id: string): Node | null {
  let cur = byId(nodes, id);
  const seen = new Set<string>();
  while (cur && cur.parentId != null && !seen.has(cur.id)) {
    seen.add(cur.id);
    const p = byId(nodes, cur.parentId);
    if (!p) break;
    cur = p;
  }
  return cur;
}

/** id 의 모든 자손 id(자신 제외). */
export function descendantIds(nodes: Node[], id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of nodes) {
      if (n.parentId === cur && !seen.has(n.id)) {
        seen.add(n.id);
        out.push(n.id);
        stack.push(n.id);
      }
    }
  }
  return out;
}

/** ancestorId 가 nodeId 의 조상(또는 동일)인가. 순환 방어. */
export function isAncestor(nodes: Node[], ancestorId: string, nodeId: string): boolean {
  let cur = byId(nodes, nodeId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    if (cur.id === ancestorId) return true;
    seen.add(cur.id);
    cur = cur.parentId != null ? byId(nodes, cur.parentId) : null;
  }
  return false;
}

export interface FlatRow {
  node: Node;
  depth: number;
}

/** rootId 이하 DFS 평탄화(부모 먼저, 형제는 order 순). depth 동반. */
export function flatten(nodes: Node[], rootId: string | null = null): FlatRow[] {
  const out: FlatRow[] = [];
  const seen = new Set<string>();
  const walk = (pid: string | null, depth: number) => {
    for (const child of childrenOf(nodes, pid)) {
      if (seen.has(child.id)) continue; // 순환 방어
      seen.add(child.id);
      out.push({ node: child, depth });
      walk(child.id, depth + 1);
    }
  };
  walk(rootId, 0);
  return out;
}

/** focusId 에서 루트까지의 조상 체인(루트→focus 순). focus=null 이면 빈 배열. */
export function focusChain(nodes: Node[], focusId: string | null): Node[] {
  const arr: Node[] = [];
  let cur = focusId != null ? byId(nodes, focusId) : null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    arr.unshift(cur);
    cur = cur.parentId != null ? byId(nodes, cur.parentId) : null;
  }
  return arr;
}

/** 자손 진행률(done/total). 자손 없으면 null. */
export function subProgress(
  nodes: Node[],
  id: string,
): { done: number; total: number; pct: number } | null {
  const ds = descendantIds(nodes, id);
  if (!ds.length) return null;
  const done = ds.filter((x) => {
    const n = byId(nodes, x);
    return n != null && n.status === "done";
  }).length;
  return { done, total: ds.length, pct: Math.round((done / ds.length) * 100) };
}

/**
 * 표시용 실효 타입 — 디자인 _normalize 규칙: 최상위(depth 0)는 항상 epic(E),
 * 최상위가 아닌데 저장 타입이 epic 이면 task 로 강등. 그 외 저장 타입 유지.
 * (저장 type 은 보존하고 표시 시점에만 계산 — reparent 쓰기 증폭 회피.)
 */
export function effectiveType(node: Node, depth: number): NodeType {
  if (depth === 0) return "epic";
  if (node.type === "epic") return "task";
  return node.type;
}
