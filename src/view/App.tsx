// 반응 셸 — 헤더(뷰 탭·검색·테마) + stats strip(스킨·진행률·병목) + 뷰 스위치 + 모달.
// UI 상태(view·theme·skin·focus·search·modal)는 창-로컬. 데이터는 store(useNodes) 단일 진실.
// 편집은 store.apply(순수 op) — 명령과 같은 데이터 경로 → 교차뷰 일관성.
import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import type { Node, StatusId, ViewId } from "@/types";
import type { KanbanStore } from "@/store";
import { TODAY, RANGE_END } from "@/refs";
import { byId } from "@/core/tree";
import { insertNode, removeNode } from "@/core/algebra";
import { useNodes } from "@/view/useStore";
import { rootStyle } from "@/view/ui";
import { t, VIEW_TABS } from "@/view/i18n";
import Outline from "@/view/Outline";
import Board from "@/view/Board";
import Tree from "@/view/Tree";
import Gantt from "@/view/Gantt";
import Timeline from "@/view/Timeline";
import Table from "@/view/Table";
import Calendar from "@/view/Calendar";
import Modal, { type Draft, type ModalMode } from "@/view/Modal";

type Disp = { dispose(): void } | (() => void);
interface AppProps {
  store: KanbanStore | null;
  // 테마는 플랫폼 CSS 변수 상속으로 자동 — app 은 focus/view 네비 버스에만 사용.
  app?: {
    bus?: { on?: (topic: string, cb: (p: { focusId: string | null; view?: ViewId }) => void) => Disp };
    locale?: () => string;
    on?: (event: string, cb: (p: { language: string }) => void) => Disp;
  };
}

const dispose = (d: Disp | undefined) => {
  if (typeof d === "function") d();
  else d?.dispose?.();
};

const blankDraft = (): Draft => ({ title: "", body: "", type: "task", status: "todo", assignee: "me", priority: "medium", points: 3, start: TODAY, due: RANGE_END });

