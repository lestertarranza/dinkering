import { describe, expect, it } from "vitest";
import {
  isMissingRelation,
  playerFullName,
  postLoginPath,
  safeNextPath,
  sanitizeSearch,
} from "./account-fields";

describe("playerFullName", () => {
  it("joins and collapses spaces", () => {
    expect(playerFullName("  Aillyn ", " Cruz ")).toBe("Aillyn Cruz");
  });
});

describe("sanitizeSearch", () => {
  it("strips filter metacharacters", () => {
    expect(sanitizeSearch(" %Les_ter* ")).toBe("Les ter");
  });
});

describe("safeNextPath", () => {
  it("allows in-app paths only", () => {
    expect(safeNextPath("/admin/players")).toBe("/admin/players");
    expect(safeNextPath("//evil.test")).toBeNull();
    expect(safeNextPath("https://evil.test")).toBeNull();
    expect(safeNextPath("/\\evil")).toBeNull();
  });
});

describe("isMissingRelation", () => {
  it("detects PostgREST missing-table errors", () => {
    expect(isMissingRelation({ code: "42703", message: "column does not exist" })).toBe(
      true,
    );
    expect(isMissingRelation({ code: "PGRST204", message: "column not found" })).toBe(
      true,
    );
    expect(isMissingRelation({ code: "PGRST205", message: "schema cache" })).toBe(
      true,
    );
    expect(isMissingRelation({ code: "42501", message: "permission denied" })).toBe(
      false,
    );
  });
});

describe("postLoginPath", () => {
  it("sends admins to admin, players to their page, pending to waiting", () => {
    expect(
      postLoginPath({
        role: "admin",
        playerToken: null,
        pending: false,
        next: "/admin/approvals",
      }),
    ).toBe("/admin/approvals");
    expect(
      postLoginPath({
        role: "player",
        playerToken: "abc",
        pending: false,
        next: "/admin",
      }),
    ).toBe("/p/abc");
    expect(
      postLoginPath({
        role: "player",
        playerToken: null,
        pending: true,
        next: "/admin",
      }),
    ).toBe("/pending");
  });
});
