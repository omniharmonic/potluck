import { describe, it, expect } from "vitest";
import {
  safeRedirect,
  escapeHtml,
  generateSlug,
  getClaimProgress,
} from "./utils";

describe("safeRedirect", () => {
  it("allows same-origin relative paths", () => {
    expect(safeRedirect("/profile")).toBe("/profile");
    expect(safeRedirect("/p/abc?invite=x")).toBe("/p/abc?invite=x");
  });
  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeRedirect("https://evil.com")).toBe("/");
    expect(safeRedirect("//evil.com")).toBe("/");
    expect(safeRedirect("/\\evil.com")).toBe("/");
    expect(safeRedirect("javascript:alert(1)")).toBe("/");
  });
  it("falls back to / for empty input", () => {
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
    expect(safeRedirect("")).toBe("/");
  });
});

describe("escapeHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
    expect(escapeHtml("Tom & Jerry's")).toBe("Tom &amp; Jerry&#39;s");
  });
  it("leaves safe text untouched", () => {
    expect(escapeHtml("Plain title 123")).toBe("Plain title 123");
  });
});

describe("generateSlug", () => {
  it("produces a slugified base with a random suffix", () => {
    const slug = generateSlug("My Summer Potluck!");
    expect(slug).toMatch(/^my-summer-potluck-[a-z0-9]+$/);
  });
  it("handles titles with no alphanumerics", () => {
    const slug = generateSlug("!!!");
    expect(slug).toMatch(/^[a-z0-9]+$/);
  });
  it("is unique across calls", () => {
    expect(generateSlug("x")).not.toBe(generateSlug("x"));
  });
});

describe("getClaimProgress", () => {
  it("sums quantities and computes percentage", () => {
    expect(
      getClaimProgress([
        { quantity: 2, claimed_quantity: 1 },
        { quantity: 2, claimed_quantity: 2 },
      ])
    ).toEqual({ claimed: 3, total: 4, percentage: 75 });
  });
  it("is divide-by-zero safe", () => {
    expect(getClaimProgress([])).toEqual({ claimed: 0, total: 0, percentage: 0 });
  });
});
