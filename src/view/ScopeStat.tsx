// 브레드크럼 라인 우측에 붙는 focus 스코프 진행 표시 — 완료/진행(+ 병목·지연).
import type { Node } from "@/types";
import { stats } from "@/core/projections";

export default function ScopeStat({ nodes, focusId }: { nodes: Node[]; focusId: string | null }) {
  const st = stats(nodes, focusId);
  return (
    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 12, fontSize: 12, whiteSpace: "nowrap", color: "var(--text-2)" }}>
      <span>완료 <b style={{ color: "var(--text)", fontFamily: "var(--mono)" }}>{st.done}</b>/{st.total}</span>
      <span>진행 <b style={{ color: "var(--text)", fontFamily: "var(--mono)" }}>{st.inProgress}</b></span>
      {(st.bottlenecks > 0 || st.stale > 0) && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#f59e0b", fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />병목 {st.bottlenecks} · 지연 {st.stale}
        </span>
      )}
    </span>
  );
}
