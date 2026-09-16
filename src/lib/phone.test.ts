import { describe, expect, it } from "vitest";
import { formatPhMobile, normalizePhMobile } from "./phone";

describe("normalizePhMobile", () => {
  it("accepts 09, 9, +63, and 63 forms", () => {
    expect(normalizePhMobile("09171234567")).toBe("+639171234567");
    expect(normalizePhMobile("9171234567")).toBe("+639171234567");
    expect(normalizePhMobile("+63 917 123 4567")).toBe("+639171234567");
    expect(normalizePhMobile("639171234567")).toBe("+639171234567");
  });

  it("rejects landlines and short numbers", () => {
    expect(normalizePhMobile("0281234567")).toBeNull();
    expect(normalizePhMobile("0917")).toBeNull();
    expect(normalizePhMobile("")).toBeNull();
  });
});

describe("formatPhMobile", () => {
  it("formats stored E.164 as 09xx xxx xxxx", () => {
    expect(formatPhMobile("+639171234567")).toBe("0917 123 4567");
  });
});
