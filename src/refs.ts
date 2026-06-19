// 참조 상수 — 디자인(Kanban Flow Board.dc.html)에서 그대로 포팅. 컬럼(STATUSES)은 고정 5개.
import type { StatusId, NodeType, PriorityId } from "@/types";

export interface StatusMeta {
  id: StatusId;
  label: string;
  kr: string;
  color: string;
  wip?: number;
}
export const STATUSES: StatusMeta[] = [
  { id: "backlog", label: "Backlog", kr: "백로그", color: "#94a3b8" },
  { id: "todo", label: "To Do", kr: "예정", color: "#3b82f6" },
  { id: "inprogress", label: "In Progress", kr: "진행 중", color: "#f59e0b", wip: 3 },
  { id: "review", label: "In Review", kr: "리뷰", color: "#8b5cf6", wip: 3 },
  { id: "done", label: "Done", kr: "완료", color: "#10b981" },
];

export interface UserMeta {
  name: string;
  initials: string;
  color: string;
}
export const USERS: Record<string, UserMeta> = {
  JH: { name: "김지훈", initials: "JH", color: "#5b5bf0" },
  SP: { name: "Sarah Park", initials: "SP", color: "#ec4899" },
  DY: { name: "이도윤", initials: "DY", color: "#14b8a6" },
  AK: { name: "Alex Kim", initials: "AK", color: "#f59e0b" },
  SY: { name: "박서연", initials: "SY", color: "#8b5cf6" },
  TL: { name: "Tom Lee", initials: "TL", color: "#ef4444" },
  me: { name: "나 (You)", initials: "ME", color: "#0ea5e9" },
};

export interface PriorityMeta {
  kr: string;
  label: string;
  color: string;
  rank: number;
}
export const PRIORITY: Record<PriorityId, PriorityMeta> = {
  highest: { kr: "최상", label: "Highest", color: "#dc2626", rank: 4 },
  high: { kr: "높음", label: "High", color: "#f97316", rank: 3 },
  medium: { kr: "보통", label: "Medium", color: "#eab308", rank: 2 },
  low: { kr: "낮음", label: "Low", color: "#3b82f6", rank: 1 },
};

export interface TypeMeta {
  letter: string;
  color: string;
}
export const TYPES: Record<NodeType, TypeMeta> = {
  epic: { letter: "E", color: "#8b5cf6" },
  story: { letter: "S", color: "#22c55e" },
  task: { letter: "T", color: "#3b82f6" },
  bug: { letter: "B", color: "#ef4444" },
};

// 간트/캘린더 기준 스프린트 범위(디자인 고정값).
export const RANGE_START = "2026-06-01";
export const RANGE_END = "2026-06-28";
export const TODAY = "2026-06-18";
export const TOTAL_DAYS = 28;

export const STATUS_IDS: StatusId[] = STATUSES.map((s) => s.id);
