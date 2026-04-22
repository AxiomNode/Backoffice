import { describe, expect, it } from "vitest";

import { compareCells, renderCellValue, rowsFromUnknown, stringifyCell } from "../ui/utils/table";

describe("table utils", () => {
  it("stringifies primitives and handles circular objects", () => {
    expect(stringifyCell(null)).toBe("");
    expect(stringifyCell(undefined)).toBe("");
    expect(stringifyCell("abc")).toBe("abc");
    expect(stringifyCell(7)).toBe("7");
    expect(stringifyCell(false)).toBe("false");

    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(stringifyCell(circular)).toContain("[object Object]");
  });

  it("compares numeric and lexical values", () => {
    expect(compareCells("10", "2")).toBeGreaterThan(0);
    expect(compareCells("ana", "bea")).toBeLessThan(0);
    expect(compareCells("", "2")).toBeLessThan(0);
  });

  it("renders short and long cell values", () => {
    const shortValue = "ok";
    const longValue = "x".repeat(130);

    expect(renderCellValue(shortValue)).toBe("ok");
    expect(renderCellValue(longValue)).toHaveLength(120);
    expect(renderCellValue(longValue).endsWith("...")).toBe(true);
  });

  it("normalizes heterogeneous row payloads", () => {
    expect(rowsFromUnknown([{ a: 1 }, "x"]).length).toBe(2);
    expect(rowsFromUnknown({ rows: [{ a: 1 }, 2] }).length).toBe(2);
    expect(rowsFromUnknown({ items: [{ b: 2 }] }).length).toBe(1);
    expect(rowsFromUnknown({ tasks: [{ c: 3 }] }).length).toBe(1);
    expect(rowsFromUnknown({ logs: { logs: [{ d: 4 }] } }).length).toBe(1);
    expect(rowsFromUnknown({ logs: { history: [{ e: 5 }] } }).length).toBe(1);
    expect(rowsFromUnknown({ logs: [{ f: 6 }] }).length).toBe(1);

    const fallbackObject = rowsFromUnknown({ single: true });
    expect(fallbackObject).toEqual([{ single: true }]);

    expect(rowsFromUnknown(undefined)).toEqual([]);
    expect(rowsFromUnknown("plain")).toEqual([{ value: "plain" }]);
  });
});
