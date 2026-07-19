import { describe, expect, it } from "vitest";
import {
  detectFileType,
  detectImageType,
  sanitizeFileName,
} from "./file-type";

const bytes = (...values: number[]) => new Uint8Array(values);
const fromString = (text: string) =>
  new Uint8Array([...text].map((c) => c.charCodeAt(0)));

describe("detectFileType", () => {
  it("PDF", () => {
    expect(detectFileType(fromString("%PDF-1.7"))?.mime).toBe("application/pdf");
  });

  it("PNG", () => {
    expect(
      detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime,
    ).toBe("image/png");
  });

  it("JPEG", () => {
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
  });

  it("GIF", () => {
    expect(detectFileType(fromString("GIF89a"))?.mime).toBe("image/gif");
  });

  it("WebP — RIFF 뒤 4바이트를 건너뛰고 확인한다", () => {
    const webp = new Uint8Array(16);
    webp.set(fromString("RIFF"), 0);
    webp.set([0x24, 0x00, 0x00, 0x00], 4); // 크기 (내용 무관)
    webp.set(fromString("WEBP"), 8);
    expect(detectFileType(webp)?.mime).toBe("image/webp");
  });

  it("RIFF 지만 WEBP 가 아니면 거부 — WAV 등", () => {
    const wav = new Uint8Array(16);
    wav.set(fromString("RIFF"), 0);
    wav.set(fromString("WAVE"), 8);
    expect(detectFileType(wav)).toBeNull();
  });

  it("PPTX·DOCX (ZIP 컨테이너)", () => {
    expect(detectFileType(bytes(0x50, 0x4b, 0x03, 0x04))?.mime).toBe(
      "application/zip",
    );
  });

  /*
   * 아래가 이 모듈의 존재 이유입니다. 전부 '.pdf' 로 이름 붙여 올릴 수 있지만
   * 바이트가 다르므로 거부돼야 합니다.
   */
  it("HTML 은 거부한다 — 스크립트를 실행할 수 있다", () => {
    expect(detectFileType(fromString("<!DOCTYPE html><html>"))).toBeNull();
    expect(detectFileType(fromString("<html><script>"))).toBeNull();
  });

  it("SVG 는 거부한다 — 이미지처럼 보이지만 스크립트를 실행할 수 있다", () => {
    expect(detectFileType(fromString('<svg xmlns="http://'))).toBeNull();
    expect(detectFileType(fromString("<?xml version=\"1.0\"?><svg"))).toBeNull();
  });

  it("실행 파일은 거부한다", () => {
    expect(detectFileType(bytes(0x4d, 0x5a))).toBeNull(); // MZ (윈도우 exe)
    expect(detectFileType(bytes(0x7f, 0x45, 0x4c, 0x46))).toBeNull(); // ELF
    expect(detectFileType(fromString("#!/bin/sh\n"))).toBeNull();
  });

  it("빈 파일과 너무 짧은 파일은 거부한다", () => {
    expect(detectFileType(new Uint8Array(0))).toBeNull();
    expect(detectFileType(bytes(0x25))).toBeNull();
    expect(detectFileType(bytes(0xff, 0xd8))).toBeNull(); // JPEG 3바이트 중 2개만
  });

  it("앞에 쓰레기가 붙은 PDF 는 거부한다 — 시그니처는 맨 앞이어야 한다", () => {
    expect(detectFileType(fromString("XX%PDF-1.7"))).toBeNull();
  });
});

describe("detectImageType", () => {
  it("이미지만 통과시킨다", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff))?.mime).toBe("image/jpeg");
  });

  it("PDF 는 이미지 경로에서 거부된다", () => {
    expect(detectImageType(fromString("%PDF-1.7"))).toBeNull();
  });

  it("ZIP 도 거부된다", () => {
    expect(detectImageType(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull();
  });
});

describe("sanitizeFileName", () => {
  it("한글 이름은 그대로 둔다", () => {
    expect(sanitizeFileName("3주차 강의자료.pdf")).toBe("3주차 강의자료.pdf");
  });

  it("경로 구분자를 없앤다 — 이게 핵심이다", () => {
    // 구분자를 먼저 _ 로 바꾸고, 그다음 맨 앞의 점을 뗍니다.
    // 중간에 남는 '..' 는 구분자가 없으므로 경로를 벗어날 수 없습니다.
    expect(sanitizeFileName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(sanitizeFileName("a\\b\\c.pdf")).toBe("a_b_c.pdf");

    // 어떤 입력이든 결과에 구분자가 남지 않는 것이 실제 보장입니다.
    for (const attack of [
      "../../../etc/shadow",
      "..\\..\\windows\\system32",
      "/absolute/path.pdf",
      "dir/sub/file.pdf",
    ]) {
      const result = sanitizeFileName(attack);
      expect(result, `${attack} -> ${result}`).not.toMatch(/[/\\]/);
    }
  });

  it("제어문자를 없앤다 — 다운로드 헤더 주입 방지", () => {
    // 개행이 사라지고, 겸사겸사 슬래시도 _ 가 됩니다.
    expect(sanitizeFileName("\uBCF4\uACE0\uC11C\r\nContent-Type: text/html.pdf")).toBe(
      "\uBCF4\uACE0\uC11CContent-Type: text_html.pdf",
    );
    expect(sanitizeFileName("a\u0001b.pdf")).toBe("ab.pdf");

    for (const attack of ["a\rb", "a\nb", "a\u0000b", "a\u007fb"]) {
       
      expect(sanitizeFileName(attack)).not.toMatch(/[\u0000-\u001f\u007f]/);
    }
  });

  it("앞쪽 점을 없앤다", () => {
    expect(sanitizeFileName(".htaccess")).toBe("htaccess");
    expect(sanitizeFileName("..")).toBe("파일");
  });

  it("빈 이름이 되면 기본값을 준다", () => {
    expect(sanitizeFileName("")).toBe("파일");
    expect(sanitizeFileName("   ")).toBe("파일");
    expect(sanitizeFileName("///")).toBe("___");
  });

  it("지나치게 긴 이름을 자른다", () => {
    expect(sanitizeFileName("가".repeat(300))).toHaveLength(120);
  });
});
