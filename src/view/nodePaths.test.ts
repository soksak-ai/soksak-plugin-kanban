import { describe, it, expect } from "vitest";
import type { Badge } from "@/types";
import { badgeNodePath, auditNodePath, BADGE_LATIN } from "@/view/nodePaths";

// 호스트 계약 복제(vsterm-tauri src/commands/address.ts NODE_PATH_RE).
// 소문자 [a-z0-9] 시작 + [a-z0-9.-] 세그먼트 + '/' 구분. 대문자·한글·_ 위반 → 호스트가 침묵 스킵.
const NODE_PATH_RE = /^[a-z0-9][a-z0-9.-]*(\/[a-z0-9][a-z0-9.-]*)*$/;
const ALL_BADGES: Badge[] = ["검수전", "o", "x", "f"];

describe("드래프트 배지 DOM 노드 경로 — NODE_PATH_RE 준수(대문자/한글 함정 가드)", () => {
  it("badgeNodePath: 검수전→pending 라틴 매핑 + 키 소문자", () => {
    expect(badgeNodePath("WMP-100", "검수전")).toBe("badge/wmp-100/pending");
    expect(badgeNodePath("WMP-100", "o")).toBe("badge/wmp-100/o");
    expect(badgeNodePath("WMP-100", "x")).toBe("badge/wmp-100/x");
    expect(badgeNodePath("WMP-100", "f")).toBe("badge/wmp-100/f");
  });

  it("badge 경로는 전부 NODE_PATH_RE 유효(한글/대문자 0)", () => {
    for (const b of ALL_BADGES) {
      const p = badgeNodePath("WMP-12", b);
      expect(NODE_PATH_RE.test(p)).toBe(true);
      expect(p).toBe(p.toLowerCase()); // 대문자 함정 가드
    }
  });

  it("BADGE_LATIN: 한글 badge 만 라틴 치환, o/x/f 는 그대로", () => {
    expect(BADGE_LATIN["검수전"]).toBe("pending");
    expect(BADGE_LATIN.o).toBe("o");
    expect(BADGE_LATIN.f).toBe("f");
  });

  it("auditNodePath: 집계 p.o.x.f 인코딩 + regex 유효 + f>0 폐기 파싱", () => {
    const v = { pending: 0, o: 3, x: 1, f: 1, total: 5, discard: true };
    const p = auditNodePath("WMP-100", v);
    expect(p).toBe("audit/wmp-100/p0.o3.x1.f1");
    expect(NODE_PATH_RE.test(p)).toBe(true);
    // DOM 검증: 마지막 세그먼트에서 f 카운트 파싱 → 폐기(f>0).
    const fseg = p.split("/")[2];
    expect(fseg.includes("f1")).toBe(true);
  });

  it("uuid 키(대문자 섞임)도 소문자화 후 regex 유효", () => {
    const p = badgeNodePath("A1B2-C3D4-9F", "o");
    expect(NODE_PATH_RE.test(p)).toBe(true);
    expect(p).toBe("badge/a1b2-c3d4-9f/o");
  });
});
