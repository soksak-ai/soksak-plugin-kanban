import type { CSSProperties } from "react";

// 툴바 행 계약(코어 PLUGIN-CONTRACT §Toolbar row) — 툴바는 선택 표면이지만, 존재하면
// 치수는 테마 토큰(--toolbar-h/--toolbar-pad-x)에서 소비한다. 자체 수치 재창조 금지.
export const TOOLBAR_BAR: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  height: "var(--toolbar-h, 28px)",
  padding: "0 var(--toolbar-pad-x, 8px)",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface)",
  position: "sticky",
  top: 0,
  zIndex: 30,
};
