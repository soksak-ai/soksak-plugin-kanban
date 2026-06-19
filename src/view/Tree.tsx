// 트리 뷰(focus 스코프) — 재귀 구조 읽기 + 진행률 + drill. 행 클릭=자식 있으면 재구성, 없으면 상세.
import type { CSSProperties } from "react";
import type { Node } from "@/types";
import { byId } from "@/core/tree";
import { toOutlineRows, breadcrumb } from "@/core/projections";
import { avatar, initials, statusChip, sMeta, typeBadge, typeLetter } from "@/view/ui";

interface Props {
  nodes: Node[];
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  onOpen: (id: string) => void;
}

export default function Tree({ nodes, focusId, setFocusId, onOpen }: Props) {
  const rows = toOutlineRows(nodes, focusId);
  const crumbs = breadcrumb(nodes, focusId);
  const goUp = () => {
    if (!focusId) return;
    const n = byId(nodes, focusId);
    setFocusId(n ? n.parentId : null);
  };
  const upParentLabel = crumbs.length >= 2 ? crumbs[crumbs.length - 2].label : "전체";

  return (
    <div style={{ padding: "14px 22px 20px", height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
            {i > 0 && <span style={{ color: "var(--text-3)", fontSize: 12, margin: "0 1px" }}>/</span>}
            <button onClick={() => setFocusId(c.id)} style={crumbStyle(i === crumbs.length - 1)}>{c.label}</button>
          </span>
        ))}
      </div>
      <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>트리 구조 · Structure</h3>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--text-3)" }}>행을 클릭하면 그 노드로 들어가(재구성), 상위로는 ↑ 또는 브레드크럼.</p>
      <div style={{ maxWidth: 780, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
        {focusId && (
          <div onClick={goUp} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40, padding: "0 14px", borderBottom: "1px solid var(--grid)", cursor: "pointer", color: "var(--text-2)" }}>
            <span style={{ width: 20, height: 20, borderRadius: 6, border: "1px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flex: "none" }}>↑</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>상위로</span>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>· {upParentLabel}</span>
          </div>
        )}
        {rows.map((r) => {
          const m = sMeta(r.status);
          return (
            <div key={r.id} onClick={() => (r.hasChildren ? setFocusId(r.id) : onOpen(r.id))} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40, padding: `0 14px 0 ${14 + r.depth * 22}px`, borderBottom: "1px solid var(--grid)", cursor: "pointer" }}>
              <span style={r.isEpic ? { width: 20, height: 20, borderRadius: 6, background: "#8b5cf6", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" } : typeBadge(r.type)}>
                {r.isEpic ? "E" : typeLetter(r.type)}
              </span>
              <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)", flex: "none" }}>{r.key}</span>
              <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: r.isEpic ? 600 : 400 }}>{r.title || "(제목 없음)"}</span>
              {r.progress && (
                <>
                  <div style={{ width: 72, height: 5, borderRadius: 99, background: "var(--surface-3)", overflow: "hidden", flex: "none" }}>
                    <div style={{ height: "100%", width: `${r.progress.pct}%`, background: "#8b5cf6", borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)", flex: "none" }}>{r.progress.done}/{r.progress.total}</span>
                </>
              )}
              <span style={statusChip(r.status)}>{m.kr}</span>
              <span style={{ fontSize: 10, color: "var(--text-3)", flex: "none", width: 54, textAlign: "right" }}>{r.hasChildren ? "▸ 들어가기" : ""}</span>
              <span style={avatar(r.assignee, 20)}>{initials(r.assignee)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const crumbStyle = (cur: boolean): CSSProperties => ({ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 7, border: "none", background: cur ? "var(--accent-soft)" : "transparent", color: cur ? "var(--accent)" : "var(--text-2)", fontSize: 12.5, fontWeight: cur ? 700 : 600, cursor: cur ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
