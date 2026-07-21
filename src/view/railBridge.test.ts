// 레일 브리지 단독 검증 — 같은 결부 id 로 등록한 컨테이너가 구독한 콘텐츠 뷰에 보이고, 해제가
// 부재 상태를 복원한다(이 턴이 트리·이슈 상세를 레일로 내보내고 되돌리는 바로 그 신호다).
// 브리지는 요소를 불투명하게 다루므로 센티널 객체로 충분하다(DOM 비요구 — node 환경).
import { describe, expect, it } from "vitest";
import { railContainer, registerRailContainer, subscribeRail } from "@/view/railBridge";

const el = () => ({}) as unknown as HTMLElement;

describe("rail bridge", () => {
  it("등록한 컨테이너는 자기 결부 id·슬롯으로만 보이고, 해제 후엔 사라진다", () => {
    const a = el();
    const off = registerRailContainer("v1", "tree", a);
    expect(railContainer("v1", "tree")).toBe(a);
    expect(railContainer("v1", "detail")).toBeNull();
    expect(railContainer("v2", "tree")).toBeNull();
    off();
    expect(railContainer("v1", "tree")).toBeNull();
  });

  it("구독자는 등록과 해제를 모두 듣는다", () => {
    let fired = 0;
    const un = subscribeRail("v3", () => fired++);
    const off = registerRailContainer("v3", "detail", el());
    expect(fired).toBe(1);
    off();
    expect(fired).toBe(2);
    un();
    registerRailContainer("v3", "detail", el())();
    expect(fired).toBe(2);
  });

  it("결부 id 가 null 이면 구독도 등록 관찰도 없다 — 인라인 폴백 경로는 침묵한다", () => {
    const un = subscribeRail(null, () => {
      throw new Error("must never fire");
    });
    registerRailContainer("v4", "tree", el())();
    un();
    expect(railContainer(null, "tree")).toBeNull();
  });

  it("낡은 해제가 슬롯을 차지한 새 컨테이너를 몰아내지 못한다", () => {
    const first = el();
    const second = el();
    const offFirst = registerRailContainer("v5", "tree", first);
    const offSecond = registerRailContainer("v5", "tree", second);
    offFirst();
    expect(railContainer("v5", "tree")).toBe(second);
    offSecond();
    expect(railContainer("v5", "tree")).toBeNull();
  });
});
