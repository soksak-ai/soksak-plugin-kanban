// 전역 CSS — 디자인의 <style> 블록(:root 변수 기본값 + 다크 + 리셋 + 스크롤바 + keyframes).
// 스킨/테마는 rootStyle 인라인으로 CSS 변수를 덮어쓰므로 여기 :root 값은 폴백. plugin-entry 가
// Shadow DOM <style> 로 격리 주입한다(soksak chrome 오염 방지).
export const GLOBAL_CSS = `
:root{
  --bg:#f1f3f6;--surface:#ffffff;--surface-2:#e9ecf1;--surface-3:#e1e5ec;
  --border:#e3e7ee;--border-2:#d3d9e3;--text:#161a23;--text-2:#5a6373;--text-3:#8a93a4;
  --accent:#5b5bf0;--accent-soft:rgba(91,91,240,.10);--shadow:0 1px 2px rgba(20,24,38,.05);
  --shadow-lg:0 12px 40px rgba(20,24,38,.16);--grid:rgba(20,24,38,.05);
  --mono:'IBM Plex Mono',monospace;--r-card:10px;--r-col:13px;
}
[data-theme="dark"]{
  --bg:#0d0f14;--surface:#171a21;--surface-2:#13161c;--surface-3:#1d212a;
  --border:#262b35;--border-2:#323845;--text:#e7eaf0;--text-2:#9aa3b2;--text-3:#69707e;
  --accent:#7d7dff;--accent-soft:rgba(125,125,255,.14);--shadow:0 1px 2px rgba(0,0,0,.4);
  --shadow-lg:0 16px 48px rgba(0,0,0,.5);--grid:rgba(255,255,255,.05);
}
*{box-sizing:border-box}
.kanban-root{margin:0}
input{font-family:inherit}
::-webkit-scrollbar{height:10px;width:10px}
::-webkit-scrollbar-thumb{background:var(--border-2);border-radius:8px;border:2px solid transparent;background-clip:content-box}
::-webkit-scrollbar-track{background:transparent}
@keyframes pulseRing{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}50%{box-shadow:0 0 0 4px rgba(245,158,11,.22)}}
@keyframes drawerIn{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
`;
