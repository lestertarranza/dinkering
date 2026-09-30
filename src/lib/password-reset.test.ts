import { describe, expect, it } from "vitest";
import {
  normalizeLoginEmail,
  passwordChoiceError,
  passwordUpdateMessage,
  readConfirmLink,
  readResetLink,
  recoverFailureMessage,
  resetPagePath,
  resetRedirectUrl,
} from "./password-reset";

describe("normalizeLoginEmail", () => {
  it("accepts a normal address", () => {
    expect(normalizeLoginEmail("  Ada@Example.com ")).toBe("ada@example.com");
  });

  it("rejects a missing domain", () => {
    expect(normalizeLoginEmail("ada@")).toBeNull();
  });
});

describe("passwordChoiceError", () => {
  it("requires 8 characters and a matching confirmation", () => {
    expect(passwordChoiceError("short", "short")).toMatch(/at least 8/);
    expect(passwordChoiceError("longenough", "different")).toMatch(/do not match/);
    expect(passwordChoiceError("longenough", "longenough")).toBeNull();
  });
});

describe("recoverFailureMessage", () => {
  it("hides unknown addresses and explains a rate limit", () => {
    expect(recoverFailureMessage(400, { msg: "User not found" })).toBeNull();
    expect(recoverFailureMessage(429, { msg: "email rate limit exceeded" })).toMatch(
      /Wait a few minutes/,
    );
    expect(recoverFailureMessage(500, {})).toMatch(/Try again/);
  });
});

describe("passwordUpdateMessage", () => {
  it("rewrites the reused-password error", () => {
    expect(
      passwordUpdateMessage("New password should be different from the old password."),
    ).toMatch(/different password/);
  });
});

describe("reset links", () => {
  it("builds a redirect that keeps a safe next path", () => {
    expect(resetRedirectUrl("https://dinkering.example", "/schedule/team")).toBe(
      "https://dinkering.example/auth/reset?next=%2Fschedule%2Fteam",
    );
    expect(resetRedirectUrl("https://dinkering.example/", "https://evil.test")).toBe(
      "https://dinkering.example/auth/reset",
    );
  });

  it("reads a recovery hash and ignores an expired link", () => {
    expect(
      readResetLink(
        "https://dinkering.example/auth/reset?next=%2Fme#access_token=a&refresh_token=b&type=recovery",
      ),
    ).toEqual({ kind: "session", accessToken: "a", refreshToken: "b" });
    expect(
      readResetLink(
        "https://dinkering.example/auth/reset?error_code=otp_expired&error_description=expired",
      ),
    ).toEqual({ kind: "invalid" });
    expect(
      readResetLink("https://dinkering.example/auth/reset?token_hash=abc&type=recovery"),
    ).toEqual({ kind: "otp", tokenHash: "abc" });
    expect(
      readConfirmLink(
        "https://dinkering.example/auth/confirm#access_token=a&refresh_token=b&type=signup",
      ),
    ).toEqual({ kind: "session", accessToken: "a", refreshToken: "b" });
  });

  it("removes one-time credentials from the address", () => {
    expect(
      resetPagePath(
        "https://dinkering.example/auth/reset?next=%2Fme&code=secret#access_token=a",
      ),
    ).toBe("/auth/reset?next=%2Fme");
  });
});
