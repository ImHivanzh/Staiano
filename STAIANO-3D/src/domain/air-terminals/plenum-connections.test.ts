import { describe, expect, it } from "vitest";
import { terminalPlenumConnections } from "./commercial-bom";

describe("published plenum inlet positions", () => {
  it("uses the original Ecoclima positions for each family and its variants", () => {
    expect(terminalPlenumConnections("EDLS").map((c) => c.position)).toEqual([
      "lateral",
    ]);
    expect(terminalPlenumConnections("EDFL-20").map((c) => c.position)).toEqual(
      ["lateral"],
    );
    expect(terminalPlenumConnections("EDSC-C").map((c) => c.position)).toEqual([
      "lateral",
    ]);
    expect(
      new Set(terminalPlenumConnections("EBL").map((c) => c.position)),
    ).toEqual(new Set(["lateral", "upper"]));
    expect(terminalPlenumConnections("EDLS")[0].sourceUrl).toContain(
      "ecoclima.com",
    );
  });
  it("does not invent a connection for unpublished families", () => {
    expect(terminalPlenumConnections("UNKNOWN")).toEqual([]);
  });
});
