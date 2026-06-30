// 드래프트 검증 배지(규칙 D) — 항목=자기 oxf 배지, 그룹·덩어리 부모=감사 집계.
// status(예정/진행/완료) 와 다른 축. 검수전=대기 → o=통과 / x=버림 / f=치명(f≥1 → 덩어리 폐기 대상).
import type { Badge } from "@/types";
import type { SubValidation } from "@/core/projections";
import { BADGES, resolveLabel } from "@/refs";
import { hexA } from "@/view/ui";
import { t } from "@/view/i18n";
import { badgeNodePath, auditNodePath } from "@/view/nodePaths";

const bMeta = (id: Badge) => BADGES.find((b) => b.id === id)!;
const AUDIT_ORDER: Badge[] = ["o", "x", "f", "검수전"];

/** 항목 자기 검증 배지(검수전 → o/x/f). status 칩 대신 단다. nodeKey 주면 ui.tree 에 배지 값 노출(DOM 검증). */
export function ItemBadge({ badge, lang, nodeKey }: { badge: Badge; lang: string; nodeKey?: string }) {
  const m = bMeta(badge);
  return (
    <span
      {...(nodeKey ? { "data-node": badgeNodePath(nodeKey, badge) } : {})}
      title={t("draftItemTitle", lang)}
      style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: hexA(m.color, 0.14), color: m.color, flex: "none" }}
    >
      {resolveLabel(m.label, lang)}
    </span>
  );
}

/** 그룹·덩어리 부모 감사 집계 — o/x/f/검수전 카운트. f≥1 → 폐기 강조. nodeKey 주면 ui.tree 에 집계 노출(DOM 검증). */
export function AuditBadge({ v, lang, nodeKey }: { v: SubValidation; lang: string; nodeKey?: string }) {
  const fColor = bMeta("f").color;
  return (
    <span
      {...(nodeKey ? { "data-node": auditNodePath(nodeKey, v) } : {})}
      title={t("draftAuditTitle", lang)}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, flex: "none", border: v.discard ? `1px solid ${fColor}` : "1px solid var(--border)", background: v.discard ? hexA(fColor, 0.1) : "var(--surface-2)" }}
    >
      {AUDIT_ORDER.map((id) => {
        const n = id === "o" ? v.o : id === "x" ? v.x : id === "f" ? v.f : v.pending;
        return (
          <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 3, color: n > 0 ? bMeta(id).color : "var(--text-3)" }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: bMeta(id).color, opacity: n > 0 ? 1 : 0.3 }} />
            {n}
          </span>
        );
      })}
      {v.discard && <span style={{ color: fColor, fontWeight: 700 }}>{t("draftDiscard", lang)}</span>}
    </span>
  );
}
