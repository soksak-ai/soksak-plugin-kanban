// 테이블 뷰(전역) — 작업 항목 목록, 헤더 클릭으로 정렬(뷰 정렬, 영속 X). 행 클릭=상세.
import { useState } from "react";
import type { Node } from "@/types";
import type { SortKey } from "@/core/algebra";
import { toTable } from "@/core/projections";
import { avatar, initials, userName, statusChip, typeBadge, typeLetter, prDot, ptsBadge, sMeta } from "@/view/ui";
import { PRIORITY } from "@/refs";

const COLS: [SortKey, string, number][] = [
  ["key", "Key", 92],
  ["title", "제목", 0],
  ["status", "상태", 104],
  ["assignee", "담당", 120],
  ["priority", "우선", 78],
  ["points", "SP", 54],
  ["due", "마감", 64],
];

export default function Table({ nodes, onOpen }: { nodes: Node[]; onOpen: (id: string) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>("key");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const rows = toTable(nodes, sortKey, sortDir);
  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };
  return (
    <div style={{ padding: "20px 22px", height: "100%", overflow: "auto" }}>
      <h3 style={{ margin: "0 0 18px", fontSize: 14, fontWeight: 600 }}>테이블 · List</h3>
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 40, borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
          {COLS.map(([k, label, w]) => (
            <div key={k} onClick={() => onSort(k)} style={{ width: k === "title" ? "auto" : w, flex: k === "title" ? 1 : "none", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, fontWeight: 600, color: sortKey === k ? "var(--text)" : "var(--text-3)", paddingLeft: k === "key" ? 48 : 0 }}>
              <span>{label}</span>
              {sortKey === k && <span style={{ fontSize: 9, color: "var(--accent)" }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
            </div>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.id} onClick={() => onOpen(r.id)} style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 44, borderBottom: "1px solid var(--grid)", cursor: "pointer", fontSize: 13 }}>
            <div style={{ width: 48, flex: "none", display: "flex" }}><span style={typeBadge(r.type)}>{typeLetter(r.type)}</span></div>
            <div style={{ width: 92, flex: "none", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-2)" }}>{r.key}</div>
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>{r.title}</div>
            <div style={{ width: 104, flex: "none" }}><span style={statusChip(r.status)}>{sMeta(r.status).kr}</span></div>
            <div style={{ width: 120, flex: "none", display: "flex", alignItems: "center", gap: 7 }}><span style={avatar(r.assignee, 22)}>{initials(r.assignee)}</span><span style={{ fontSize: 12, color: "var(--text-2)" }}>{userName(r.assignee)}</span></div>
            <div style={{ width: 78, flex: "none", display: "flex", alignItems: "center", gap: 6 }}><span style={prDot(r.priority)} /><span style={{ fontSize: 12, color: "var(--text-2)" }}>{PRIORITY[r.priority].kr}</span></div>
            <div style={{ width: 54, flex: "none" }}><span style={ptsBadge()}>{r.points}</span></div>
            <div style={{ width: 64, flex: "none", fontSize: 12, color: "var(--text-2)", fontFamily: "var(--mono)" }}>{`${+r.due.split("-")[1]}/${+r.due.split("-")[2]}`}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
