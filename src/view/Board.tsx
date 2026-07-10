// 칸반 보드 뷰 — children(focus)를 상태별 컬럼으로. 드래그=상태 변경, 카드 미리보기/진행률/drill.
// 자식 있는 카드 클릭=그 노드로 재구성(focus), 말단 클릭=상세. WIP 초과=병목 강조, 정체 표시.
import { useState } from "react";
import type { CSSProperties } from "react";
import type { Node, StatusId } from "@/types";
import type { KanbanStore } from "@/store";
import { TODAY, resolveLabel } from "@/refs";
import { byId, hasChildren } from "@/core/tree";
import { setStatus } from "@/core/algebra";
import { toBoard, type BoardScope, type CardVM } from "@/core/projections";
import { avatar, initials, typeBadge, typeLetter, prDot, ptsBadge, sMeta } from "@/view/ui";
import { ItemBadge, AuditBadge } from "@/view/badges";
import { cardNodePath } from "@/view/nodePaths";
import ScopeStat from "@/view/ScopeStat";
import { t } from "@/view/i18n";

interface Props {
  store: KanbanStore;
  nodes: Node[];
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  scope: BoardScope;
  setScope: (s: BoardScope) => void;
  search: string;
  onOpen: (id: string) => void;
  onCreate: (status: StatusId) => void;
  lang: string;
}

