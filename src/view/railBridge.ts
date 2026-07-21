// 레일 브리지 — 이 플러그인의 rail 뷰(tree/detail)는 컨테이너만 소유·등록하고, 결부된 칸반
// 콘텐츠 뷰(App)가 트리·이슈 상세를 React 포털로 그 컨테이너에 그린다. 상태는 App 이 계속
// 소유한다(이중 진실 0). 키 = 결부 콘텐츠 뷰 id(rail ctx.boundViewId ↔ 콘텐츠 ctx.viewId —
// per-view 인스턴스라 1:1). 레일 없는 호스트(구코어)는 등록이 없어 기존 배치(모달) 그대로.

export type RailSlot = "tree" | "detail";

const containers = new Map<string, Partial<Record<RailSlot, HTMLElement>>>();
const subs = new Map<string, Set<() => void>>();

function notify(viewId: string) {
  for (const fn of subs.get(viewId) ?? []) fn();
}

// rail 뷰 마운트가 자기 컨테이너를 등록한다. 반환 = 해제(언마운트 시). 같은 슬롯의 새 등록이
// 이기고, 낡은 해제는 새 컨테이너를 몰아내지 못한다.
export function registerRailContainer(
  viewId: string,
  slot: RailSlot,
  el: HTMLElement,
): () => void {
  const entry = containers.get(viewId) ?? {};
  entry[slot] = el;
  containers.set(viewId, entry);
  notify(viewId);
  return () => {
    const cur = containers.get(viewId);
    if (!cur || cur[slot] !== el) return;
    delete cur[slot];
    if (!cur.tree && !cur.detail) containers.delete(viewId);
    notify(viewId);
  };
}

export function railContainer(
  viewId: string | null | undefined,
  slot: RailSlot,
): HTMLElement | null {
  if (!viewId) return null;
  return containers.get(viewId)?.[slot] ?? null;
}

// App 이 useSyncExternalStore 로 구독한다. 결부 id 가 null(구코어)이면 침묵.
export function subscribeRail(viewId: string | null | undefined, fn: () => void): () => void {
  if (!viewId) return () => {};
  let set = subs.get(viewId);
  if (!set) {
    set = new Set();
    subs.set(viewId, set);
  }
  set.add(fn);
  return () => {
    const s = subs.get(viewId);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) subs.delete(viewId);
  };
}
