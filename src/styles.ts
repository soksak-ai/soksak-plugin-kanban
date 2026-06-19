// 전역 CSS — 플랫폼(soksak) 테마를 그대로 따른다. 자체 팔레트/스킨 없음.
// 플랫폼이 document.documentElement 에 설정하는 테마 변수(--bg/--card/--side/--inset/--fg/
// --fg2/--fg3/--bd/--bd-soft/--acc/--accbg/--shadow/--app-font)는 CSS 변수 상속으로 Shadow DOM
// 안까지 들어온다. 디자인이 쓰는 변수 이름(--surface/--text/--accent …)은 플랫폼 변수의 별칭으로 매핑.
// 테마 모드(light/dark) 전환도 플랫폼이 변수 값만 바꾸면 var() 재해석으로 자동 재페인트(React 불필요).
export const GLOBAL_CSS = `
.kanban-root{
  --surface: var(--card);
  --surface-2: var(--side);
  --surface-3: var(--inset);
  --border: var(--bd);
  --border-2: var(--bd);
  --text: var(--fg);
  --text-2: var(--fg2);
  --text-3: var(--fg3);
  --accent: var(--acc);
  --accent-soft: var(--accbg);
  --grid: var(--bd-soft, var(--bd));
  --shadow-lg: var(--shadow);
  --mono: ui-monospace,'SF Mono',Menlo,Consolas,'Courier New',monospace;
  --r-card:10px;
  --r-col:13px;
  font-family: var(--app-font, system-ui, sans-serif);
}
*{box-sizing:border-box}
.kanban-root input,.kanban-root textarea,.kanban-root select,.kanban-root button{font-family:inherit}
.kanban-root ::-webkit-scrollbar{height:10px;width:10px}
.kanban-root ::-webkit-scrollbar-thumb{background:var(--bd);border-radius:8px;border:2px solid transparent;background-clip:content-box}
.kanban-root ::-webkit-scrollbar-track{background:transparent}
@keyframes pulseRing{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}50%{box-shadow:0 0 0 4px rgba(245,158,11,.22)}}
@keyframes drawerIn{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
`;
