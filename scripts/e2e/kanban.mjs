// soksak-plugin-kanban 라이브 E2E — SOKSAK_SOCKET JSON-RPC 로 명령 표면 검증.
// 실행: 앱 구동 + `node scripts/e2e/kanban.mjs` (dev.load·enable 은 스크립트가 시도).
// 프로토콜: 줄 단위 JSON {id,method,params} → {id,result|error}.
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLUGIN_ID = "soksak-plugin-kanban";
const P = `plugin.${PLUGIN_ID}.`;
const SOCKET = process.env.SOKSAK_SOCKET || path.join(os.homedir(), ".soksak", "com.soksak.dev.sock");

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
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          p(msg);
        }
      }
    });
  });
}

function rpc(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("timeout: " + method));
    }, 8000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    sock.write(JSON.stringify({ id, method, params }) + "\n");
  });
}

const val = (m) => (m && m.result !== undefined ? m.result : m);
let pass = 0;
let fail = 0;
function ok(cond, msg, detail) {
  if (cond) pass++;
  else {
    fail++;
    console.log("  ✗ " + msg, detail !== undefined ? JSON.stringify(detail) : "");
  }
  if (cond) console.log("  ✓ " + msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("socket:", SOCKET);
  await connect();

  // dev 적재 + 활성(이미 되어 있으면 무해) + reload(최신 main.js 반영).
  await rpc("plugin.dev.load", { path: PLUGIN_DIR }).catch(() => {});
  await rpc("plugin.enable", { id: PLUGIN_ID }).catch(() => {});
  await rpc("plugin.reload").catch(() => {});
  await sleep(800);

  const ping = val(await rpc(P + "ping"));
  ok(ping && ping.ok === true, "ping 적재 확인", ping);

  // 깨끗한 상태 → 시드.
  await rpc(P + "reset");
  const seeded = val(await rpc(P + "seed"));
  ok(seeded && seeded.count === 29, "seed 29 노드", seeded);

  // 프랙탈: focus=root 는 에픽, focus=E1 은 그 자식.
  const rootBoard = val(await rpc(P + "view.get", { view: "board", focus: "root" }));
  const ipRoot = rootBoard.projection.columns.find((c) => c.id === "inprogress");
  ok(
    ipRoot && ipRoot.cards.map((c) => c.id).sort().join(",") === "E1,E2",
    "root 보드 inprogress = E1,E2",
    ipRoot && ipRoot.cards.map((c) => c.id),
  );

  const e1Board = val(await rpc(P + "view.get", { view: "board", focus: "WMP-100" }));
  const e1Ids = e1Board.projection.columns.flatMap((c) => c.cards.map((x) => x.id)).sort();
  ok(e1Ids.join(",") === "101,102,103,104,105", "E1 보드 = 직계 자식", e1Ids);

  const e1List = val(await rpc(P + "node.list", { parentId: "WMP-100" }));
  ok(e1List.nodes.length === 5, "node.list E1 자식 5개", e1List.nodes.length);

  // board.move → 상태 변경.
  await rpc(P + "board.move", { node: "WMP-103", status: "inprogress" });
  const g103 = val(await rpc(P + "node.get", { node: "WMP-103" }));
  ok(g103.node.status === "inprogress" && g103.node.history.length > 0, "board.move 상태+history", g103.node.status);

  // 더 깊이 focus.
  const n101 = val(await rpc(P + "view.get", { view: "board", focus: "WMP-101" }));
  const ids101 = n101.projection.columns.flatMap((c) => c.cards.map((x) => x.id)).sort();
  ok(ids101.join(",") === "401,402", "WMP-101 보드 = 그 자식(401,402)", ids101);

  // outline.outdent — 401 한 단계 위로, 402 흡수.
  await rpc(P + "outline.outdent", { node: "WMP-401" });
  const o401 = val(await rpc(P + "node.get", { node: "WMP-401" }));
  const o402 = val(await rpc(P + "node.get", { node: "WMP-402" }));
  ok(o401.node.parentId === "E1", "outdent: 401 부모=E1", o401.node.parentId);
  ok(o402.node.parentId === "401", "outdent: 402 가 401 자식으로 흡수", o402.node.parentId);

  // add / remove.
  const added = val(await rpc(P + "node.add", { parentId: "WMP-100", title: "E2E 추가", status: "todo" }));
  ok(added.ok && added.nodeId, "node.add", added);
  const removed = val(await rpc(P + "node.remove", { node: added.nodeId }));
  ok(removed.ok && removed.removed === 1, "node.remove", removed);

  // stats / sort.
  const st = val(await rpc(P + "stats"));
  ok(st.stats && typeof st.stats.total === "number", "stats", st.stats);
  const sorted = val(await rpc(P + "board.sort", { parentId: "WMP-100", by: "points", dir: "desc" }));
  ok(sorted.ok, "board.sort", sorted);

  // 멱등 재실행: reset → seed.
  await rpc(P + "reset");
  const reseed = val(await rpc(P + "seed"));
  ok(reseed.count === 29, "재시드 멱등 29", reseed);

  console.log(`\n${pass} passed, ${fail} failed`);
  sock.end();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("E2E 오류:", e.message);
  process.exit(1);
});
