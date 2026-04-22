import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import { PaginatedFilterableTable } from "../ui/components/PaginatedFilterableTable";

afterEach(() => {
  cleanup();
});

describe("PaginatedFilterableTable", () => {
  it("shows an empty-state message when there are no columns to render", () => {
    render(
      <I18nProvider language="es" setLanguage={vi.fn()}>
        <PaginatedFilterableTable rows={[]} />
      </I18nProvider>,
    );

    expect(screen.getByText("No hay columnas para mostrar.")).toBeInTheDocument();
  });

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

  it("can collapse and expand filter controls", () => {
    render(
      <I18nProvider language="es" setLanguage={vi.fn()}>
        <PaginatedFilterableTable
          rows={[{ createdAt: "2026-04-20T12:00:00Z", event: "single" }]}
          collapsibleControls
          controlsInitiallyExpanded={false}
        />
      </I18nProvider>,
    );

    expect(screen.queryByLabelText("Ordenar por")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    expect(screen.getByLabelText("Ordenar por")).toBeInTheDocument();
    expect(screen.getByLabelText("Filtrar")).toBeInTheDocument();
  });

  it("starts with filter controls hidden when collapsible controls are enabled", () => {
    render(
      <I18nProvider language="es" setLanguage={vi.fn()}>
        <PaginatedFilterableTable
          rows={[{ createdAt: "2026-04-20T12:00:00Z", event: "single" }]}
          collapsibleControls
        />
      </I18nProvider>,
    );

    expect(screen.queryByLabelText("Ordenar por")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar" })).toBeInTheDocument();
  });

  it("uses page size 5 by default and allows remote tables to change page size and page", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();

    render(
      <I18nProvider language="es" setLanguage={vi.fn()}>
        <PaginatedFilterableTable
          rows={Array.from({ length: 5 }, (_, index) => ({ id: `row-${index + 1}` }))}
          remoteState={{
            totalRows: 12,
            page: 2,
            pageSize: 5,
            onPageChange,
            onPageSizeChange,
          }}
        />
      </I18nProvider>,
    );

    expect((screen.getByLabelText("Tamano pagina") as HTMLSelectElement).value).toBe("5");

    fireEvent.change(screen.getByLabelText("Tamano pagina"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(onPageSizeChange).toHaveBeenCalledWith(10);
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it("opens compact and full dialogs, renders row actions and handles empty cells", () => {
    const onWarn = vi.fn();
    const onPrimary = vi.fn();

    const { container } = render(
      <I18nProvider language="es" setLanguage={vi.fn()}>
        <PaginatedFilterableTable
          rows={[
            {
              name: null,
              previewUrl: "https://example.com/demo",
              payload: { hello: "world" },
              xml: "<root><node>1</node></root>",
            },
          ]}
          iconOnlyColumns={["previewUrl"]}
          rowActions={[
            { label: "Primary", onClick: onPrimary, tone: "primary" },
            { label: "Warn", onClick: onWarn, tone: "warn" },
          ]}
        />
      </I18nProvider>,
    );

    expect(container.textContent).toContain("-");

    fireEvent.click(screen.getByRole("button", { name: "Primary" }));
    fireEvent.click(screen.getByRole("button", { name: "Warn" }));
    expect(onPrimary).toHaveBeenCalledWith(expect.objectContaining({ previewUrl: "https://example.com/demo" }));
    expect(onWarn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Expandir celda" })[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Abrir URL en pestaña nueva")).toBeInTheDocument();
    expect(screen.getByTitle("Vista previa URL")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Expandir celda" })[1]);
    expect(screen.getByText(/"hello": "world"/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Formato"), { target: { value: "plain" } });
    expect(screen.getByText(/hello/)).toBeInTheDocument();
  });

  it("renders success and default action tones and auto-detects XML dialog content", () => {
    const onSuccess = vi.fn();
    const onNeutral = vi.fn();

    const { container } = render(
      <I18nProvider language="es" setLanguage={vi.fn()}>
        <PaginatedFilterableTable
          rows={[
            {
              xml: "<root><node>1</node><node>2</node><node>3</node><node>4</node><node>5</node><node>6</node><node>7</node></root>",
              note: "short",
            },
          ]}
          rowActions={[
            { label: "Success", onClick: onSuccess, tone: "success" },
            { label: "Neutral", onClick: onNeutral },
          ]}
        />
      </I18nProvider>,
    );

    const successButton = screen.getByRole("button", { name: "Success" });
    const neutralButton = screen.getByRole("button", { name: "Neutral" });
    expect(successButton.className).toContain("border-emerald-600");
    expect(neutralButton.className).toContain("ui-action-pill");

    fireEvent.click(successButton);
    fireEvent.click(neutralButton);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onNeutral).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Expandir celda" })[0]);
    expect(screen.getByText(/<root>/)).toBeInTheDocument();
    expect(container.textContent).toContain("xml");
  });

  it("shows the remote page-size label in collapsible controls", () => {
    render(
      <I18nProvider language="es" setLanguage={vi.fn()}>
        <PaginatedFilterableTable
          rows={Array.from({ length: 5 }, (_, index) => ({ id: `row-${index + 1}` }))}
          collapsibleControls
          controlsInitiallyExpanded={false}
          remoteState={{
            totalRows: 20,
            page: 1,
            pageSize: 5,
            onPageSizeChange: vi.fn(),
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Tamano pagina")).toBeInTheDocument();
    expect(screen.queryByLabelText("Filtrar")).not.toBeInTheDocument();
  });

  it("supports dense virtualization and updates visible spacers on scroll", () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({ id: `row-${index + 1}`, value: `value-${index + 1}` }));

    const { container } = render(
      <I18nProvider language="es" setLanguage={vi.fn()}>
        <PaginatedFilterableTable rows={rows} density="dense" defaultPageSize={50} />
      </I18nProvider>,
    );

    const shell = container.querySelector(".ui-table-shell") as HTMLDivElement;
    expect(shell.className).toContain("overflow-y-auto");
    expect(shell.style.maxHeight).toBe("320px");

    fireEvent.scroll(shell, { target: { scrollTop: 240 } });

    const spacerRows = container.querySelectorAll('tr[aria-hidden="true"]');
    expect(spacerRows.length).toBeGreaterThan(0);
  });

  it("shows the no-results state and resets the displayed range when filtering removes every row", () => {
    render(
      <I18nProvider language="es" setLanguage={vi.fn()}>
        <PaginatedFilterableTable rows={[{ event: "alpha" }, { event: "beta" }]} />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText("Filtrar"), { target: { value: "zzz" } });

    expect(screen.getByText("No hay resultados con el filtro actual.")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 0-0 de 0 filas")).toBeInTheDocument();
  });
});