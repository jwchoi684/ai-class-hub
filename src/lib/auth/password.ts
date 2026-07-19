import { randomBytes } from "node:crypto";

/**
 * 운영자 비밀번호 생성.
 *
 * 강사가 화면에서 읽어 비밀번호 관리자에 옮겨 적는 값이라, 헷갈리는 글자
 * (0/O, 1/l/I)를 빼서 옮겨 적다 틀리는 일을 없앱니다. 그만큼 문자 집합이
 * 줄지만 20자면 여전히 100비트가 넘습니다.
 */
export const PASSWORD_ALPHABET =
  "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const PASSWORD_LENGTH = 20;

/**
 * 거부 샘플링으로 균등 분포를 보장합니다.
 *
 * `byte % 56` 을 그냥 쓰면 앞쪽 문자가 뒤쪽보다 더 자주 뽑힙니다(256이 56으로
 * 나누어떨어지지 않으므로). 비밀번호 생성에서 이 편향은 곧 엔트로피 손실이라,
 * 나머지 구간에 걸린 바이트는 버리고 다시 뽑습니다.
 */
export function generatePassword(length: number = PASSWORD_LENGTH): string {
  const alphabetSize = PASSWORD_ALPHABET.length;
  const limit = Math.floor(256 / alphabetSize) * alphabetSize;
  const out: string[] = [];

  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= limit) continue;
      out.push(PASSWORD_ALPHABET[byte % alphabetSize]);
      if (out.length === length) break;
    }
  }

  return out.join("");
}
