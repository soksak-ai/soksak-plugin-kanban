// 데모 시드 — 디자인(Kanban Flow Board.dc.html)의 issues 배열을 parentId+order 노드로 포팅.
// depth 4 까지: E1 > 101(PG 연동) > 401(게이트웨이) > 412(토스·카카오) > 421(샌드박스 키).
// order 는 등장 순서대로 부모 그룹별 0..n-1 로 부여.
import type { Node, NodeType, StatusId, PriorityId, HistoryEntry } from "@/types";

interface SeedRow {
  id: string;
  key: string;
  type: NodeType;
  title: string;
  status: StatusId;
  assignee: string;
  priority: PriorityId;
  points: number;
  start: string;
  due: string;
  parentId: string | null;
  history: HistoryEntry[];
}

const h = (from: StatusId, to: StatusId, by: string, at: string): HistoryEntry => ({ from, to, by, at });

const DESC: Record<string, string> = {
  "WMP-100": "결제 플로우 전반을 PG v3 기준으로 재설계한다. 안정성·정산 정확도 개선이 목표.",
  "WMP-200": "신규 사용자의 첫 7일 경험을 개선해 활성화율을 높인다.",
  "WMP-300": "이벤트 기반 데이터 수집·적재 파이프라인을 구축한다.",
  "WMP-101": "레거시 PG SDK를 v3 어댑터로 교체하고 타임아웃·재시도 정책을 표준화한다. 결제 모듈 의존성을 정리한다.",
  "WMP-102": "결제 실패 시 지수 백오프로 최대 3회 재시도하고, 멱등키로 중복 청구를 방지한다.",
  "WMP-103": "부분 환불·전액 환불을 모두 지원하는 Refund API v2를 설계·구현한다.",
  "WMP-104": "결제 완료 시 영수증 PDF를 생성해 사용자 이메일로 발송한다.",
  "WMP-105": "동일 주문이 짧은 시간 내 2건 청구되는 버그. 멱등 처리 누락이 의심된다. 우선순위 최상.",
  "WMP-201": "3단계 가입 플로우를 1페이지 점진 공개(progressive disclosure) 방식으로 재설계한다.",
  "WMP-202": "가입 직후 이메일 인증 링크를 발송하고 검증하는 플로우를 구현한다.",
  "WMP-203": "첫 로그인 후 핵심 작업 5개를 안내하는 온보딩 체크리스트를 만든다.",
  "WMP-204": "신규 가입자에게 발송되는 환영 이메일 템플릿을 제작한다.",
  "WMP-205": "특정 브라우저에서 가입 버튼이 비활성 상태로 남는 버그. 폼 검증 로직 확인 필요.",
  "WMP-206": "Google·GitHub SSO 로그인 옵션을 추가한다.",
  "WMP-301": "클라이언트 이벤트 수집을 위한 공통 스키마를 정의한다.",
  "WMP-302": "매시간 ETL 잡을 실행하는 스케줄러를 구성한다.",
  "WMP-303": "핵심 지표를 보여주는 분석 대시보드를 구축한다.",
  "WMP-304": "일부 이벤트가 적재되지 않고 누락되는 버그. 큐 유실이 의심된다.",
  "WMP-305": "수집 데이터의 무결성을 검증하는 룰을 작성한다.",
};