export default function Board({ store, nodes, focusId, setFocusId, scope, setScope, search, onOpen, onCreate, lang }: Props) {
  const board = toBoard(nodes, focusId, scope, search);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<StatusId | null>(null);

  const drop = (status: StatusId) => {
    if (dragId != null) void store.apply((ns) => setStatus(ns, dragId, status, "me", TODAY));
    setDragId(null);
    setOverStatus(null);
  };
  const goUp = () => {
    if (!focusId) return;
    const n = byId(nodes, focusId);
    setFocusId(n ? n.parentId : null);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* breadcrumb + scope + 아웃라이너로 */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "12px 22px 0", flexWrap: "wrap" }}>
        {focusId && (
          <button onClick={goUp} title={t("goUpTitle", lang)} style={{ height: 26, padding: "0 9px", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg)", color: "var(--text-2)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginRight: 4 }}>{t("goUpBtn", lang)}</button>
        )}
        {board.breadcrumb.map((c, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
            {i > 0 && <span style={{ color: "var(--text-3)", fontSize: 12, margin: "0 1px" }}>/</span>}
            <button onClick={() => setFocusId(c.id)} style={crumbStyle(i === board.breadcrumb.length - 1)}>{c.label}</button>
          </span>
        ))}
        <div style={{ marginLeft: 10, display: "inline-flex", background: "var(--surface-2)", borderRadius: 8, padding: 2 }}>
          <button onClick={() => setScope("all")} style={scopeBtn(scope === "all")}>{t("scopeAll", lang)}</button>
          <button onClick={() => setScope("direct")} style={scopeBtn(scope === "direct")}>{t("scopeDirect", lang)}</button>
        </div>
        <ScopeStat nodes={nodes} focusId={focusId} />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 14, padding: "14px 22px 20px", alignItems: "flex-start", overflowX: "auto" }}>
        {board.columns.map((col) => {
          const over = overStatus === col.id;
          return (
            <div key={col.id} style={{ width: 278, flex: "none", background: "var(--surface-2)", borderRadius: "var(--r-col)", border: col.bottleneck ? "1px solid rgba(245,158,11,.4)" : "1px solid var(--border)", display: "flex", flexDirection: "column", maxHeight: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 9px" }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: col.color, flex: "none" }} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{resolveLabel(col.label, lang)}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", padding: "1px 8px", borderRadius: 99, background: col.bottleneck ? "rgba(245,158,11,.16)" : "var(--surface-3)", color: col.bottleneck ? "#f59e0b" : "var(--text-3)", animation: col.bottleneck ? "pulseRing 1.8s ease-in-out infinite" : "none" }}>{col.wip != null ? `${col.count}/${col.wip}` : col.count}</span>
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overStatus !== col.id) setOverStatus(col.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(col.id);
                }}
                style={{ position: "relative", display: "flex", flexDirection: "column", gap: 9, padding: "4px 10px 12px", overflowY: "auto", minHeight: 80 }}
              >
                {over && <div style={{ position: "absolute", inset: 4, border: "2px dashed var(--accent)", borderRadius: 10, background: "var(--accent-soft)", pointerEvents: "none", zIndex: 2 }} />}
                {col.cards.map((card) => (
                  <Card key={card.id} card={card} lang={lang} dragging={dragId === card.id} onDragStart={() => setDragId(card.id)} onDragEnd={() => { setDragId(null); setOverStatus(null); }} onSelect={() => (hasChildren(nodes, card.id) ? setFocusId(card.id) : onOpen(card.id))} onDrill={() => setFocusId(card.id)} />
                ))}
                <button onClick={() => onCreate(col.id)} style={{ width: "100%", padding: 8, border: "1px dashed var(--border-2)", borderRadius: "var(--r-card)", background: "transparent", color: "var(--text-3)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t("addCard", lang)}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({ card, lang, dragging, onDragStart, onDragEnd, onSelect, onDrill }: { card: CardVM; lang: string; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onSelect: () => void; onDrill: () => void }) {
  return (
    <div
      data-node={cardNodePath(card.key)}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: card.stale ? "3px solid #f59e0b" : "1px solid var(--border)", borderRadius: "var(--r-card)", padding: "11px 12px", display: "flex", flexDirection: "column", gap: 9, cursor: "grab", boxShadow: "var(--shadow)", userSelect: "none", opacity: dragging ? 0.35 : 1, transition: "box-shadow .15s,opacity .15s" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={typeBadge(card.type)}>{typeLetter(card.type)}</span>
        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "var(--mono)", color: "var(--text-3)" }}>{card.key}</span>
        <span style={prDot(card.priority)} />
        {card.stale && <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,.14)", padding: "1px 6px", borderRadius: 6 }}>{card.staleDays}{t("staleDays", lang)}</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>{card.title || t("noTitle", lang)}</div>
      {/* 요건 설명(사람용 부제) — body(exec 입력)는 표시 안 함 */}
      {card.description && <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.45 }}>{card.description}</div>}
      {/* 검증 축(드래프트): 덩어리·그룹=감사 집계, 항목=자기 oxf 배지 */}
      {(card.validation || card.badge) && (
        <div style={{ display: "flex" }}>
          {card.validation ? <AuditBadge v={card.validation} lang={lang} nodeKey={card.key} /> : <ItemBadge badge={card.badge!} lang={lang} nodeKey={card.key} />}
        </div>
      )}
      {card.showPath && <span style={pathChip}>↳ {card.parentLabel}</span>}
      {card.hasChildren && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 9px", background: "var(--surface-2)", borderRadius: 8 }}>
            {card.preview.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-2)", overflow: "hidden" }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, flex: "none", background: sMeta(p.status).color }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
              </div>
            ))}
            {card.childCount > 3 && <span style={{ fontSize: 10, color: "var(--text-3)", paddingLeft: 12 }}>+{card.childCount - 3} more…</span>}
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 99, background: "var(--surface-3)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${card.progress?.pct ?? 0}%`, background: "var(--accent)", borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)" }}>{card.progress ? `${card.progress.done}/${card.progress.total}` : ""}</span>
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onDrill(); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, width: "100%", justifyContent: "center", marginTop: 2, height: 27, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-2)", color: "var(--text-2)", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>{t("drillInCard", lang)}</button>
        </>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={avatar(card.assignee, 22)}>{initials(card.assignee)}</span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtDue(card.due)}</span>
        <span style={ptsBadge()}>{card.points}</span>
      </div>
    </div>
  );
}

const fmtDue = (d: string) => {
  const a = d.split("-");
  return `${+a[1]}/${+a[2]}`;
};
const pathChip: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", fontSize: 10, fontWeight: 600, color: "var(--text-3)", background: "var(--surface-2)", borderRadius: 6, padding: "2px 7px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const crumbStyle = (cur: boolean): CSSProperties => ({ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 7, border: "none", background: cur ? "var(--accent-soft)" : "transparent", color: cur ? "var(--accent)" : "var(--text-2)", fontSize: 12.5, fontWeight: cur ? 700 : 600, cursor: cur ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
const scopeBtn = (active: boolean): CSSProperties => ({ height: 24, padding: "0 10px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", background: active ? "var(--surface)" : "transparent", color: active ? "var(--text)" : "var(--text-3)", boxShadow: active ? "var(--shadow)" : "none" });
