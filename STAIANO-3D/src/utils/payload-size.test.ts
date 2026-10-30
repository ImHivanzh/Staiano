import { describe, expect, it } from "vitest";
import { assertPayloadSize } from "./payload-size";

describe("assertPayloadSize", () => {
  it("lascia passare un corpo entro il limite", () => {
    expect(assertPayloadSize("abc", 10, "Il progetto")).toBe("abc");
  });

  it("conta i byte, non i caratteri, e dice dimensione e limite", () => {
    const text = "è".repeat(1024 * 1024);
    expect(() => assertPayloadSize(text, 1024 * 1024, "Il progetto")).toThrow(
      /Il progetto è troppo grande: 2,0 MB, il limite è 1 MB/,
    );
  });
});
