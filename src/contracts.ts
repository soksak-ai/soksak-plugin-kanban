// 이 플러그인이 구현한다고 선언한 계약(plugin.json implements)이 정한 이름들.
//
// 계약이 소유한 이름은 계약이 정하고 구현체는 따른다 — 구현체가 자기 이름을 넣어 지으면 소비자가
// 어느 구현체가 도는지 알아야만 말이 통하게 되고, 그게 이름-핀이다.

/** 보드 변경 신호(soksak-spec-plugin-issue-board). 서비스는 버스 축에서 `bus:` 접두로 구독한다. */
export const BOARD_CHANGED = "issue-board:changed";
