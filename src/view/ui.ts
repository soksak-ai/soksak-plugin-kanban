// 뷰 공통 스타일 헬퍼 — 디자인의 style 빌더 포팅(CSSProperties 반환). 색은 refs 로 해석.
import type { CSSProperties } from "react";
import type { Node, StatusId, NodeType, PriorityId } from "@/types";
import { USERS, TYPES, STATUSES, PRIORITY } from "@/refs";

export function hexA(h: string, a: number): string {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export const sMeta = (id: StatusId) => STATUSES.find((s) => s.id === id)!;
export const userMeta = (id: string) => USERS[id] ?? { name: id, initials: (id || "?").slice(0, 2).toUpperCase(), color: "#8a93a4" };

export function avatar(uid: string, size = 22): CSSProperties {
  const u = userMeta(uid);
  return {
    width: size,
    height: size,
    borderRadius: "50%",
    background: u.color,
    color: "#fff",
    fontSize: size * 0.42,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "none",
    fontFamily: "var(--mono)",
  };
}
export function typeBadge(type: NodeType): CSSProperties {
  const t = TYPES[type];
  return {
    width: 18,
    height: 18,
    borderRadius: 5,
    background: t.color,
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "none",
  };
}
export function statusChip(id: StatusId): CSSProperties {
  const m = sMeta(id);
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "2px 9px",
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 600,
    background: hexA(m.color, 0.14),
    color: m.color,
    flex: "none",
  };
}
export function prDot(p: PriorityId): CSSProperties {
  return { width: 8, height: 8, borderRadius: 2, background: PRIORITY[p].color, flex: "none", transform: "rotate(45deg)" };
}
export function ptsBadge(): CSSProperties {
  return {
    marginLeft: "auto",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "var(--mono)",
    color: "var(--text-2)",
    background: "var(--surface-3)",
    borderRadius: 6,
    padding: "1px 7px",
    flex: "none",
  };
}
export const initials = (uid: string) => userMeta(uid).initials;
export const userName = (uid: string) => userMeta(uid).name;
export const typeLetter = (type: NodeType) => TYPES[type].letter;
export const shortTitle = (n: Pick<Node, "title" | "key">) => (n.title || "").split(" · ")[0] || n.key;

/** 루트 — 플랫폼 테마 변수(var(--bg)/var(--text)) 사용. 색/폰트는 .kanban-root 가 플랫폼서 상속. */
export function rootStyle(): CSSProperties {
  return {
    background: "var(--bg)",
    color: "var(--text)",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    letterSpacing: "-.01em",
  };
}
