// soksak-plugin-kanban 드래프트 트리 시각 검증 — Phase 5 e2e 도구(골격).
// 목적: 워크플로 draft 발행 후 "덩어리(isDraft) > 그룹(category) > 항목(oxf 배지)" 트리와
//       항목 oxf 배지·덩어리 감사 집계가 실제 보드에 그려지는지 확인한다.
// 3중 교차검증:
//   (1) 헤드리스 데이터 — node.list/get + view.get(outline) 로 모델·투영(배지/집계/계보) 확인.
//   (2) DOM 노출 — ui.tree 로 행(data-node "row/<key소문자>")이 실제 렌더됐는지 확인(코어 규약, PLUGINS.md).
//   (3) 시각 — window.snapshot 으로 PNG 캡처(사람 눈검사·회귀 스냅샷).
// 실행(통합 후 앱 구동 상태): node scripts/e2e/draft-visual.mjs
//   - 기본은 SYNTHETIC 드래프트를 직접 만들어 렌더 파이프라인을 증명한다(워크플로 없이도 동작).
//   - Phase 5 실통합: --emitted 플래그로 SYNTHETIC 생성을 건너뛰고, 워크플로가 이미 발행한
//     드래프트(isDraft 노드)를 찾아 그대로 검증한다(아래 TODO).
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLUGIN_ID = "soksak-plugin-kanban";
const P = `plugin.${PLUGIN_ID}.`;
const SOCKET = process.env.SOKSAK_SOCKET || path.join(os.homedir(), ".soksak", "com.soksak.dev.sock");
const USE_EMITTED = process.argv.includes("--emitted"); // 워크플로 발행 트리 검증(SYNTHETIC 생략)
const SHOT_PATH = process.env.SNAPSHOT_PATH || "/tmp/soksak/draft-tree.png";

let sock;
let rbuf = "";
let nextId = 1;
const pending = new Map();

function connect() {
  return new Promise((resolve, reject) => {
    sock = net.connect(SOCKET);
    sock.setEncoding("utf8");
    sock.on("connect", resolve);
    sock.on("error", reject);
    sock.on("data", (chunk) => {
      rbuf += chunk;
      let nl;
      while ((nl = rbuf.indexOf("\n")) >= 0) {
        const line = rbuf.slice(0, nl);
        rbuf = rbuf.slice(nl + 1);
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        const p = pending.get(msg.id);
        if (p) { pending.delete(msg.id); p(msg); }
      }
    });
  });
}

function rpc(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("timeout: " + method)); }, 8000);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    sock.write(JSON.stringify({ id, method, params }) + "\n");
  });
}

