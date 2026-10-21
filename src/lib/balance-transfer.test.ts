import { describe, expect, it } from "vitest";
import {
  groupTransferLabel,
  parseTransferParty,
  sameTransferWallet,
  transferPartyValue,
} from "./balance-transfer";

describe("parseTransferParty", () => {
  it("reads a group fund and a player", () => {
    expect(parseTransferParty("g:group-1")).toEqual({
      kind: "group",
      id: "group-1",
    });
    expect(parseTransferParty("p:player-1")).toEqual({
      kind: "player",
      id: "player-1",
    });
  });

  it("treats a bare id as a player", () => {
    expect(parseTransferParty("player-1")).toEqual({
      kind: "player",
      id: "player-1",
    });
  });

  it("rejects an empty value", () => {
    expect(parseTransferParty("  ")).toBeNull();
    expect(parseTransferParty("g:")).toBeNull();
  });
});

describe("transferPartyValue", () => {
  it("round-trips both kinds", () => {
    expect(transferPartyValue({ kind: "group", id: "abc" })).toBe("g:abc");
    expect(parseTransferParty(transferPartyValue({ kind: "player", id: "abc" }))).toEqual({
      kind: "player",
      id: "abc",
    });
  });
});

describe("groupTransferLabel", () => {
  it("names the fund type", () => {
    expect(groupTransferLabel("The Tarranzas", "couple")).toBe(
      "The Tarranzas (Couple)",
    );
    expect(groupTransferLabel("Court kitty", "team_fund")).toBe(
      "Court kitty (Team fund)",
    );
  });
});

describe("sameTransferWallet", () => {
  it("matches a shared group fund", () => {
    expect(
      sameTransferWallet(
        { player_id: null, player_group_id: "g1" },
        { player_id: null, player_group_id: "g1" },
      ),
    ).toBe(true);
  });

  it("allows a player and a different group fund", () => {
    expect(
      sameTransferWallet(
        { player_id: "p1", player_group_id: null },
        { player_id: null, player_group_id: "g1" },
      ),
    ).toBe(false);
  });

  it("matches the same personal wallet", () => {
    expect(
      sameTransferWallet(
        { player_id: "p1", player_group_id: null },
        { player_id: "p1", player_group_id: null },
      ),
    ).toBe(true);
  });
});
