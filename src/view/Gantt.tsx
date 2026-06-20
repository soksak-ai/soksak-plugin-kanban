// 간트 뷰(전역) — 에픽 + 자손을 기간 막대로. 6월 4주 그리드 + 오늘 마커.
import type { Node } from "@/types";
import { toGantt } from "@/core/projections";
import { sMeta, hexA } from "@/view/ui";
import { resolveLabel } from "@/refs";

export default function Gantt({ nodes, onOpen, lang }: { nodes: Node[]; onOpen: (id: string) => void; lang: string }) {
  const g = toGantt(nodes);
  return (
    <div style={{ padding: "20px 22px", height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>간트 차트 · Gantt</h3>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>오늘 · 6/18</span>
      </div>
      <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface)", minWidth: 760 }}>
        <div style={{ width: 248, flex: "none", borderRight: "1px solid var(--border)" }}>
          <div style={{ height: 34, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 11, fontWeight: 600, color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>이슈 · Issue</div>
          {g.rows.map((r) => (
            <div key={r.id} onClick={() => onOpen(r.id)} style={{ display: "flex", alignItems: "center", gap: 7, height: 36, padding: r.isEpic ? "0 12px" : "0 12px 0 26px", borderBottom: "1px solid var(--grid)", cursor: "pointer" }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, flex: "none", background: sMeta(r.status).color }} />
              <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: r.isEpic ? 600 : 400 }}>{r.title}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <div style={{ display: "flex", height: 34, borderBottom: "1px solid var(--border)" }}>
            {g.weeks.map((w, i) => (
              <div key={i} style={{ flex: 1, borderRight: "1px solid var(--grid)", display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{resolveLabel(w.label, lang)}</span>
                <span style={{ fontSize: 9.5, color: "var(--text-3)" }}>{w.range}</span>
              </div>
            ))}
          </div>
          {g.rows.map((r) => {
            const m = sMeta(r.status);
            return (
              <div key={r.id} style={{ height: 36, position: "relative", borderBottom: "1px solid var(--grid)" }}>
                <div title={r.key} style={{ position: "absolute", left: `${r.leftPct}%`, width: `${r.widthPct}%`, top: r.isEpic ? 13 : 8, height: r.isEpic ? 10 : 20, background: r.isEpic ? hexA(m.color, 0.85) : m.color, borderRadius: r.isEpic ? 3 : 6, display: "flex", alignItems: "center", padding: "0 7px", boxShadow: r.isEpic ? "none" : "0 1px 2px rgba(0,0,0,.12)" }}>
                  <span style={{ fontSize: 10, color: "#fff", fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{r.isEpic ? r.title : r.key.replace("WMP-", "")}</span>
                </div>
              </div>
            );
          })}
          <div style={{ position: "absolute", top: 34, bottom: 0, left: `${g.todayPct}%`, width: 2, background: "#ef4444", zIndex: 3 }}>
            <span style={{ position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)", width: 7, height: 7, borderRadius: "50%", background: "#ef4444" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
