// C2 투명성 — DOM 축 conformance. 뷰의 조작 요소는 ui.tree/ui.input.click 로 주소지정
// 가능해야 한다. 뷰를 가진 플러그인은 contributes.nodes 를 선언하고 그 노드를 실제 DOM
// 요소에 data-node 로 배선한다(선례: soksak-plugin-activity, soksak-plugin-git-history).
// 검사 축:
//   ① 뷰 보유 → contributes.nodes 비어 있지 않다(view-nodes 규칙)
//   ② 선언 ≡ 원장 — plugin.json contributes.nodes ↔ nodePaths NODE_IDS(양방향)
//   ③ 원장 각 노드가 뷰 소스에 data-node 로 배선된다(빌더가 뷰에서 참조된다)
//   ④ 배선이 빌드 산출물(main.js)에도 있다 — 실행 번들이 노드를 노출한다
//   ⑤ 노드 경로가 호스트 계약(NODE_PATH_RE)을 따른다
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  NODE_IDS,
  NEW_ISSUE_NODE,
  tabNodePath,
  cardNodePath,
  rowNodePath,
  badgeNodePath,
  auditNodePath,
} from "@/view/nodePaths";

const root = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(readFileSync(root + "plugin.json", "utf8")) as {
  contributes?: { views?: unknown[]; nodes?: Array<{ id: string }> };
};
const read = (p: string) => readFileSync(root + p, "utf8");
const bundle = read("main.js");

// 각 노드 id → 배선 증거(뷰 소스가 이 빌더/상수를 data-node 로 참조).
const WIRING: Record<string, { file: string; token: string }> = {
  tab: { file: "src/view/App.tsx", token: "tabNodePath" },
  "new-issue": { file: "src/view/App.tsx", token: "NEW_ISSUE_NODE" },
  card: { file: "src/view/Board.tsx", token: "cardNodePath" },
  row: { file: "src/view/Outline.tsx", token: "rowNodePath" },
  badge: { file: "src/view/badges.tsx", token: "badgeNodePath" },
  audit: { file: "src/view/badges.tsx", token: "auditNodePath" },
};

// 호스트 계약 복제(vsterm-tauri src/commands/address.ts NODE_PATH_RE).
const NODE_PATH_RE = /^[a-z0-9][a-z0-9.-]*(\/[a-z0-9][a-z0-9.-]*)*$/;

const declared = (manifest.contributes?.nodes ?? []).map((n) => n.id).sort();
const registry = [...NODE_IDS].sort();

describe("C2 DOM 축 — 뷰의 조작 요소는 노드로 노출된다", () => {
  it("① 뷰 보유 → contributes.nodes 비어 있지 않다 (view-nodes 규칙)", () => {
    expect((manifest.contributes?.views ?? []).length).toBeGreaterThan(0);
    expect(declared.length).toBeGreaterThan(0);
  });

  it("② 선언 ≡ 원장 — plugin.json contributes.nodes ↔ NODE_IDS (양방향)", () => {
    expect(declared).toEqual(registry);
  });

  it("③ 원장 각 노드가 뷰에 data-node 로 배선된다", () => {
    for (const id of NODE_IDS) {
      const w = WIRING[id];
      expect(w, `no wiring mapping for node '${id}'`).toBeTruthy();
      const src = read(w.file);
      // 빌더/상수가 그 파일에서 참조되고, 파일이 data-node 를 실제로 배선한다.
      expect(src, `${id}: ${w.token} not referenced in ${w.file}`).toContain(w.token);
      expect(src, `${id}: ${w.file} emits no data-node`).toContain("data-node");
    }
  });

  it("④ 배선이 빌드 산출물(main.js)에도 있다", () => {
    expect(bundle).toContain("data-node");
    for (const id of NODE_IDS) expect(bundle, `bundle missing node '${id}'`).toContain(id);
  });

  it("⑤ 노드 경로가 호스트 계약(NODE_PATH_RE)을 따른다", () => {
    const samples = [
      tabNodePath("outline"),
      NEW_ISSUE_NODE,
      cardNodePath("WMP-100"),
      rowNodePath("WMP-12"),
      badgeNodePath("WMP-100", "검수전"),
      auditNodePath("WMP-100", { pending: 0, o: 3, x: 1, f: 1, total: 5, discard: true }),
    ];
    for (const s of samples) {
      expect(NODE_PATH_RE.test(s), `invalid node path: ${s}`).toBe(true);
      expect(s).toBe(s.toLowerCase());
    }
    // 원장 base id 자체도 계약을 따른다(소문자·하이픈).
    for (const id of NODE_IDS) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});
