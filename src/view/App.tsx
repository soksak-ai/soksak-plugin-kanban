// M0/M2 스캐폴드 플레이스홀더 — M3 에서 반응 셸 + Outline/Board, M4 에서 나머지 뷰로 교체.
import type { KanbanStore } from "@/store";

export default function App({ store }: { store: KanbanStore | null }) {
  const count = store?.get().length ?? 0;
  return (
    <div
      style={{
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        color: "var(--text-2)",
        background: "var(--bg)",
        height: "100%",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>칸반 · Kanban</div>
      <div style={{ fontSize: 12, marginTop: 6 }}>
        반응 셸/뷰 준비 중 (M2) — 노드 {count}개. 명령은 CLI/MCP 로 동작합니다.
      </div>
    </div>
  );
}
