// 스토어 → React 구독 훅. useSyncExternalStore 로 nodes 변경 시 재렌더(같은 ref 면 스킵).
import { useSyncExternalStore, useCallback } from "react";
import type { Node } from "@/types";
import type { KanbanStore } from "@/store";

const EMPTY: Node[] = [];

export function useNodes(store: KanbanStore | null): Node[] {
  const subscribe = useCallback((cb: () => void) => (store ? store.subscribe(cb) : () => {}), [store]);
  const getSnapshot = useCallback(() => (store ? store.get() : EMPTY), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
