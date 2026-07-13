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

// 창을 고정한다. 안 그러면 코어의 기본 라우팅이 그때그때 다른 창을 고르고, 그 창은 패널이 없을 수도
// 있으며(→ view.open 이 "패널 없음"), 무엇보다 **보드가 달라진다** — 칸반 저장소는 창의 현재 프로젝트로
// 스코프되므로, 어느 창에 썼는지 모르는 하니스는 자기가 무엇을 회수하는지도 모른다.
let WINDOW = process.env.SOKSAK_WINDOW || null;

function rpc(method, params = {}, withWindow = true) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("timeout: " + method)); }, 8000);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    sock.write(JSON.stringify({ id, method, params, ...(withWindow && WINDOW ? { window: WINDOW } : {}) }) + "\n");
  });
}

/** 워크스페이스 창 발견 — 플러그인 호스트다. window.projects 자체는 제어판 대상이라 창을 싣지 않는다. */
async function discoverWindow() {
  const r = await rpc("window.projects", {}, false);
  const projects = data(r, "window.projects").projects || [];
  if (projects.length === 0) throw new Error("워크스페이스 창 없음 — 프로젝트를 연 창이 필요하다");
  WINDOW = projects[0].window;
  return WINDOW;
}

// 응답 봉투는 { ok, code, message, data, window } 이고, 알맹이는 data 안에 있다.
// 옛 val() 은 JSON-RPC 의 `result` 를 찾다가 못 찾으면 봉투를 통째로 돌려줬다 — 그래서
// `envelope.nodeId` 는 언제나 undefined 였고, 노드는 만들어지는데 하니스는 그 id 를 몰랐다.
// 그 결과 자식들이 parentId=undefined 로 루트에 흩뿌려졌고, 회수는 그것들을 찾지 못했다.
// 거절은 던진다 — 실패를 undefined 로 들고 다니면 그 다음 줄에서야 엉뚱한 이름으로 터진다.
function data(m, what) {
  if (!m || m.ok !== true) throw new Error(`${what}: ${(m && m.code) || "NO_RESPONSE"} — ${(m && m.message) || ""}`);
  return m.data ?? {};
}
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

// 이 실행이 만든 노드 — 실패하든 성공하든 이것만은 반드시 걷는다(teardown 은 finally 다).
const created = [];
// 이 실행이 연 뷰 — 표면도 회수 대상이다. 남겨 두면 다음 실행·다음 레인이 남의 탭을 물려받는다.
let openedViewId = null;
const add = async (params) => {
  const d = data(await rpc(P + "node.add", params), "node.add");
  created.push(d.nodeId);
  return d.nodeId;
};
const listNodes = async (params = { limit: 1000 }) => data(await rpc(P + "node.list", params), "node.list").nodes || [];

// 이 하니스가 만드는 드래프트의 표식 — 회수의 단위다.
const DRAFT_TITLE = "재고 정합성 SaaS";
// SYNTHETIC 트리가 쓰는 제목 전부. 앞선 실행이 중간에 죽어 부모를 잃은 고아까지 이 표식으로 걷는다
// (제대로 붙은 트리는 덩어리 하나만 지워도 subtree 로 따라온다).
const SYNTHETIC_TITLES = new Set([
  DRAFT_TITLE, "재고 관리", "구매 거래",
  "캐니스터 슬롯 재고 동기화", "창고-캐니스터 동일약 합산", "비급여 가격 미지 재구매 학습",
  "거래처 알림톡 발송", "대체의약품 불허 시 주문취소",
]);

// 자기 산출물만 회수한다. 예전에는 여기서 보드를 통째로 reset 했는데, 그 보드는 공유물이다:
// 워크플로가 계약(soksak-issue-board-spec)으로 투영해 둔 카드까지 지웠다. 남의 것을 지우는
// 하니스는 누수보다 나쁘다 — 다음 레인은 자기 데이터가 왜 사라졌는지 알 길이 없다.
//
// 두 축으로 걷는다:
//   (1) 이번 실행이 만든 id — 실패해도 이건 확실히 안다(생성 순 역순 = 자식 먼저).
//   (2) 표식이 남은 잔재 — 앞선 실행이 죽어 남긴 것. node.remove 는 기본이 subtree 라 덩어리를
//       지우면 그 아래가 함께 걷히고, 부모를 잃은 고아는 제목 표식으로 개별 회수된다.
async function reclaim() {
  if (openedViewId) {
    await rpc("view.close", { view: openedViewId }).catch(() => {});
    openedViewId = null;
  }
  for (const id of [...created].reverse()) {
    await rpc(P + "node.remove", { node: id }).catch(() => {});
  }
  created.length = 0;
  const all = await listNodes().catch(() => []);
  for (const n of all) {
    if (SYNTHETIC_TITLES.has(n.title)) {
      await rpc(P + "node.remove", { node: n.id }).catch(() => {});
    }
  }
}

