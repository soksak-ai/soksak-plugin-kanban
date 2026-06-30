// 드래프트 배지 DOM 노출 경로 — ui.tree(nodeScan)가 수집하는 data-node 값.
// 호스트 계약(vsterm-tauri NODE_PATH_RE): 소문자 [a-z0-9][a-z0-9.-]* 세그먼트 + '/' 구분만.
// 대문자·한글·_ 위반 시 호스트가 침묵 스킵(배지가 ui.tree 에 안 뜨는 함정). 그래서:
//   - 키는 toLowerCase (행 data-node 규약과 동일)
//   - badge 값은 라틴 매핑(검수전→pending; o/x/f 는 이미 라틴)
//   - 감사 집계는 숫자 인코딩(p<P>.o<O>.x<X>.f<F>)
import type { Badge } from "@/types";
import type { SubValidation } from "@/core/projections";

export const BADGE_LATIN: Record<Badge, string> = { "검수전": "pending", o: "o", x: "x", f: "f" };

/** 항목 검증 배지 노드 경로 — badge/<key>/<pending|o|x|f>. DOM(ui.tree)에서 배지 값 검증. */
export const badgeNodePath = (key: string, badge: Badge): string =>
  `badge/${key.toLowerCase()}/${BADGE_LATIN[badge] ?? "pending"}`;

/** 감사 집계 배지 노드 경로 — audit/<key>/p<P>.o<O>.x<X>.f<F>. f>0 → 덩어리 폐기 대상. */
export const auditNodePath = (key: string, v: SubValidation): string =>
  `audit/${key.toLowerCase()}/p${v.pending}.o${v.o}.x${v.x}.f${v.f}`;
