// 캘린더 뷰(전역) — 마감(due) 기준 6월 그리드. 칩 클릭=상세.
import type { Node } from "@/types";
import { toCalendar } from "@/core/projections";
import { sMeta } from "@/view/ui";

export default function Calendar({ nodes, onOpen }: { nodes: Node[]; onOpen: (id: string) => void }) {
  const c = toCalendar(nodes);
  return (
    <div style={{ padding: "20px 22px", height: "100%", overflow: "auto" }}>
      <h3 style={{ margin: "0 0 18px", fontSize: 14, fontWeight: 600 }}>{c.monthLabel} · 마감 기준</h3>
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid var(--border)" }}>
          {c.weekdays.map((w) => (
            <div key={w.en} style={{ padding: "9px 12px", fontSize: 11, fontWeight: 600, color: "var(--text-3)", borderRight: "1px solid var(--grid)" }}>
              {w.kr} <span style={{ fontWeight: 400 }}>{w.en}</span>
            </div>
          ))}
        </div>
        {c.weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid var(--grid)" }}>
            {week.days.map((d, di) => (
              <div key={di} style={{ minHeight: 104, padding: "8px 9px", borderRight: "1px solid var(--grid)", background: d.show ? "transparent" : "var(--surface-2)" }}>
                {d.show && (
                  <>
                    <span style={d.isToday ? { width: 22, height: 22, borderRadius: "50%", background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)" } : { fontSize: 12, fontWeight: 600, color: "var(--text-2)", fontFamily: "var(--mono)" }}>{d.day}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 5 }}>
                      {(d.items ?? []).map((it) => (
                        <div key={it.id} onClick={() => onOpen(it.id)} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 5, background: "var(--surface-2)", cursor: "pointer", color: "var(--text-2)", fontFamily: "var(--mono)" }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", flex: "none", background: sMeta(it.status).color }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.key.replace("WMP-", "")}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
