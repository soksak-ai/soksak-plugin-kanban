// DOM 노드 경로 단일진실 — C2 투명성의 DOM 축. 뷰의 조작 요소를 data-node 로 배선하면
// ui.tree(nodeScan)가 절대주소로 수집하고 ui.input.click 이 합성 click 으로 도달한다.
// 호스트 계약(vsterm-tauri NODE_PATH_RE): 소문자 [a-z0-9][a-z0-9.-]* 세그먼트 + '/' 구분만.
// 대문자·한글·_ 위반 시 호스트가 침묵 스킵(요소가 ui.tree 에 안 뜨는 함정). 그래서:
//   - 키는 toLowerCase (전 경로 규약)
//   - badge 값은 라틴 매핑(검수전→pending; o/x/f 는 이미 라틴)
//   - 감사 집계는 숫자 인코딩(p<P>.o<O>.x<X>.f<F>)
import type { Badge } from "@/types";
import type { SubValidation } from "@/core/projections";

// 선언(plugin.json contributes.nodes)과 배선(아래 빌더)이 참조하는 단일 노드-id 원장.
// nodes.test.ts 가 이 원장 ≡ 매니페스트 선언 을 양방향으로 강제한다.
export const NODE_IDS = ["tab", "new-issue", "card", "row", "badge", "audit"] as const;
export type NodeId = (typeof NODE_IDS)[number];

// 상단 뷰 탭 — tab/<view>. click=뷰 전환.
export const tabNodePath = (view: string): string => `tab/${view}`;

// 새 이슈 버튼 — click=생성 모달.
export const NEW_ISSUE_NODE = "new-issue";

// 보드 카드 — card/<key>. click=자식 있으면 drill, 말단이면 상세.
export const cardNodePath = (key: string): string => `card/${key.toLowerCase()}`;

// 아웃라인 행 — row/<key>. 행 앵커(ui.tree 로 위치·상태 판독).
export const rowNodePath = (key: string): string => `row/${key.toLowerCase()}`;

export const BADGE_LATIN: Record<Badge, string> = { "검수전": "pending", o: "o", x: "x", f: "f" };

/** 항목 검증 배지 노드 경로 — badge/<key>/<pending|o|x|f>. DOM(ui.tree)에서 배지 값 검증. */
export const badgeNodePath = (key: string, badge: Badge): string =>
  `badge/${key.toLowerCase()}/${BADGE_LATIN[badge] ?? "pending"}`;

/** 감사 집계 배지 노드 경로 — audit/<key>/p<P>.o<O>.x<X>.f<F>. f>0 → 덩어리 폐기 대상. */
export const auditNodePath = (key: string, v: SubValidation): string =>
  `audit/${key.toLowerCase()}/p${v.pending}.o${v.o}.x${v.x}.f${v.f}`;
