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

export interface Skin {
  name: string;
  sans: string;
  mono: string;
  accentSwatch: string;
  light: Record<string, string>;
  dark: Record<string, string>;
}
export const SKINS: Skin[] = [
  {
    name: "Clean",
    sans: "'IBM Plex Sans',system-ui,sans-serif",
    mono: "'IBM Plex Mono',monospace",
    accentSwatch: "#5b5bf0",
    light: { "--bg": "#f1f3f6", "--surface": "#ffffff", "--surface-2": "#e9ecf1", "--surface-3": "#e1e5ec", "--border": "#e3e7ee", "--border-2": "#d3d9e3", "--text": "#161a23", "--text-2": "#5a6373", "--text-3": "#8a93a4", "--accent": "#5b5bf0", "--accent-soft": "rgba(91,91,240,.10)", "--shadow": "0 1px 2px rgba(20,24,38,.05)", "--shadow-lg": "0 12px 40px rgba(20,24,38,.16)", "--grid": "rgba(20,24,38,.05)", "--mono": "'IBM Plex Mono',monospace", "--r-card": "10px", "--r-col": "13px" },
    dark: { "--bg": "#0d0f14", "--surface": "#171a21", "--surface-2": "#13161c", "--surface-3": "#1d212a", "--border": "#262b35", "--border-2": "#323845", "--text": "#e7eaf0", "--text-2": "#9aa3b2", "--text-3": "#69707e", "--accent": "#7d7dff", "--accent-soft": "rgba(125,125,255,.14)", "--shadow": "0 1px 2px rgba(0,0,0,.4)", "--shadow-lg": "0 16px 48px rgba(0,0,0,.5)", "--grid": "rgba(255,255,255,.05)", "--mono": "'IBM Plex Mono',monospace", "--r-card": "10px", "--r-col": "13px" },
  },
  {
    name: "Editorial",
    sans: "'Spline Sans',system-ui,sans-serif",
    mono: "'Spline Sans Mono',monospace",
    accentSwatch: "#bb4d2e",
    light: { "--bg": "#efe9dd", "--surface": "#fbf8f1", "--surface-2": "#e9e1d2", "--surface-3": "#e0d7c4", "--border": "#ddd3c0", "--border-2": "#cabfa8", "--text": "#2a2620", "--text-2": "#6b6149", "--text-3": "#9a8f76", "--accent": "#bb4d2e", "--accent-soft": "rgba(187,77,46,.10)", "--shadow": "none", "--shadow-lg": "0 12px 40px rgba(70,50,20,.18)", "--grid": "rgba(70,55,30,.07)", "--mono": "'Spline Sans Mono',monospace", "--r-card": "4px", "--r-col": "6px" },
    dark: { "--bg": "#16130d", "--surface": "#211d15", "--surface-2": "#1a1610", "--surface-3": "#2a251b", "--border": "#342e22", "--border-2": "#473f2f", "--text": "#ece4d4", "--text-2": "#a99e86", "--text-3": "#776e58", "--accent": "#e08a5f", "--accent-soft": "rgba(224,138,95,.14)", "--shadow": "none", "--shadow-lg": "0 16px 48px rgba(0,0,0,.55)", "--grid": "rgba(255,245,220,.06)", "--mono": "'Spline Sans Mono',monospace", "--r-card": "4px", "--r-col": "6px" },
  },
  {
    name: "Bold",
    sans: "'Plus Jakarta Sans',system-ui,sans-serif",
    mono: "'JetBrains Mono',monospace",
    accentSwatch: "#6d28d9",
    light: { "--bg": "#edeef3", "--surface": "#ffffff", "--surface-2": "#e6e7ef", "--surface-3": "#dcdded", "--border": "#e0e1ec", "--border-2": "#cccee0", "--text": "#0b0b14", "--text-2": "#565a70", "--text-3": "#8a8ea8", "--accent": "#6d28d9", "--accent-soft": "rgba(109,40,217,.10)", "--shadow": "0 2px 6px rgba(30,20,60,.10)", "--shadow-lg": "0 18px 50px rgba(30,20,60,.22)", "--grid": "rgba(20,15,40,.06)", "--mono": "'JetBrains Mono',monospace", "--r-card": "15px", "--r-col": "18px" },
    dark: { "--bg": "#08070e", "--surface": "#15131f", "--surface-2": "#100e18", "--surface-3": "#1e1b2c", "--border": "#2a2640", "--border-2": "#3a3556", "--text": "#ededf7", "--text-2": "#9c98b8", "--text-3": "#6a6688", "--accent": "#a78bfa", "--accent-soft": "rgba(167,139,250,.16)", "--shadow": "0 2px 6px rgba(0,0,0,.5)", "--shadow-lg": "0 18px 50px rgba(0,0,0,.6)", "--grid": "rgba(200,190,255,.06)", "--mono": "'JetBrains Mono',monospace", "--r-card": "15px", "--r-col": "18px" },
  },
];

// 간트/캘린더 기준 스프린트 범위(디자인 고정값).
export const RANGE_START = "2026-06-01";
export const RANGE_END = "2026-06-28";
export const TODAY = "2026-06-18";
export const TOTAL_DAYS = 28;

export const STATUS_IDS: StatusId[] = STATUSES.map((s) => s.id);
