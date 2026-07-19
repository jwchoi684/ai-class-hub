/**
 * 링크 썸네일 폴백.
 *
 * 이 앱에서 썸네일이 **없는 것이 기본 상태**입니다. 수강생이 올릴 링크를
 * 하나씩 보면 — 처음 배포한 Vite 사이트는 og:image 가 아예 없고, Colab 은
 * 전부 똑같은 제네릭 로고를 주고, Figma·Notion 은 로그인 벽 뒤이며, 인스타는
 * 비로그인 fetch 에 로그인 페이지를 돌려줍니다. 절반 이상이 쓸만한 이미지를
 * 못 얻습니다.
 *
 * 그래서 실패를 '깨짐'이 아니라 '의도된 디자인'으로 만듭니다. 주소를 해시해
 * 결정론적으로 색을 정하므로 같은 사이트는 언제나 같은 색이고, 발표날 갤러리가
 * 회색 빈 박스 벽이 되지 않습니다.
 */

/** FNV-1a. 짧고 분포가 고르며 구현이 한눈에 들어옵니다. */
function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/**
 * 미니멀 톤과 어울리도록 채도·명도를 좁게 잡았습니다.
 * 색상만 해시로 흩뿌리고 나머지는 고정합니다 — 카드가 20장 깔려도
 * 한 화면처럼 보이게 하려는 의도입니다.
 */
export type Gradient = { from: string; to: string; hue: number };

export function gradientFor(seed: string): Gradient {
  const h = hash(seed || "empty");

  const hue = h % 360;
  // 두 번째 색은 30~60도 떨어뜨립니다. 같은 색 계열이라 튀지 않으면서
  // 단색보다 깊이가 생깁니다.
  const shift = 30 + ((h >>> 9) % 30);

  return {
    hue,
    from: `hsl(${hue} 42% 38%)`,
    to: `hsl(${(hue + shift) % 360} 38% 55%)`,
  };
}

/** 카드 배경에 그대로 넣을 CSS 값. */
export function gradientCss(seed: string): string {
  const { from, to } = gradientFor(seed);
  return `linear-gradient(135deg, ${from}, ${to})`;
}
