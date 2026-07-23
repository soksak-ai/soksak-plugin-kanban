// 툴바 행 계약(코어 PLUGIN-CONTRACT §Toolbar row) — 툴바는 선택 표면이지만, 존재하면
// 치수는 테마 토큰(--toolbar-h/--toolbar-pad-x)에서 소비한다. 자체 수치 재창조 금지.
import { describe, expect, it } from "vitest";
import { TOOLBAR_BAR } from "./toolbarContract";

describe("toolbar row contract", () => {
  it("뷰 전환 행은 테마 툴바 토큰을 소비한다", () => {
    expect(String(TOOLBAR_BAR.height)).toMatch(/var\(--toolbar-h/);
    expect(String(TOOLBAR_BAR.padding)).toMatch(/0 var\(--toolbar-pad-x/);
  });
});
