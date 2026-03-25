export function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function compareCells(a: unknown, b: unknown): number {
  const aNumber = Number(a);
  const bNumber = Number(b);
  const aIsNumber = Number.isFinite(aNumber) && stringifyCell(a).trim() !== "";
  const bIsNumber = Number.isFinite(bNumber) && stringifyCell(b).trim() !== "";

  if (aIsNumber && bIsNumber) {
    return aNumber - bNumber;
  }

  return stringifyCell(a).localeCompare(stringifyCell(b), "es", { sensitivity: "base" });
}

export function renderCellValue(value: unknown): string {
  const serialized = stringifyCell(value);
  if (serialized.length <= 120) {
    return serialized;
  }
  return `${serialized.slice(0, 117)}...`;
}

export function rowsFromUnknown(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { value: item }));
  }

  if (payload && typeof payload === "object") {
    const asRecord = payload as Record<string, unknown>;

    if (Array.isArray(asRecord.rows)) {
      return asRecord.rows.map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { value: item }));
    }

    if (Array.isArray(asRecord.items)) {
      return asRecord.items.map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { value: item }));
    }

    if (Array.isArray(asRecord.tasks)) {
      return asRecord.tasks.map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { value: item }));
    }

    if (asRecord.logs && typeof asRecord.logs === "object" && !Array.isArray(asRecord.logs)) {
      const nested = asRecord.logs as Record<string, unknown>;
      if (Array.isArray(nested.logs)) {
        return nested.logs.map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { value: item }));
      }
      if (Array.isArray(nested.history)) {
        return nested.history.map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { value: item }));
      }
    }

    if (Array.isArray(asRecord.logs)) {
      return asRecord.logs.map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { value: item }));
    }

    return [asRecord];
  }

  return payload === undefined ? [] : [{ value: payload }];
}
