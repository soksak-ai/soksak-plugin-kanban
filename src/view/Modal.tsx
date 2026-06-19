// 이슈 모달 — 생성 / 상세(view) / 편집(edit) 통합 + 상태 전환 이력(history).
import type { CSSProperties } from "react";
import type { Node, NodeType, StatusId, PriorityId } from "@/types";
import { STATUSES, PRIORITY, USERS, TYPES } from "@/refs";
import { avatar, initials, userName, statusChip, typeBadge, typeLetter, prDot, sMeta } from "@/view/ui";

export type ModalMode = "create" | "view" | "edit";
export interface Draft {
  title: string;
  body: string;
  type: NodeType;
  status: StatusId;
  assignee: string;
  priority: PriorityId;
  points: number;
  start: string;
  due: string;
}

interface Props {
  mode: ModalMode;
  draft: Draft;
  editing: Node | null;
  setField: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  onClose: () => void;
  onSave: () => void;
  onCreate: () => void;
  onDelete: () => void;
  onEnterEdit: () => void;
  onBackToView: () => void;
}

const label = (t: string) => <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 6 }}>{t}</label>;
const field: CSSProperties = { width: "100%", height: 38, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

export default function Modal({ mode, draft, editing, setField, onClose, onSave, onCreate, onDelete, onEnterEdit, onBackToView }: Props) {
  const isCreate = mode === "create";
  const isView = mode === "view";
  const isEdit = mode === "edit";
  const isForm = isCreate || isEdit;
  const title = isCreate ? "새 이슈 · New issue" : isEdit ? "이슈 편집 · Edit" : "이슈 상세 · Detail";
  const canSave = draft.title.trim().length > 0;
  const hist = editing ? histItems(editing) : [];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,12,18,.42)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-lg)", maxHeight: "88vh", display: "flex", flexDirection: "column", animation: "drawerIn .18s cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid var(--border)", flex: "none" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
          {editing && <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--text-2)", marginLeft: 9 }}>{editing.key}</span>}
          <button onClick={onClose} style={{ marginLeft: "auto", width: 28, height: 28, border: "none", background: "var(--surface-2)", borderRadius: 8, cursor: "pointer", color: "var(--text-2)", fontSize: 15 }}>✕</button>
        </div>

        <div style={{ padding: 18, overflow: "auto" }}>
          {isForm && (
            <>
              <div style={{ marginBottom: 15 }}>
                {label("제목 · Title")}
                <input value={draft.title} onChange={(e) => setField("title", e.target.value)} placeholder="무엇을 해야 하나요?" style={{ ...field, height: 38, fontSize: 14 }} />
              </div>
              <div style={{ marginBottom: 15 }}>
                {label("설명 · Description")}
                <textarea value={draft.body} onChange={(e) => setField("body", e.target.value)} placeholder="상세 내용, 인수 조건 등" style={{ ...field, height: "auto", minHeight: 88, padding: "10px 12px", resize: "vertical", lineHeight: 1.55 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px 12px" }}>
                <div>
                  {label("유형 · Type")}
                  <select value={draft.type} onChange={(e) => setField("type", e.target.value as NodeType)} style={field}>
                    {(["task", "story", "bug", "epic"] as NodeType[]).map((t) => <option key={t} value={t}>{TYPES[t].letter} · {t}</option>)}
                  </select>
                </div>
                <div>
                  {label("상태 · Status")}
                  <select value={draft.status} onChange={(e) => setField("status", e.target.value as StatusId)} style={field}>
                    {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label} · {s.kr}</option>)}
                  </select>
                </div>
                <div>
                  {label("담당자 · Assignee")}
                  <select value={draft.assignee} onChange={(e) => setField("assignee", e.target.value)} style={field}>
                    {Object.keys(USERS).map((k) => <option key={k} value={k}>{USERS[k].name}</option>)}
                  </select>
                </div>
                <div>
                  {label("우선순위 · Priority")}
                  <select value={draft.priority} onChange={(e) => setField("priority", e.target.value as PriorityId)} style={field}>
                    {(Object.keys(PRIORITY) as PriorityId[]).map((k) => <option key={k} value={k}>{PRIORITY[k].label} · {PRIORITY[k].kr}</option>)}
                  </select>
                </div>
                <div>
                  {label("스토리 포인트 · SP")}
                  <input type="number" min={0} value={draft.points} onChange={(e) => setField("points", Number(e.target.value) || 0)} style={{ ...field, fontFamily: "var(--mono)", padding: "0 12px" }} />
                </div>
                <div>
                  {label("마감 · Due")}
                  <input type="date" value={draft.due} onChange={(e) => setField("due", e.target.value)} style={{ ...field, fontFamily: "var(--mono)", padding: "0 11px" }} />
                </div>
              </div>
            </>
          )}

          {isView && editing && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={typeBadge(editing.type)}>{typeLetter(editing.type)}</span>
                <span style={statusChip(editing.status)}>{sMeta(editing.status).kr}</span>
              </div>
              <h2 style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 600, lineHeight: 1.35 }}>{editing.title || "(제목 없음)"}</h2>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 8 }}>설명 · Description</div>
              <p style={{ margin: "0 0 22px", fontSize: 13.5, lineHeight: 1.6, color: editing.body ? "var(--text-2)" : "var(--text-3)", whiteSpace: "pre-wrap", fontStyle: editing.body ? "normal" : "italic" }}>{editing.body || "설명이 아직 없습니다 · No description yet"}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 12px" }}>
                <Meta k="담당자"><span style={avatar(editing.assignee, 24)}>{initials(editing.assignee)}</span><span style={{ fontSize: 13 }}>{userName(editing.assignee)}</span></Meta>
                <Meta k="우선순위"><span style={prDot(editing.priority)} /><span style={{ fontSize: 13 }}>{PRIORITY[editing.priority].label}</span></Meta>
                <Meta k="스토리 포인트"><span style={{ fontSize: 13, fontFamily: "var(--mono)", fontWeight: 600 }}>{editing.points} SP</span></Meta>
                <Meta k="마감"><span style={{ fontSize: 13, fontFamily: "var(--mono)" }}>{editing.due}</span></Meta>
              </div>
            </>
          )}

          {editing && hist.length > 0 && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 14 }}>상태 전환 이력 · History</div>
              {hist.map((hh, i) => (
                <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 16 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: hh.color, flex: "none", marginTop: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {hh.created ? <span style={{ fontSize: 12.5, fontWeight: 600 }}>이슈 생성됨 · Created</span> : <><span style={statusChip(hh.from!)}>{sMeta(hh.from!).kr}</span><span style={{ color: "var(--text-3)" }}>→</span><span style={statusChip(hh.to!)}>{sMeta(hh.to!).kr}</span></>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{hh.by} · {hh.at}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px", borderTop: "1px solid var(--border)", flex: "none" }}>
          {editing && <button onClick={onDelete} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "transparent", color: "#ef4444", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>삭제</button>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {isView && <><button onClick={onClose} style={btnGhost}>닫기</button><button onClick={onEnterEdit} style={btnPrimary}>수정 · Edit</button></>}
            {isEdit && <><button onClick={onBackToView} style={btnGhost}>취소</button><button onClick={onSave} style={{ ...btnPrimary, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}>저장 · Save</button></>}
            {isCreate && <><button onClick={onClose} style={btnGhost}>취소</button><button onClick={onCreate} style={{ ...btnPrimary, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}>이슈 만들기</button></>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 5 }}>{k}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>{children}</div>
    </div>
  );
}

interface HistItem {
  created: boolean;
  from?: StatusId;
  to?: StatusId;
  by: string;
  at: string;
  color: string;
}
function histItems(n: Node): HistItem[] {
  const out: HistItem[] = [{ created: true, by: userName(n.assignee), at: n.start.split("-").slice(1).join("/"), color: "var(--text-3)" }];
  for (const h of n.history) out.push({ created: false, from: h.from, to: h.to, by: userName(h.by), at: h.at.split("-").slice(1).join("/"), color: sMeta(h.to).color });
  return out;
}

const btnGhost: CSSProperties = { padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "transparent", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnPrimary: CSSProperties = { padding: "8px 18px", border: "none", borderRadius: 8, background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" };
