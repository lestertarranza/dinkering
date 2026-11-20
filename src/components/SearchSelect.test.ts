import { describe, expect, it } from "vitest";
import { filterSearchOptions } from "./SearchSelect";

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
