// soksak 칸반 플러그인 엔트리 — loader 가 blob-URL 로 import 하는 단일 ESM.
// 뷰는 Shadow DOM 에 마운트(soksak chrome 격리). 헤드리스 커맨드는 뷰 미오픈에도 동작 —
// sok plugin.soksak-plugin-kanban.* / MCP / 소켓 E2E. (M0: ping 만. 전체 커맨드는 M2.)
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/view/App";
import { GLOBAL_CSS } from "@/styles";
import { createStore, type KanbanStore } from "@/store";
import { registerCommands } from "@/commands";

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

function mountApp(container: HTMLElement) {
  unmountApp(container);
  // Shadow DOM 격리 — soksak chrome 전역 스타일 오염 방지. attachShadow 는 요소당 1회.
  const shadow = container.shadowRoot ?? container.attachShadow({ mode: "open" });
  shadow.replaceChildren();

  const style = document.createElement("style");
  style.textContent = GLOBAL_CSS;
  shadow.appendChild(style);

  const host = document.createElement("div");
  host.className = "kanban-root";
  host.style.width = "100%";
  host.style.height = "100%";
  host.style.overflow = "hidden";
  shadow.appendChild(host);

  const root = createRoot(host);
  root.render(
    <ErrBoundary>
      <App store={store} />
    </ErrBoundary>,
  );
  mounts.set(container, { root, shadow });
}

function unmountApp(container: HTMLElement) {
  const state = mounts.get(container);
  if (!state) return;
  state.root.unmount();
  mounts.delete(container);
}

export default {
  activate(ctx: any) {
    const app = ctx.app;

    // 단일 진실 스토어 — app.data 하이드레이트 + cross-window watch.
    store = createStore(app);
    void store.init().catch((e) => console.error("[kanban] store init 실패:", e));
    ctx.subscriptions.push({ dispose: () => store?.dispose() });

    ctx.subscriptions.push(
      app.ui.registerView("kanban", {
        mount(container: HTMLElement) {
          mountApp(container);
        },
        unmount(container: HTMLElement) {
          unmountApp(container);
        },
      }),
    );

    if (app.commands?.register) {
      ctx.subscriptions.push(
        app.commands.register("ping", {
          description: "플러그인 적재/버전 확인(E2E)",
          handler: async () => ({
            ok: true,
            plugin: "soksak-plugin-kanban",
            version: "0.1.0",
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
