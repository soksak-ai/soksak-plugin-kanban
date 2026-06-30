// 데이터 모델 — Workflowy 식: 구조는 오직 parentId(부모 참조) + order(형제 순서) 둘로만 표현.
// 무한 깊이는 parentId 사슬로, 순서는 같은 parentId 형제 중 order(0..n-1)로. 나머지는 payload.
// 중첩 객체·children 배열 금지 — 평면 노드 리스트. 모든 구조 연산은 parentId/order 만 바꾼다.

export type StatusId = "backlog" | "todo" | "inprogress" | "review" | "done";
export type NodeType = "epic" | "story" | "task" | "bug";
export type PriorityId = "highest" | "high" | "medium" | "low";

/** 상태 전환 이력 한 건. */
export interface HistoryEntry {
  from: StatusId;
  to: StatusId;
  by: string; // 멤버 id
  at: string; // YYYY-MM-DD
}

/** 트리 노드 — 카드이자 (자기 자식들의) 보드 호스트. */
export interface Node {
  id: string;
  key: string; // "WMP-NNN" 표시 키(고유)
  parentId: string | null; // ── 구조 ①: 부모 참조 (null = 최상위)
  order: number; // ── 구조 ②: 같은 parentId 형제 중 위치(0..n-1)
  title: string;
  body: string; // 구체화 본문 (워크플로: 실행 지시 — prompt/schema/tools)
  blockedBy?: string[]; // 의존: 이 노드들이 done 이어야 시작 가능(병렬/순차를 데이터로 표현)
  result?: string; // 실행 결과(워크플로 노드 완료 시 기록; 재실행 시 초기화)
  locked?: boolean; // 워크플로 파생 노드 — 사람의 드래그 이동·트리 분리·삭제 금지(스케줄러 전용)
  type: NodeType;
  status: StatusId;
  assignee: string; // 멤버 id
  priority: PriorityId;
  points: number;
  start: string; // YYYY-MM-DD
  due: string; // YYYY-MM-DD
  collapsed: boolean; // 아웃라인 접힘
  history: HistoryEntry[];
  created: number;
  updated: number;
}

export type ViewId = "outline" | "board" | "gantt" | "timeline" | "tree" | "table" | "calendar";
