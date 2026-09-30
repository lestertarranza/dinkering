import { describe, expect, it } from "vitest";
import { emailSyntaxProblem } from "./email-address";

describe("emailSyntaxProblem", () => {
  it("accepts a normal address", () => {
    expect(emailSyntaxProblem("ada@gmail.com")).toBeNull();
  });

  it("rejects a missing domain and a .con typo", () => {
    expect(emailSyntaxProblem("ada@")).toMatch(/does not look right/);
    expect(emailSyntaxProblem("ada@gmail.con")).toMatch(/does not look right/);
    expect(emailSyntaxProblem("ada@gmal.com")).toMatch(/does not look right/);
  });
});
