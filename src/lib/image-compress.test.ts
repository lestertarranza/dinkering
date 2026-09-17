import { describe, expect, it } from "vitest";
import { scaledSize } from "./image-compress";

describe("scaledSize", () => {
  it("keeps images already within the max edge", () => {
    expect(scaledSize(400, 300, 640)).toEqual({ width: 400, height: 300 });
  });

  it("scales a tall phone photo down to the max edge", () => {
    expect(scaledSize(3024, 4032, 640)).toEqual({ width: 480, height: 640 });
  });

  it("scales a wide photo down to the max edge", () => {
    expect(scaledSize(4000, 2000, 640)).toEqual({ width: 640, height: 320 });
  });
});
