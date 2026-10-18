import { expect, it, vi } from "vitest";
import { z } from "zod";
import { catalogHistory } from "./catalog-history";

it("keeps current identity, validates requested archives once and rejects unknown revisions", () => {
  const schema = z.object({ version: z.string(), value: z.number() });
  const current = schema.parse({ version: "current", value: 2 });
  const parse = vi.fn(schema.parse);
  const resolve = catalogHistory(
    [current],
    {
      current: { version: "current", value: 1 },
      old: { version: "old", value: 1 },
      invalid: { version: "invalid", value: "bad" },
    },
    parse,
  );
  expect(parse).not.toHaveBeenCalled();
  expect(resolve("current")).toBe(current);
  expect(resolve("old")).toEqual({ version: "old", value: 1 });
  expect(resolve("old")).toBe(resolve("old"));
  expect(parse).toHaveBeenCalledTimes(1);
  for (const missing of ["missing", "__proto__", "toString"])
    expect(resolve(missing)).toBeNull();
  expect(() => resolve("invalid")).toThrow();
});
