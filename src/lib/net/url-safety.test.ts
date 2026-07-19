import { describe, expect, it } from "vitest";
import { displayHost, isSafeExternalUrl } from "./url-safety";

const ok = (url: string) => isSafeExternalUrl(url).ok;

describe("isSafeExternalUrl — 통과해야 하는 것", () => {
  it("수강생이 실제로 올릴 주소들", () => {
    for (const url of [
      "https://cafe-pick.vercel.app",
      "https://mydog-intro.netlify.app/about",
      "https://colab.research.google.com/drive/1abcXYZ",
      "https://www.notion.so/abc123",
      "http://example.com",
      "https://example.com:443/path?q=1#frag",
      "https://블로그.한국/글",
    ]) {
      expect(ok(url), url).toBe(true);
    }
  });

  it("주소를 정규화해서 돌려준다", () => {
    const verdict = isSafeExternalUrl("  https://Example.COM/a  ");
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.host).toBe("example.com");
      expect(verdict.normalized).toBe("https://example.com/a");
    }
  });
});

describe("isSafeExternalUrl — XSS 스킴 차단", () => {
  it("javascript: 를 막는다 — 저장되면 클릭 한 번에 스크립트가 돈다", () => {
    expect(ok("javascript:alert(1)")).toBe(false);
    expect(ok("JavaScript:alert(1)")).toBe(false);
    expect(ok("  javascript:alert(1)")).toBe(false);
  });

  it("data: 와 file: 도 막는다", () => {
    expect(ok("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(ok("file:///etc/passwd")).toBe(false);
  });

  it("vbscript: 등 알 수 없는 스킴도 막는다", () => {
    expect(ok("vbscript:msgbox(1)")).toBe(false);
    expect(ok("chrome://settings")).toBe(false);
  });
});

describe("isSafeExternalUrl — SSRF 대역 차단", () => {
  it("루프백", () => {
    expect(ok("http://localhost/admin")).toBe(false);
    expect(ok("http://127.0.0.1/")).toBe(false);
    expect(ok("http://127.1.2.3/")).toBe(false);
    expect(ok("http://[::1]/")).toBe(false);
  });

  it("클라우드 메타데이터 — 가장 흔한 SSRF 표적", () => {
    expect(ok("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("사설 대역", () => {
    expect(ok("http://10.0.0.1/")).toBe(false);
    expect(ok("http://192.168.0.1/")).toBe(false);
    expect(ok("http://172.16.0.1/")).toBe(false);
    expect(ok("http://172.31.255.255/")).toBe(false);
  });

  it("사설이 아닌 172.x 는 통과한다 — 과차단 확인", () => {
    expect(ok("http://172.15.0.1/")).toBe(true);
    expect(ok("http://172.32.0.1/")).toBe(true);
  });

  it("CGNAT 과 0.0.0.0/8", () => {
    expect(ok("http://100.64.0.1/")).toBe(false);
    expect(ok("http://0.0.0.0/")).toBe(false);
  });

  it("IPv4-mapped IPv6 — Node 가 16진수로 정규화해서 점 표기 검사를 빠져나간다", () => {
    // new URL('http://[::ffff:10.0.0.1]/').hostname === '[::ffff:a00:1]'
    // 실제로 이 검사를 뚫었던 입력이라 회귀 테스트로 남깁니다.
    expect(ok("http://[::ffff:10.0.0.1]/")).toBe(false);
    expect(ok("http://[::ffff:127.0.0.1]/")).toBe(false);
    expect(ok("http://[::ffff:a00:1]/")).toBe(false);
  });

  it("IPv6 리터럴은 형태를 불문하고 막는다", () => {
    for (const host of [
      "[::1]",
      "[fe80::1]",
      "[fd00::1]",
      "[2001:db8::1]",
      "[0:0:0:0:0:0:0:1]",
    ]) {
      expect(ok(`http://${host}/`), host).toBe(false);
    }
  });

  it("내부 도메인 접미사", () => {
    expect(ok("http://db.internal/")).toBe(false);
    expect(ok("http://printer.local/")).toBe(false);
    expect(ok("http://app.localhost/")).toBe(false);
  });
});

describe("isSafeExternalUrl — 그 밖의 거부", () => {
  it("자격증명이 박힌 주소", () => {
    expect(ok("https://user:pass@example.com/")).toBe(false);
  });

  it("80·443 이 아닌 포트 — 내부 서비스 스캔 방지", () => {
    expect(ok("http://example.com:22/")).toBe(false);
    expect(ok("http://example.com:8080/")).toBe(false);
  });

  it("점이 없는 호스트", () => {
    expect(ok("http://intranet/")).toBe(false);
  });

  it("빈 값과 지나치게 긴 주소", () => {
    expect(ok("")).toBe(false);
    expect(ok("   ")).toBe(false);
    expect(ok(`https://example.com/${"a".repeat(3000)}`)).toBe(false);
  });

  it("거부 사유가 사용자에게 보여줄 만한 한국어다", () => {
    const verdict = isSafeExternalUrl("javascript:alert(1)");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toMatch(/[가-힣]/);
      expect(verdict.reason).not.toMatch(/Error|undefined|null/);
    }
  });
});

describe("displayHost", () => {
  it("www 를 뗀다", () => {
    expect(displayHost("https://www.notion.so/abc")).toBe("notion.so");
    expect(displayHost("https://cafe-pick.vercel.app/x")).toBe(
      "cafe-pick.vercel.app",
    );
  });

  it("이상한 값에도 던지지 않는다", () => {
    expect(displayHost("not a url")).toBe("");
    expect(displayHost("")).toBe("");
  });
});