const ROWS: SeedRow[] = [
  { id: "E1", key: "WMP-100", type: "epic", title: "결제 시스템 개편 · Payments Revamp", status: "inprogress", assignee: "JH", priority: "high", points: 0, start: "2026-06-02", due: "2026-06-26", parentId: null, history: [] },
  { id: "E2", key: "WMP-200", type: "epic", title: "온보딩 UX 개선 · Onboarding UX", status: "inprogress", assignee: "SP", priority: "high", points: 0, start: "2026-06-04", due: "2026-06-24", parentId: null, history: [] },
  { id: "E3", key: "WMP-300", type: "epic", title: "데이터 파이프라인 · Data Pipeline", status: "todo", assignee: "DY", priority: "medium", points: 0, start: "2026-06-10", due: "2026-06-28", parentId: null, history: [] },
  { id: "101", key: "WMP-101", type: "task", title: "PG 연동 리팩터링 · Refactor PG integration", status: "inprogress", assignee: "AK", priority: "high", points: 5, start: "2026-06-05", due: "2026-06-19", parentId: "E1", history: [h("backlog", "todo", "SP", "2026-06-03"), h("todo", "inprogress", "AK", "2026-06-12")] },
  { id: "401", key: "WMP-401", type: "task", title: "게이트웨이 추상화 레이어 · Gateway abstraction", status: "inprogress", assignee: "AK", priority: "high", points: 3, start: "2026-06-06", due: "2026-06-18", parentId: "101", history: [h("todo", "inprogress", "AK", "2026-06-13")] },
  { id: "411", key: "WMP-411", type: "task", title: "PG 어댑터 인터페이스 정의 · Adapter interface", status: "done", assignee: "AK", priority: "medium", points: 2, start: "2026-06-06", due: "2026-06-10", parentId: "401", history: [h("inprogress", "done", "AK", "2026-06-10")] },
  { id: "412", key: "WMP-412", type: "task", title: "토스·카카오 어댑터 구현 · Toss/Kakao adapters", status: "inprogress", assignee: "DY", priority: "high", points: 3, start: "2026-06-11", due: "2026-06-19", parentId: "401", history: [h("todo", "inprogress", "DY", "2026-06-14")] },
  { id: "421", key: "WMP-421", type: "task", title: "샌드박스 키 발급 · Sandbox keys", status: "done", assignee: "DY", priority: "low", points: 1, start: "2026-06-11", due: "2026-06-13", parentId: "412", history: [h("inprogress", "done", "DY", "2026-06-13")] },
  { id: "402", key: "WMP-402", type: "task", title: "에러 코드 매핑 테이블 · Error code mapping", status: "review", assignee: "JH", priority: "medium", points: 2, start: "2026-06-09", due: "2026-06-17", parentId: "101", history: [h("inprogress", "review", "JH", "2026-06-15")] },
  { id: "102", key: "WMP-102", type: "task", title: "결제 실패 재시도 로직 · Payment retry logic", status: "review", assignee: "JH", priority: "high", points: 3, start: "2026-06-08", due: "2026-06-17", parentId: "E1", history: [h("todo", "inprogress", "JH", "2026-06-09"), h("inprogress", "review", "JH", "2026-06-15")] },
  { id: "103", key: "WMP-103", type: "task", title: "환불 API v2 · Refund API v2", status: "todo", assignee: "DY", priority: "medium", points: 5, start: "2026-06-15", due: "2026-06-24", parentId: "E1", history: [h("backlog", "todo", "DY", "2026-06-13")] },
  { id: "104", key: "WMP-104", type: "task", title: "결제 영수증 PDF · Receipt PDF", status: "done", assignee: "SY", priority: "low", points: 2, start: "2026-06-02", due: "2026-06-09", parentId: "E1", history: [h("inprogress", "review", "SY", "2026-06-07"), h("review", "done", "SY", "2026-06-09")] },
  { id: "105", key: "WMP-105", type: "bug", title: "중복 결제 발생 · Duplicate charge", status: "inprogress", assignee: "AK", priority: "highest", points: 3, start: "2026-06-14", due: "2026-06-20", parentId: "E1", history: [h("todo", "inprogress", "AK", "2026-06-16")] },
  { id: "201", key: "WMP-201", type: "story", title: "신규 가입 플로우 리디자인 · Signup flow redesign", status: "inprogress", assignee: "SP", priority: "high", points: 8, start: "2026-06-06", due: "2026-06-22", parentId: "E2", history: [h("todo", "inprogress", "SP", "2026-06-10")] },
  { id: "501", key: "WMP-501", type: "task", title: "가입 화면 디자인 QA · Design QA", status: "todo", assignee: "SP", priority: "medium", points: 2, start: "2026-06-16", due: "2026-06-21", parentId: "201", history: [] },
  { id: "502", key: "WMP-502", type: "task", title: "폼 검증 로직 · Form validation", status: "inprogress", assignee: "TL", priority: "high", points: 3, start: "2026-06-12", due: "2026-06-20", parentId: "201", history: [h("todo", "inprogress", "TL", "2026-06-15")] },
  { id: "511", key: "WMP-511", type: "task", title: "비밀번호 정책 적용 · Password policy", status: "review", assignee: "TL", priority: "medium", points: 2, start: "2026-06-13", due: "2026-06-19", parentId: "502", history: [h("inprogress", "review", "TL", "2026-06-16")] },
  { id: "202", key: "WMP-202", type: "task", title: "이메일 인증 · Email verification", status: "review", assignee: "TL", priority: "medium", points: 3, start: "2026-06-09", due: "2026-06-18", parentId: "E2", history: [h("todo", "inprogress", "TL", "2026-06-11"), h("inprogress", "review", "TL", "2026-06-16")] },
  { id: "203", key: "WMP-203", type: "story", title: "온보딩 체크리스트 · Onboarding checklist", status: "todo", assignee: "SY", priority: "medium", points: 5, start: "2026-06-16", due: "2026-06-25", parentId: "E2", history: [] },
  { id: "204", key: "WMP-204", type: "task", title: "환영 이메일 템플릿 · Welcome email", status: "done", assignee: "SP", priority: "low", points: 2, start: "2026-06-04", due: "2026-06-08", parentId: "E2", history: [h("inprogress", "review", "SP", "2026-06-06"), h("review", "done", "SP", "2026-06-08")] },
  { id: "205", key: "WMP-205", type: "bug", title: "가입 버튼 비활성 · Signup button disabled", status: "done", assignee: "TL", priority: "high", points: 1, start: "2026-06-05", due: "2026-06-07", parentId: "E2", history: [h("inprogress", "done", "TL", "2026-06-07")] },
  { id: "206", key: "WMP-206", type: "story", title: "SSO 로그인 · SSO login", status: "backlog", assignee: "AK", priority: "medium", points: 5, start: "2026-06-20", due: "2026-06-27", parentId: "E2", history: [] },
  { id: "301", key: "WMP-301", type: "task", title: "이벤트 수집 스키마 · Event schema", status: "inprogress", assignee: "DY", priority: "high", points: 5, start: "2026-06-12", due: "2026-06-22", parentId: "E3", history: [h("todo", "inprogress", "DY", "2026-06-13")] },
  { id: "601", key: "WMP-601", type: "task", title: "스키마 버저닝 · Schema versioning", status: "todo", assignee: "DY", priority: "medium", points: 3, start: "2026-06-14", due: "2026-06-22", parentId: "301", history: [] },
  { id: "602", key: "WMP-602", type: "bug", title: "PII 마스킹 규칙 · PII masking", status: "inprogress", assignee: "DY", priority: "high", points: 2, start: "2026-06-13", due: "2026-06-20", parentId: "301", history: [h("todo", "inprogress", "DY", "2026-06-15")] },
  { id: "302", key: "WMP-302", type: "task", title: "ETL 잡 스케줄러 · ETL scheduler", status: "backlog", assignee: "JH", priority: "medium", points: 8, start: "2026-06-18", due: "2026-06-28", parentId: "E3", history: [] },
  { id: "303", key: "WMP-303", type: "story", title: "데이터 대시보드 · Analytics dashboard", status: "backlog", assignee: "SY", priority: "low", points: 5, start: "2026-06-22", due: "2026-06-28", parentId: "E3", history: [] },
  { id: "304", key: "WMP-304", type: "bug", title: "누락 이벤트 발생 · Missing events", status: "review", assignee: "DY", priority: "high", points: 2, start: "2026-06-11", due: "2026-06-18", parentId: "E3", history: [h("todo", "inprogress", "DY", "2026-06-12"), h("inprogress", "review", "DY", "2026-06-13")] },
  { id: "305", key: "WMP-305", type: "task", title: "데이터 검증 룰 · Validation rules", status: "done", assignee: "AK", priority: "medium", points: 3, start: "2026-06-08", due: "2026-06-12", parentId: "E3", history: [h("inprogress", "review", "AK", "2026-06-10"), h("review", "done", "AK", "2026-06-12")] },
];

/** 디자인 데모 트리(29 노드, depth 4)를 Node[] 로. order 는 부모 그룹별 등장 순서. */
export function seedNodes(now = 0): Node[] {
  const counter = new Map<string | null, number>();
  return ROWS.map((r) => {
    const ord = counter.get(r.parentId) ?? 0;
    counter.set(r.parentId, ord + 1);
    return {
      id: r.id,
      key: r.key,
      parentId: r.parentId,
      order: ord,
      title: r.title,
      body: DESC[r.key] ?? "",
      type: r.type,
      status: r.status,
      assignee: r.assignee,
      priority: r.priority,
      points: r.points,
      start: r.start,
      due: r.due,
      collapsed: false,
      history: r.history,
      created: now,
      updated: now,
    };
  });
}
