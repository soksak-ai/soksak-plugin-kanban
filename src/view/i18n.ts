// view i18n — UI 표면 문자열 단일진실. 하드코딩 한국어 제거 게이트.
const strings = {
  // App
  newIssueBtn: { en: "New issue", ko: "새 이슈" },
  searchPlaceholder: { en: "Search", ko: "검색" },
  addItem: { en: "+ Add item", ko: "+ 항목 추가" },
  addCard: { en: "+ Add card", ko: "+ 카드 추가" },
  // Calendar
  byDueLabel: { en: "· by due date", ko: "· 마감 기준" },
  // Outline / Tree / Board shared
  drillInTitle: { en: "Drill in", ko: "이 노드로 들어가기" },
  drillInBtn: { en: "▸ drill in", ko: "▸ 들어가기" },
  drillInBoard: { en: "▦ Board", ko: "▦ 보드" },
  statusChangeTitle: { en: "Change status", ko: "상태 변경" },
  titlePlaceholderEpic: { en: "Enter title…", ko: "제목 입력…" },
  titlePlaceholder: { en: "Enter task title…", ko: "할 일 제목 입력…" },
  noTitle: { en: "(no title)", ko: "(제목 없음)" },
  // Board
  goUpTitle: { en: "Go up", ko: "상위로" },
  goUpBtn: { en: "↑ Up", ko: "↑ 상위로" },
  scopeAll: { en: "All", ko: "전체" },
  scopeDirect: { en: "Direct", ko: "직계만" },
  drillInCard: { en: "↘ drill in", ko: "↘ 들어가기" },
  // Tree
  treeSectionTitle: { en: "Tree · Structure", ko: "트리 구조 · Structure" },
  treeInstruction: { en: "Click a row to drill into that node; use breadcrumbs to go up.", ko: "행을 클릭하면 그 노드로 들어가(재구성), 상위로는 브레드크럼." },
  // Table
  tableTitle: { en: "Table · List", ko: "테이블 · List" },
  colTitle: { en: "Title", ko: "제목" },
  colStatus: { en: "Status", ko: "상태" },
  colAssignee: { en: "Assignee", ko: "담당" },
  colPriority: { en: "Priority", ko: "우선" },
  colDue: { en: "Due", ko: "마감" },
  // Modal — titles
  modalTitleCreate: { en: "New issue", ko: "새 이슈" },
  modalTitleEdit: { en: "Edit issue", ko: "이슈 편집" },
  modalTitleDetail: { en: "Issue detail", ko: "이슈 상세" },
  // Rail (사이드바 방출)
  railDetailEmpty: { en: "Select an issue to open its detail here", ko: "이슈를 선택하면 상세가 여기 열립니다" },
  railNoBinding: { en: "No kanban view bound", ko: "결부된 칸반 뷰 없음" },
  // Modal — field labels
  fieldTitle: { en: "Title", ko: "제목" },
  fieldDesc: { en: "Description", ko: "설명" },
  fieldType: { en: "Type", ko: "유형" },
  fieldStatus: { en: "Status", ko: "상태" },
  fieldAssignee: { en: "Assignee", ko: "담당자" },
  fieldPriority: { en: "Priority", ko: "우선순위" },
  fieldPoints: { en: "Story Points", ko: "스토리 포인트" },
  fieldDue: { en: "Due", ko: "마감" },
  // Modal — placeholders / body
  titlePlaceholderModal: { en: "What needs to be done?", ko: "무엇을 해야 하나요?" },
  bodyPlaceholder: { en: "Details, acceptance criteria, etc.", ko: "상세 내용, 인수 조건 등" },
  noBody: { en: "No description yet", ko: "설명이 아직 없습니다" },
  // Modal — meta section keys
  metaAssignee: { en: "Assignee", ko: "담당자" },
  metaPriority: { en: "Priority", ko: "우선순위" },
  metaPoints: { en: "Story Points", ko: "스토리 포인트" },
  metaDue: { en: "Due", ko: "마감" },
  // Modal — history section
  historyLabel: { en: "History · Status changes", ko: "상태 전환 이력 · History" },
  historyCreated: { en: "Issue created", ko: "이슈 생성됨" },
  // Modal — buttons
  btnClose: { en: "Close", ko: "닫기" },
  btnEdit: { en: "Edit", ko: "수정" },
  btnCancel: { en: "Cancel", ko: "취소" },
  btnSave: { en: "Save", ko: "저장" },
  btnCreate: { en: "Create issue", ko: "이슈 만들기" },
  btnDelete: { en: "Delete", ko: "삭제" },
  // Board stale
  staleDays: { en: "d stale", ko: "일 정체" },
  // Draft validation (oxf 검증 배지)
  draftDiscard: { en: "discard", ko: "폐기" },
  draftAuditTitle: { en: "Audit · validation tally", ko: "감사 · 검증 집계" },
  draftItemTitle: { en: "Validation badge", ko: "검증 배지" },
} as const;

export type ViewI18nKey = keyof typeof strings;

export function t(key: ViewI18nKey, lang: string): string {
  const e = strings[key];
  return (e as Record<string, string>)[lang] ?? e.en;
}

export const VIEW_TABS: { id: string; en: string; ko: string }[] = [
  { id: "outline",  en: "Outliner",  ko: "아웃라이너" },
  { id: "board",    en: "Kanban",    ko: "칸반" },
  { id: "gantt",    en: "Gantt",     ko: "간트" },
  { id: "timeline", en: "Timeline",  ko: "타임라인" },
  { id: "tree",     en: "Tree",      ko: "트리" },
  { id: "table",    en: "Table",     ko: "테이블" },
  { id: "calendar", en: "Calendar",  ko: "캘린더" },
];