export default function App({ store, app }: AppProps) {
  const nodes = useNodes(store);
  const [view, setView] = useState<ViewId>("outline");
  const [search, setSearch] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [scope, setScope] = useState<"direct" | "all">("direct");
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<ModalMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [lang, setLang] = useState<string>(() => app?.locale?.() ?? "ko");

  // 명령 focus.set → GUI 관점(focus)·뷰 이동.
  useEffect(() => {
    const d = app?.bus?.on?.("kanban:nav", (p) => {
      setFocusId(p?.focusId ?? null);
      if (p?.view) setView(p.view);
    });
    return () => dispose(d);
  }, [app]);

  // 로케일 변경 구독.
  useEffect(() => {
    const d = app?.on?.("locale.changed", (p) => setLang(p.language));
    return () => dispose(d);
  }, [app]);

  if (!store) return <div style={{ padding: 24, color: "#888" }}>store 준비 중…</div>;
  const apply = (fn: (ns: Node[]) => Node[]) => void store.apply(fn);
  const editing = editingId ? byId(nodes, editingId) : null;

  const setField = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const openCreate = (status: StatusId) => {
    setDraft({ ...blankDraft(), status });
    setMode("create");
    setEditingId(null);
    setModalOpen(true);
  };
  const openDetail = (id: string) => {
    const n = byId(nodes, id);
    if (!n) return;
    setDraft({ title: n.title, body: n.body, type: n.type, status: n.status, assignee: n.assignee, priority: n.priority, points: n.points, start: n.start, due: n.due });
    setEditingId(id);
    setMode("view");
    setModalOpen(true);
  };
  const enterEdit = () => editing && (setDraft({ title: editing.title, body: editing.body, type: editing.type, status: editing.status, assignee: editing.assignee, priority: editing.priority, points: editing.points, start: editing.start, due: editing.due }), setMode("edit"));
  const createIssue = () => {
    if (!draft.title.trim()) return;
    const now = Date.now();
    const node: Node = { id: store.genId(), key: store.nextKey(), parentId: focusId, order: 0, title: draft.title.trim(), body: draft.body.trim(), type: draft.type, status: draft.status, assignee: draft.assignee, priority: draft.priority, points: draft.points, start: draft.start, due: draft.due, collapsed: false, history: [], created: now, updated: now };
    apply((ns) => insertNode(ns, node));
    setModalOpen(false);
  };
  const saveEdit = () => {
    if (!editingId || !draft.title.trim()) return;
    const id = editingId;
    apply((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const history = draft.status !== n.status ? [...n.history, { from: n.status, to: draft.status, by: "me", at: TODAY }] : n.history;
        return { ...n, title: draft.title.trim(), body: draft.body.trim(), type: draft.type, status: draft.status, assignee: draft.assignee, priority: draft.priority, points: draft.points, start: draft.start, due: draft.due, history, updated: Date.now() };
      }),
    );
    setMode("view");
  };
  const del = () => {
    if (editingId) apply((ns) => removeNode(ns, editingId));
    setModalOpen(false);
  };

  return (
    <div className="kanban-root" style={rootStyle()}>
      {/* TOP BAR */}
      <header style={{ display: "flex", alignItems: "center", gap: 18, padding: "12px 22px", borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 30 }}>
        <nav style={{ display: "flex", gap: 3, background: "var(--surface-2)", padding: 3, borderRadius: 11, marginRight: "auto" }}>
          {VIEW_TABS.map(({ id, en, ko }) => {
            const lbl = lang === "ko" ? ko : en;
            return (
              <button key={id} onClick={() => setView(id as ViewId)} style={tabStyle(view === id as ViewId)}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: view === id ? "var(--accent)" : "var(--text-3)", flex: "none" }} />
                <span>{lbl}</span>
              </button>
            );
          })}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
          <button onClick={() => openCreate("todo")} style={{ height: 34, padding: "0 13px", border: "none", borderRadius: 9, background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontFamily: "inherit" }}><span style={{ fontSize: 17, lineHeight: 1, marginTop: -1 }}>+</span> {t("newIssueBtn", lang)}</button>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPlaceholder", lang)} style={{ height: 34, width: 170, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg)", color: "var(--text)", fontSize: 13, outline: "none" }} />
        </div>
      </header>

      {/* MAIN */}
      <main style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {view === "outline" && <Outline store={store} nodes={nodes} focusId={focusId} setFocusId={setFocusId} onOpen={openDetail} lang={lang} />}
        {view === "board" && <Board store={store} nodes={nodes} focusId={focusId} setFocusId={setFocusId} scope={scope} setScope={setScope} search={search} onOpen={openDetail} onCreate={openCreate} lang={lang} />}
        {view === "tree" && <Tree nodes={nodes} focusId={focusId} setFocusId={setFocusId} onOpen={openDetail} lang={lang} />}
        {view === "gantt" && <Gantt nodes={nodes} onOpen={openDetail} lang={lang} />}
        {view === "timeline" && <Timeline nodes={nodes} onOpen={openDetail} lang={lang} />}
        {view === "table" && <Table nodes={nodes} onOpen={openDetail} lang={lang} />}
        {view === "calendar" && <Calendar nodes={nodes} onOpen={openDetail} lang={lang} />}
      </main>

      {modalOpen && <Modal mode={mode} draft={draft} editing={editing} setField={setField} onClose={() => setModalOpen(false)} onSave={saveEdit} onCreate={createIssue} onDelete={del} onEnterEdit={enterEdit} onBackToView={() => setMode("view")} lang={lang} />}
    </div>
  );
}

const tabStyle = (active: boolean): CSSProperties => ({ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap", background: active ? "var(--surface)" : "transparent", color: active ? "var(--text)" : "var(--text-2)", boxShadow: active ? "var(--shadow)" : "none" });
