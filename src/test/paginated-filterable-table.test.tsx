import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import { PaginatedFilterableTable } from "../ui/components/PaginatedFilterableTable";

describe("PaginatedFilterableTable", () => {
  it("applies descending sort as the initial client-side order when configured", () => {
    const { container } = render(
      <I18nProvider language="es" setLanguage={vi.fn()}>
        <PaginatedFilterableTable
          rows={[
            { createdAt: "2026-04-20T10:00:00Z", event: "oldest" },
            { createdAt: "2026-04-20T12:00:00Z", event: "newest" },
            { createdAt: "2026-04-20T11:00:00Z", event: "middle" },
          ]}
          defaultSortDirection="desc"
        />
      </I18nProvider>,
    );

    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows[0]?.textContent).toContain("2026-04-20T12:00:00Z");
    expect(bodyRows[1]?.textContent).toContain("2026-04-20T11:00:00Z");
    expect(bodyRows[2]?.textContent).toContain("2026-04-20T10:00:00Z");
  });
});