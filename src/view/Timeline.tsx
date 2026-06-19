// 타임라인 뷰(전역) — 상태 전환을 날짜별 그룹(내림차순)으로. 누가·언제·무엇을.
import type { Node } from "@/types";
import { toTimeline } from "@/core/projections";
import { avatar, initials, statusChip, sMeta } from "@/view/ui";

export default function Timeline({ nodes, onOpen }: { nodes: Node[]; onOpen: (id: string) => void }) {
  const groups = toTimeline(nodes);
  return (
    <div style={{ padding: "20px 22px", height: "100%", overflow: "auto" }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>상태 전환 타임라인 · Transition history</h3>
      <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--text-3)" }}>누가 · 언제 · 무엇을 옮겼는지</p>
      <div style={{ maxWidth: 680 }}>
        {groups.map((g) => (
          <div key={g.dateLabel} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 10px" }}>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text-2)" }}>{g.dateLabel}</span>
              <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            {g.items.map((ev, i) => (
              <div key={i} onClick={() => onOpen(ev.id)} style={{ display: "flex", gap: 12, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 11, background: "var(--surface)", marginBottom: 8, cursor: "pointer", alignItems: "center" }}>
                <span style={avatar(ev.by, 28)}>{initials(ev.by)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)" }}>{ev.key}</span>
                    <span style={statusChip(ev.from)}>{sMeta(ev.from).kr}</span>
                    <span style={{ color: "var(--text-3)" }}>→</span>
                    <span style={statusChip(ev.to)}>{sMeta(ev.to).kr}</span>
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
