// 아웃라이너 뷰(기본·편집 본진) — Tab/Shift+Tab/Enter/⌫ 키보드 편집 + focus 줌 + 가이드라인.
// 제목 입력은 비제어(성능) — blur·구조변경 시 커밋. 구조 변경 후 pendingFocus 로 입력 재포커스.
import { useRef, useLayoutEffect } from "react";
import type { CSSProperties } from "react";
import type { Node, ViewId } from "@/types";
import type { KanbanStore } from "@/store";
import { TODAY, RANGE_END } from "@/refs";
import { byId, hasChildren } from "@/core/tree";
import { insertNode, indent, outdent, removeNode, setStatus } from "@/core/algebra";
import { toOutlineRows, breadcrumb } from "@/core/projections";
import { STATUS_IDS } from "@/refs";
import { avatar, initials, statusChip, sMeta, hexA } from "@/view/ui";

interface Props {
  store: KanbanStore;
  nodes: Node[];
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  setView: (v: ViewId) => void;
  onOpen: (id: string) => void;
}

const kbd = (label: string) => (
  <b style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: "1px 5px", border: "1px solid var(--border-2)", borderRadius: 5, background: "var(--surface-2)", color: "var(--text-2)" }}>{label}</b>
);

export default function Outline({ store, nodes, focusId, setFocusId, setView, onOpen }: Props) {
  const rows = toOutlineRows(nodes, focusId);
  const crumbs = breadcrumb(nodes, focusId);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ id: string; caret: number | null } | null>(null);

  useLayoutEffect(() => {
    const pf = pendingFocus.current;
    if (!pf || !containerRef.current) return;
    pendingFocus.current = null;
    const el = containerRef.current.querySelector<HTMLInputElement>(`[data-outline-id="${pf.id}"]`);
    if (el) {
      el.focus();
      const p = pf.caret == null ? el.value.length : pf.caret;
      try {
        el.setSelectionRange(p, p);
      } catch {
        /* noop */
      }
    }
  });

  const apply = (fn: (ns: Node[]) => Node[]) => void store.apply(fn);
  const commit = (ns: Node[], id: string, title: string) => ns.map((n) => (n.id === id ? { ...n, title } : n));

  const addChild = (parentId: string | null) => {
    const now = Date.now();
    const node: Node = {
      id: store.genId(),
      key: store.nextKey(),
      parentId,
      order: 0,
      title: "",
      body: "",
      type: parentId == null ? "epic" : "task",
      status: "todo",
      assignee: "me",
      priority: "medium",
      points: parentId == null ? 0 : 3,
      start: TODAY,
      due: RANGE_END,
      collapsed: false,
      history: [],
      created: now,
      updated: now,
    };
    pendingFocus.current = { id: node.id, caret: 0 };
    apply((ns) => insertNode(ns, node));
  };

  const cycleStatus = (id: string) => {
    const n = byId(nodes, id);
    if (!n) return;
    const next = STATUS_IDS[(STATUS_IDS.indexOf(n.status) + 1) % STATUS_IDS.length];
    apply((ns) => setStatus(ns, id, next, "me", TODAY));
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    const real = byId(nodes, id);
    if (!real) return;
    const val = e.currentTarget.value;
    const caret = e.currentTarget.selectionStart ?? null;
    if (e.key === "Enter") {
      e.preventDefault();
      const now = Date.now();
      const node: Node = {
        id: store.genId(),
        key: store.nextKey(),
        parentId: real.parentId,
        order: 0,
        title: "",
        body: "",
        type: "task",
        status: real.status,
        assignee: real.assignee,
        priority: "medium",
        points: 3,
        start: TODAY,
        due: RANGE_END,
        collapsed: false,
        history: [],
        created: now,
        updated: now,
      };
      pendingFocus.current = { id: node.id, caret: 0 };
      apply((ns) => insertNode(commit(ns, id, val), node, id));
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      pendingFocus.current = { id, caret };
      apply((ns) => indent(commit(ns, id, val), id));
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      if (real.parentId != null) {
        pendingFocus.current = { id, caret };
        apply((ns) => outdent(commit(ns, id, val), id));
      }
    } else if (e.key === "Backspace" && val === "") {
      if (hasChildren(nodes, id)) return;
      e.preventDefault();
      const i = rows.findIndex((r) => r.id === id);
      const prev = rows[i - 1];
      if (prev) pendingFocus.current = { id: prev.id, caret: null };
      apply((ns) => removeNode(ns, id));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const i = rows.findIndex((r) => r.id === id);
      if (rows[i - 1]) focusInput(rows[i - 1].id);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const i = rows.findIndex((r) => r.id === id);
      if (rows[i + 1]) focusInput(rows[i + 1].id);
    }
  };

  const focusInput = (id: string) => {
    const el = containerRef.current?.querySelector<HTMLInputElement>(`[data-outline-id="${id}"]`);
    el?.focus();
  };

  const goUp = () => {
    if (!focusId) return;
    const n = byId(nodes, focusId);
    setFocusId(n ? n.parentId : null);
  };
  const upParentLabel = crumbs.length >= 2 ? crumbs[crumbs.length - 2].label : "전체 워크스페이스";

  return (
    <div style={{ padding: "14px 22px 20px", height: "100%", overflow: "auto" }}>
      {/* breadcrumb + 보드로 */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
            {i > 0 && <span style={{ color: "var(--text-3)", fontSize: 12, margin: "0 1px" }}>/</span>}
            <button onClick={() => setFocusId(c.id)} style={crumbStyle(i === crumbs.length - 1)}>{c.label}</button>
          </span>
        ))}
        <button onClick={() => setView("board")} style={{ marginLeft: "auto", height: 28, padding: "0 11px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>▦ 이 노드 보드로 →</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>트리 아웃라이너 · Outliner</h3>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 11, fontSize: 11, color: "var(--text-3)" }}>
          <span>{kbd("Tab")} 들여쓰기</span>
          <span>{kbd("⇧Tab")} 내어쓰기</span>
          <span>{kbd("Enter")} 새 줄</span>
          <span>{kbd("⌫")} 삭제</span>
        </span>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--text-3)", maxWidth: 760, lineHeight: 1.5 }}>
        임의 깊이로 트리를 적으세요. 각 줄의 <b style={{ color: "var(--text-2)" }}>▦</b> 를 누르면 그 노드로 들어가(focus) 하위가 보드/아웃라이너로 재구성됩니다.
      </p>

      <div ref={containerRef} style={{ maxWidth: 760, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", padding: 8, boxShadow: "var(--shadow)" }}>
        {focusId && (
          <div onClick={goUp} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", marginBottom: 4, borderRadius: 9, cursor: "pointer", color: "var(--text-2)" }}>
            <span style={upIcon}>↑</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>상위로</span>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>· {upParentLabel}</span>
          </div>
        )}
        {rows.map((row) => {
          const m = sMeta(row.status);
          return (
            <div key={row.id} style={{ display: "flex", alignItems: "stretch", minHeight: 36, borderRadius: 9 }}>
              {Array.from({ length: row.depth }).map((_, k) => (
                <span key={k} style={{ width: 22, flex: "none", alignSelf: "stretch", borderRight: "1.5px solid var(--border)" }} />
              ))}
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 9, padding: "0 10px 0 8px" }}>
                {row.isEpic ? (
                  <span onClick={() => setFocusId(row.id)} title="이 노드로 들어가기" style={{ width: 20, height: 20, borderRadius: 6, background: "#8b5cf6", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", cursor: "pointer" }}>E</span>
                ) : (
                  <button onClick={() => setFocusId(row.id)} title="이 노드로 들어가기" style={{ width: 15, height: 15, borderRadius: 5, background: hexA(m.color, 0.2), border: `1.5px solid ${m.color}`, flex: "none", cursor: "pointer", padding: 0 }} />
                )}
                <input
                  key={row.id}
                  defaultValue={row.title}
                  placeholder={row.isEpic ? "제목 입력…" : "할 일 제목 입력…"}
                  data-outline-id={row.id}
                  onBlur={(e) => apply((ns) => commit(ns, row.id, e.target.value))}
                  onKeyDown={(e) => onKey(e, row.id)}
                  style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: row.isEpic ? 14 : 13, fontWeight: row.isEpic ? 700 : 500, color: "var(--text)", padding: "4px 0", letterSpacing: "-.01em" }}
                />
                {!row.isEpic && (
                  <span onClick={() => cycleStatus(row.id)} title="상태 변경" style={{ cursor: "pointer", ...statusChip(row.status) }}>{m.kr}</span>
                )}
                <button onClick={() => setFocusId(row.id)} title="이 노드로 들어가기" style={drillStyle}>{row.hasChildren ? `▦ ${row.doneCount}/${row.childCount}` : "▦ 보드"}</button>
                <span onClick={() => onOpen(row.id)} style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "var(--text-3)", cursor: "pointer", flex: "none" }}>{row.key}</span>
                <span style={avatar(row.assignee, 20)}>{initials(row.assignee)}</span>
              </div>
            </div>
          );
        })}
        <button onClick={() => addChild(focusId)} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "9px 10px", marginTop: 4, border: "none", background: "transparent", color: "var(--text-3)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", borderRadius: 8 }}>+ 항목 추가</button>
      </div>
    </div>
  );
}

const crumbStyle = (cur: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 9px",
  borderRadius: 7,
  border: "none",
  background: cur ? "var(--accent-soft)" : "transparent",
  color: cur ? "var(--accent)" : "var(--text-2)",
  fontSize: 12.5,
  fontWeight: cur ? 700 : 600,
  cursor: cur ? "default" : "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
});
const upIcon: CSSProperties = { width: 20, height: 20, borderRadius: 6, border: "1px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flex: "none" };
const drillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, height: 22, padding: "0 8px", border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface-2)", color: "var(--text-2)", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", flex: "none" };
