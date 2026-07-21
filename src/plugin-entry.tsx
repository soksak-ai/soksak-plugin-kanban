// soksak 칸반 플러그인 엔트리 — loader 가 blob-URL 로 import 하는 단일 ESM.
// 뷰는 Shadow DOM 에 마운트(soksak chrome 격리). 헤드리스 커맨드는 뷰 미오픈에도 동작 —
// sok plugin.soksak-plugin-kanban.* / MCP / 소켓 E2E. (M0: ping 만. 전체 커맨드는 M2.)
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/view/App";
import { GLOBAL_CSS } from "@/styles";
import { createStore, type KanbanStore } from "@/store";
import { registerCommands } from "@/commands";
import { registerRailContainer, type RailSlot } from "@/view/railBridge";
import { t } from "@/view/i18n";

class ErrBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[kanban] App 렌더 오류:", err, info.componentStack);
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 16, color: "#f88", fontFamily: "system-ui", fontSize: 13 }}>
          칸반 렌더 오류: {this.state.err.message || String(this.state.err)}
        </div>
      );
    }
    return this.props.children;
  }
}

const mounts = new WeakMap<HTMLElement, { root: Root; shadow: ShadowRoot }>();
let store: KanbanStore | null = null;
let pluginApp: unknown = null;

function mountApp(container: HTMLElement, viewId: string | null) {
  unmountApp(container);
  // 컨테이너를 위치 기준으로 — host 를 absolute inset:0 로 채워 컨테이너 높이가 indefinite
  // (예: 터미널과 한 패널 공유)여도 패널 박스를 꽉 채운다.
  container.style.position = "relative";

  // Shadow DOM 격리 — soksak chrome 전역 스타일 오염 방지. attachShadow 는 요소당 1회.
  const shadow = container.shadowRoot ?? container.attachShadow({ mode: "open" });
  shadow.replaceChildren();

  const style = document.createElement("style");
  style.textContent = GLOBAL_CSS;
  shadow.appendChild(style);

  const host = document.createElement("div");
  host.className = "kanban-root";
  host.style.position = "absolute";
  host.style.inset = "0";
  host.style.overflow = "hidden";
  shadow.appendChild(host);

  try {
    const root = createRoot(host);
    root.render(
      <ErrBoundary>
        <App store={store} app={pluginApp as never} viewId={viewId} />
      </ErrBoundary>,
    );
    mounts.set(container, { root, shadow });
  } catch (e) {
    host.textContent = "[kanban] mount 실패: " + (e instanceof Error ? e.message : String(e));
    host.style.color = "#f88";
    host.style.padding = "16px";
    host.style.font = "13px system-ui";
    console.error("[kanban] mount 실패:", e);
  }
}

function unmountApp(container: HTMLElement) {
  const state = mounts.get(container);
  if (!state) return;
  state.root.unmount();
  mounts.delete(container);
}

// 방출된 사이드바(rail) — 컨테이너만 소유하고 내용은 결부된 칸반 App 이 포털로 그린다
// (상태 단일 소유·이중 진실 0). Shadow DOM + GLOBAL_CSS 로 콘텐츠 뷰와 같은 토큰을 쓴다.
// 미결부(칸반 콘텐츠 뷰 없음)면 정적 안내.
const railCleanups = new WeakMap<HTMLElement, () => void>();
function railView(slot: RailSlot) {
  return {
    mount(container: HTMLElement, vctx?: { boundViewId?: string | null }) {
      railCleanups.get(container)?.();
      const shadow = container.shadowRoot ?? container.attachShadow({ mode: "open" });
      shadow.replaceChildren();
      const style = document.createElement("style");
      style.textContent = GLOBAL_CSS;
      shadow.appendChild(style);
      const host = document.createElement("div");
      host.className = "kanban-root";
      host.style.cssText =
        "position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--bg);color:var(--text)";
      container.style.position = "relative";
      shadow.appendChild(host);
      const bound = typeof vctx?.boundViewId === "string" && vctx.boundViewId ? vctx.boundViewId : null;
      if (!bound) {
        const note = document.createElement("div");
        note.style.cssText = "padding:12px 14px;font-size:11px;color:var(--text-3)";
        const lang = (pluginApp as { locale?: () => string } | null)?.locale?.() ?? "ko";
        note.textContent = t("railNoBinding", lang);
        host.appendChild(note);
        railCleanups.set(container, () => shadow.replaceChildren());
        return;
      }
      const off = registerRailContainer(bound, slot, host);
      railCleanups.set(container, () => {
        off();
        shadow.replaceChildren();
      });
    },
    unmount(container: HTMLElement) {
      railCleanups.get(container)?.();
      railCleanups.delete(container);
    },
  };
}

export default {
  activate(ctx: any) {
    const app = ctx.app;

    // 단일 진실 스토어 — app.data 하이드레이트 + cross-window watch.
    pluginApp = app;
    store = createStore(app);
    void store.init().catch((e) => console.error("[kanban] store init 실패:", e));
    ctx.subscriptions.push({ dispose: () => store?.dispose() });

    ctx.subscriptions.push(
      app.ui.registerView("kanban", {
        mount(container: HTMLElement, vctx?: { viewId?: string | null }) {
          mountApp(container, typeof vctx?.viewId === "string" && vctx.viewId ? vctx.viewId : null);
        },
        unmount(container: HTMLElement) {
          unmountApp(container);
        },
      }),
    );
    ctx.subscriptions.push(app.ui.registerView("tree", railView("tree")));
    ctx.subscriptions.push(app.ui.registerView("detail", railView("detail")));

    if (app.commands?.register) {
      ctx.subscriptions.push(
        app.commands.register("ping", {
          description: "플러그인 적재/버전 확인(E2E)",
          message: (d: any) => `칸반 플러그인 v${d.version} 정상`,
          handler: async () => ({
            ok: true,
            plugin: "soksak-plugin-kanban",
            version: "0.0.1",
            phase: "M2",
          }),
        }),
      );
    }

    // 전체 명령 표면(node/outline/board/focus/view/수명주기) 등록.
    registerCommands(ctx, store);
  },
  deactivate() {
    store?.dispose();
    store = null;
  },
};
