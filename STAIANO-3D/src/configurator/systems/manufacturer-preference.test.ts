import { describe, expect, it } from "vitest";
import { lastAvailableManufacturer } from "./manufacturer-preference";

describe("project manufacturer preference", () => {
  it("uses the latest available project brand, skipping manual or retired brands", () => {
    expect(
      lastAvailableManufacturer(
        ["Gree", "Daikin", "Manuale"],
        ["Gree", "Daikin"],
      ),
    ).toBe("Daikin");
  });
  it("starts with the first catalog brand when the project has no matching choice", () => {
    expect(lastAvailableManufacturer([], ["Gree", "Daikin"])).toBe("Gree");
    expect(lastAvailableManufacturer(["Manuale"], ["Gree", "Daikin"])).toBe(
      "Gree",
    );
  });
});
