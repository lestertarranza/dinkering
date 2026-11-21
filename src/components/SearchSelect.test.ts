import { describe, expect, it } from "vitest";
import { filterSearchOptions, searchMenuFrame } from "./SearchSelect";

describe("filterSearchOptions", () => {
  const options = [
    { value: "1", label: "Ana Cruz" },
    { value: "2", label: "Anna Reyes" },
    { value: "3", label: "Ben Cruz", group: "Players" },
  ];

  it("returns every option when the query is blank", () => {
    expect(filterSearchOptions(options, "  ")).toEqual(options);
  });

  it("matches part of a name without case", () => {
    expect(filterSearchOptions(options, "an").map((option) => option.value)).toEqual([
      "1",
      "2",
    ]);
  });

  it("matches a later word", () => {
    expect(filterSearchOptions(options, "cruz").map((option) => option.value)).toEqual([
      "1",
      "3",
    ]);
  });
});

describe("searchMenuFrame", () => {
  it("opens downward when there is room above the bottom bars", () => {
    expect(
      searchMenuFrame({
        inputTop: 120,
        inputBottom: 160,
        viewTop: 0,
        viewBottom: 800,
        reserveBottom: 128,
      }),
    ).toEqual({ above: false, maxHeight: 240 });
  });

  it("opens upward when the field sits on the bottom bars", () => {
    const frame = searchMenuFrame({
      inputTop: 620,
      inputBottom: 660,
      viewTop: 0,
      viewBottom: 800,
      reserveBottom: 128,
    });
    expect(frame.above).toBe(true);
    expect(frame.maxHeight).toBeGreaterThan(96);
  });
});
