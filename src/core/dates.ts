// 날짜 유틸 — 디자인 helper 포팅(로컬 타임존 기준 일수 계산).
import type { Node } from "@/types";

export function parseDate(d: string): Date {
  const a = d.split("-").map(Number);
  return new Date(a[0], a[1] - 1, a[2]);
}
export function dayIdx(d: string, rangeStart: string): number {
  return Math.round((parseDate(d).getTime() - parseDate(rangeStart).getTime()) / 86400000);
}
export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);
}
export function fmtShort(d: string): string {
  const a = d.split("-");
  return +a[1] + "/" + +a[2];
}

/** 정체 정보 — 마지막 전환(없으면 start) 이후 경과일, done 아니고 4일 초과면 stale. */
export function staleInfo(node: Node, today: string): { days: number; stale: boolean } {
  const last = node.history.length ? node.history[node.history.length - 1].at : node.start;
  const days = Math.max(0, diffDays(today, last));
  return { days, stale: node.status !== "done" && days > 4 };
}