// ── SYNTHETIC 드래프트 — 덩어리(isDraft) > 그룹(category) > 항목(oxf). f≥1 → 폐기 집계 유발.
async function buildSyntheticDraft() {
  await reclaim(); // 이전 실행의 내 잔재만 — 남의 카드는 그대로 둔다
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
  const all = await listNodes();
  const chunk = all.find((n) => n.isDraft === true);
  // TODO(Phase 5): 워크플로가 여러 덩어리(복제 계보)를 발행하면 parentDraftId 최신 유효본 선택.
  return chunk ? chunk.id : null;
}

async function main() {
  console.log("socket:", SOCKET, USE_EMITTED ? "(발행 트리 검증)" : "(SYNTHETIC)");
  await connect();
  if (!WINDOW) await discoverWindow();
  console.log("window:", WINDOW);
  // 작업본을 겨눈다. 전체 plugin.reload 는 치지 않는다 — 공유 앱의 모든 플러그인을 재스캔·재활성화하고,
  // 다른 레인이 dev.load 로 걸어 둔 작업본까지 설치본으로 되돌린다. 하니스는 자기 플러그인만 건드린다.
  await rpc("plugin.dev.load", { path: PLUGIN_DIR }).catch(() => {});
  await rpc("plugin.enable", { id: PLUGIN_ID }).catch(() => {});
  await sleep(800);

  let chunkId;
  if (USE_EMITTED) {
    chunkId = await findEmittedDraft();
    ok(!!chunkId, "발행된 드래프트(isDraft) 노드 존재", chunkId);
    if (!chunkId) return; // 판정·회수·종료코드는 run() 이 소유한다
  } else {
    ({ chunk: chunkId } = await buildSyntheticDraft());
    ok(!!chunkId, "SYNTHETIC 드래프트 생성", chunkId);
  }

  // ── (1) 헤드리스 데이터: 모델 마커(isDraft/kind/badge) ──
  console.log("\n[1] 모델 마커 — node.list/get");
  const chunkNode = data(await rpc(P + "node.get", { node: chunkId }), "node.get").node;
  ok(chunkNode.isDraft === true, "덩어리 isDraft=true", chunkNode.isDraft);
  ok(chunkNode.kind === "chunk", "덩어리 kind=chunk", chunkNode.kind);
  const groups = await listNodes({ parentId: chunkId });
  ok(groups.length >= 1 && groups.every((g) => g.kind === "group"), "그룹들 kind=group", groups.map((g) => g.kind));
  const items = [];
  for (const g of groups) items.push(...(await listNodes({ parentId: g.id })));
  ok(items.length >= 1 && items.every((i) => i.kind === "item"), "항목들 kind=item", items.map((i) => i.kind));
  ok(items.every((i) => ["검수전", "o", "x", "f"].includes(i.badge)), "항목 badge ∈ {검수전,o,x,f}", items.map((i) => i.badge));

  // ── (1b) 투영: 항목 자기 배지 + 덩어리 감사 집계(f≥1 → discard) ──
  console.log("\n[1b] 투영 — view.get(outline)");
  const proj = data(await rpc(P + "view.get", { view: "outline", focus: "root" }), "view.get").projection;
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

  // ── (2) DOM 노출: ui.tree 로 행이 실제 렌더됐는지 ──
  console.log("\n[2] DOM 노출 — ui.tree (data-node 'row/<key>')");
  // 검증에 필요한 노출면은 하니스가 만든다. 예전에는 "뷰가 닫혀 있으면 ⚠" 로 넘어갔는데, 그건
  // 아무도 뷰를 열지 않는 자동 실행에서 시각 레이어 전체가 조용히 통과한다는 뜻이었다 — 검사가
  // 아니라 장식이다. 뷰는 우리가 열고, 우리가 닫는다(teardown 의 표면 축).
  openedViewId = data(await rpc("view.open", { program: "kanban" }), "view.open").viewId;
  await sleep(600);
  await rpc(P + "focus.set", { node: "root", view: "outline" }).catch(() => {});
  await sleep(400);
  const tree = data(await rpc("ui.tree"), "ui.tree");
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
  const shot = data(await rpc("window.snapshot", { path: SHOT_PATH }), "window.snapshot");
  warnIf(shot && shot.saved, `스냅샷 저장: ${shot && shot.saved}`, shot);
}

// 실패해도 자기 산출물은 걷는다 — teardown 은 finally 다. 예전에는 회수가 성공 경로에만 있어서,
// 검사 하나가 터지면 그 실행이 만든 노드가 공유 보드에 그대로 남았다(두 회차가 16개를 남겼다).
// 그리고 판정은 종료코드에 실린다: 실패를 0 으로 끝내는 게이트는 게이트가 아니라 장식이다.
async function run() {
  try {
    await main();
  } catch (e) {
    fail++;
    console.error("\n드래프트 시각검증 오류:", e.message);
  } finally {
    if (!USE_EMITTED) await reclaim().catch((e) => console.error("회수 실패:", e.message));
  }
  console.log(`\n${pass} passed, ${fail} failed, ${warn} warned(시각 레이어)`);
  if (sock) sock.end();
  process.exit(fail ? 1 : 0);
}

run();