const val = (m) => (m && m.result !== undefined ? m.result : m);
let pass = 0, fail = 0, warn = 0;
function ok(cond, msg, detail) {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.log("  ✗ " + msg, detail !== undefined ? JSON.stringify(detail) : ""); }
}
function warnIf(cond, msg, detail) {
  if (cond) { console.log("  ✓ " + msg); }
  else { warn++; console.log("  ⚠ " + msg + " (시각 레이어 — 뷰가 열려 있어야 함)", detail !== undefined ? JSON.stringify(detail) : ""); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const add = async (params) => val(await rpc(P + "node.add", params)).nodeId;

// 이 하니스가 만드는 드래프트의 표식 — 회수의 단위다.
const DRAFT_TITLE = "재고 정합성 SaaS";

// 자기 산출물만 회수한다. 예전에는 여기서 보드를 통째로 reset 했는데, 그 보드는 공유물이다:
// 워크플로가 계약(soksak-issue-board-spec)으로 투영해 둔 카드까지 지웠다. 남의 것을 지우는
// 하니스는 누수보다 나쁘다 — 다음 레인은 자기 데이터가 왜 사라졌는지 알 길이 없다.
// node.remove 는 기본이 subtree 삭제라 덩어리 하나만 지우면 그룹·항목이 함께 회수된다.
async function reclaimOwnDrafts() {
  const all = val(await rpc(P + "node.list", { limit: 1000 })).nodes || [];
  for (const n of all) {
    if (n.isDraft === true && n.title === DRAFT_TITLE) {
      await rpc(P + "node.remove", { node: n.id }).catch(() => {});
    }
  }
}

// ── SYNTHETIC 드래프트 — 덩어리(isDraft) > 그룹(category) > 항목(oxf). f≥1 → 폐기 집계 유발.
async function buildSyntheticDraft() {
  await reclaimOwnDrafts(); // 이전 실행의 내 잔재만 — 남의 카드는 그대로 둔다
  const chunk = await add({ title: DRAFT_TITLE, isDraft: true, kind: "chunk" });
  const g1 = await add({ parentId: chunk, title: "재고 관리", kind: "group" });
  const g2 = await add({ parentId: chunk, title: "구매 거래", kind: "group" });
  await add({ parentId: g1, title: "캐니스터 슬롯 재고 동기화", kind: "item", badge: "o" });
  await add({ parentId: g1, title: "창고-캐니스터 동일약 합산", kind: "item", badge: "o" });
  await add({ parentId: g1, title: "비급여 가격 미지 재구매 학습", kind: "item", badge: "x" });
  await add({ parentId: g2, title: "거래처 알림톡 발송", kind: "item", badge: "o" });
  await add({ parentId: g2, title: "대체의약품 불허 시 주문취소", kind: "item", badge: "f" }); // f → 덩어리 폐기 대상
  return { chunk, g1, g2 };
}

// ── 발행된 드래프트 찾기(Phase 5 실통합) — isDraft 최상위 노드 1개.
async function findEmittedDraft() {
  const all = val(await rpc(P + "node.list", { limit: 1000 })).nodes;
  const chunk = all.find((n) => n.isDraft === true);
  // TODO(Phase 5): 워크플로가 여러 덩어리(복제 계보)를 발행하면 parentDraftId 최신 유효본 선택.
  return chunk ? chunk.id : null;
}

async function main() {
  console.log("socket:", SOCKET, USE_EMITTED ? "(발행 트리 검증)" : "(SYNTHETIC)");
  await connect();
  await rpc("plugin.dev.load", { path: PLUGIN_DIR }).catch(() => {});
  await rpc("plugin.enable", { id: PLUGIN_ID }).catch(() => {});
  await rpc("plugin.reload").catch(() => {});
  await sleep(800);

  let chunkId;
  if (USE_EMITTED) {
    chunkId = await findEmittedDraft();
    ok(!!chunkId, "발행된 드래프트(isDraft) 노드 존재", chunkId);
    if (!chunkId) return finish();
  } else {
    ({ chunk: chunkId } = await buildSyntheticDraft());
    ok(!!chunkId, "SYNTHETIC 드래프트 생성", chunkId);
  }

  // ── (1) 헤드리스 데이터: 모델 마커(isDraft/kind/badge) ──
  console.log("\n[1] 모델 마커 — node.list/get");
  const chunkNode = val(await rpc(P + "node.get", { node: chunkId })).node;
  ok(chunkNode.isDraft === true, "덩어리 isDraft=true", chunkNode.isDraft);
  ok(chunkNode.kind === "chunk", "덩어리 kind=chunk", chunkNode.kind);
  const groups = val(await rpc(P + "node.list", { parentId: chunkId })).nodes;
  ok(groups.length >= 1 && groups.every((g) => g.kind === "group"), "그룹들 kind=group", groups.map((g) => g.kind));
  const items = [];
  for (const g of groups) items.push(...val(await rpc(P + "node.list", { parentId: g.id })).nodes);
  ok(items.length >= 1 && items.every((i) => i.kind === "item"), "항목들 kind=item", items.map((i) => i.kind));
  ok(items.every((i) => ["검수전", "o", "x", "f"].includes(i.badge)), "항목 badge ∈ {검수전,o,x,f}", items.map((i) => i.badge));

  // ── (1b) 투영: 항목 자기 배지 + 덩어리 감사 집계(f≥1 → discard) ──
  console.log("\n[1b] 투영 — view.get(outline)");
  const proj = val(await rpc(P + "view.get", { view: "outline", focus: "root" })).projection;
  const rowOf = (id) => proj.rows.find((r) => r.id === id);
  const chunkRow = rowOf(chunkId);
  ok(chunkRow && chunkRow.validation, "덩어리 행에 감사 집계(validation) 존재", chunkRow && chunkRow.validation);
  if (chunkRow && chunkRow.validation) {
    const v = chunkRow.validation;
    const f = items.filter((i) => i.badge === "f").length;
    ok(v.total === items.length, "감사 집계 total = 항목 수", { total: v.total, items: items.length });
    ok(v.discard === (f >= 1), "감사 discard = (f≥1)", { discard: v.discard, f });
  }
  const anItem = items[0];
  const itemRow = rowOf(anItem.id);
  ok(itemRow && itemRow.badge === anItem.badge, "항목 행은 자기 배지(집계 아님)", itemRow && itemRow.badge);
  ok(itemRow && itemRow.validation == null, "항목 행 validation=null(자손 없음)", itemRow && itemRow.validation);
  // 트리 깊이: 덩어리 depth0 < 그룹 < 항목.
  ok(chunkRow && chunkRow.depth === 0, "덩어리 depth=0", chunkRow && chunkRow.depth);
  ok(itemRow && itemRow.depth >= 2, "항목 depth≥2(덩어리>그룹>항목)", itemRow && itemRow.depth);

  // ── (2) DOM 노출: ui.tree 로 행이 실제 렌더됐는지(시각 레이어 — 뷰 열림 필요) ──
  console.log("\n[2] DOM 노출 — ui.tree (data-node 'row/<key>')");
  // TODO(Phase 5): 칸반 뷰가 패널에 열려 있고 Outline 탭·focus=root 여야 행이 노출된다.
  //   앱 구동 시 사람이 열거나, 패널 오픈 커맨드로 보장. 닫혀 있으면 kanban 행 0 → ⚠(hard-fail 아님).
  await rpc(P + "focus.set", { node: "root", view: "outline" }).catch(() => {});
  await sleep(300);
  const tree = val(await rpc("ui.tree"));
  const addrs = (tree.nodes || []).map((n) => n.address);
  const kanbanRows = addrs.filter((a) => /soksak-plugin-kanban.*\/node\/row\//.test(a));
  warnIf(kanbanRows.length > 0, `ui.tree 에 칸반 행 노출 (${kanbanRows.length}개)`, tree.count);
  if (kanbanRows.length > 0) {
    // 모든 덩어리/그룹/항목 key 가 행 주소로 렌더됐는지 교차.
    const allNodes = [chunkNode, ...groups, ...items];
    const rowKeys = new Set(kanbanRows.map((a) => a.split("/node/row/")[1]));
    const missing = allNodes.filter((n) => !rowKeys.has(String(n.key).toLowerCase()));
    warnIf(missing.length === 0, "모든 덩어리/그룹/항목 행이 DOM 에 렌더", missing.map((n) => n.key));

    // DOM-레벨 배지 검증: 항목 배지(badge/<key>/<값>) + 덩어리 감사(audit/<key>/p.o.x.f) 주소 노출.
    // 배지 값 라틴 매핑(검수전→pending; o/x/f 그대로) — NODE_PATH_RE 가 한글/대문자 금지.
    const LATIN = { 검수전: "pending", o: "o", x: "x", f: "f" };
    const hasAddr = (suffix) => addrs.some((a) => a.endsWith("/node/" + suffix));
    const badMissing = items.filter((i) => !hasAddr(`badge/${String(i.key).toLowerCase()}/${LATIN[i.badge]}`));
    warnIf(badMissing.length === 0, "항목 oxf 배지가 DOM 주소로 노출(값까지 검증)", badMissing.map((i) => `${i.key}:${i.badge}`));
    // 덩어리 감사 집계 주소(f 카운트 → 폐기 파싱).
    const f = items.filter((i) => i.badge === "f").length;
    const auditAddr = addrs.find((a) => a.includes(`/node/audit/${String(chunkNode.key).toLowerCase()}/`));
    warnIf(!!auditAddr, "덩어리 감사 집계가 DOM 주소로 노출", auditAddr);
    if (auditAddr) warnIf(auditAddr.includes(`.f${f}`), `감사 주소의 f 카운트 = ${f}(f>0 → 폐기)`, auditAddr);
  }

  // ── (3) 시각 캡처: window.snapshot → PNG(사람 눈검사·회귀) ──
  console.log("\n[3] 시각 — window.snapshot");
  const shot = val(await rpc("window.snapshot", { path: SHOT_PATH }));
  warnIf(shot && shot.saved, `스냅샷 저장: ${shot && shot.saved}`, shot);

  await finish();
}

async function finish() {
  // teardown — 이 실행이 만든 드래프트를 회수한다. 다음 실행의 reset 에 청소를 떠넘기지 않는다:
  // 그 reset 이 바로 남의 카드를 지우던 것이었다.
  if (!USE_EMITTED) await reclaimOwnDrafts();

  console.log(`\n${pass} passed, ${fail} failed, ${warn} warned(시각 레이어)`);
  sock.end();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("드래프트 시각검증 오류:", e.message);
  process.exit(1);
});
