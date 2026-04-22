import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { UiDensity } from "../../domain/types/backoffice";
import { useI18n } from "../../i18n/context";
import { compareCells, renderCellValue, stringifyCell } from "../utils/table";

/** @module PaginatedFilterableTable - Generic data table with filtering, sorting, and pagination. */

type PaginatedFilterableTableProps = {
  rows: Array<Record<string, unknown>>;
  defaultPageSize?: number;
  defaultSortDirection?: "asc" | "desc";
  density?: UiDensity;
  collapsibleControls?: boolean;
  controlsInitiallyExpanded?: boolean;
  iconOnlyColumns?: string[];
  remoteState?: {
    totalRows: number;
    page: number;
    pageSize: number;
    onPageChange?: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
  };
  rowActions?: Array<{
    label: string;
    onClick: (row: Record<string, unknown>) => void;
    tone?: "neutral" | "primary" | "success" | "warn";
  }>;
};

/** Memoized data table with client-side filtering, sorting, pagination, and cell detail dialog. */
export const PaginatedFilterableTable = memo(function PaginatedFilterableTable({ rows, defaultPageSize = 5, defaultSortDirection = "asc", density = "comfortable", collapsibleControls = false, controlsInitiallyExpanded = false, iconOnlyColumns = [], remoteState, rowActions = [] }: PaginatedFilterableTableProps) {
  const { t } = useI18n();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const columns = useMemo(() => {
    const keys = new Set<string>();
    rows.slice(0, 50).forEach((row) => {
      Object.keys(row).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [rows]);

  const [filterText, setFilterText] = useState("");
  const [sortBy, setSortBy] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(defaultSortDirection);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(1);
  const [controlsExpanded, setControlsExpanded] = useState(controlsInitiallyExpanded);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogValue, setDialogValue] = useState("");
  const [dialogColumn, setDialogColumn] = useState("");
  const [dialogFormat, setDialogFormat] = useState<"auto" | "json" | "xml" | "plain" | "url">("auto");
  const [dialogCompact, setDialogCompact] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const deferredFilterText = useDeferredValue(filterText);
  const isRemoteMode = !!remoteState;

  const iconOnlyColumnSet = useMemo(() => new Set(iconOnlyColumns.map((column) => column.trim().toLowerCase())), [iconOnlyColumns]);

  useEffect(() => {
    setSortBy((current) => {
      if (current && columns.includes(current)) {
        return current;
      }
      return columns[0] ?? "";
    });
  }, [columns]);

  useEffect(() => {
    setSortDirection(defaultSortDirection);
  }, [defaultSortDirection]);

  useEffect(() => {
    setPageSize(defaultPageSize);
  }, [defaultPageSize]);

  useEffect(() => {
    setControlsExpanded(controlsInitiallyExpanded);
  }, [controlsInitiallyExpanded]);

  useEffect(() => {
    setPage(1);
  }, [deferredFilterText, sortBy, sortDirection, pageSize, rows]);

  useEffect(() => {
    setScrollTop(0);
    if (typeof scrollContainerRef.current?.scrollTo === "function") {
      scrollContainerRef.current.scrollTo({ top: 0 });
    }
  }, [page, deferredFilterText, pageSize, rows, sortBy, sortDirection, remoteState?.page]);

  const filteredRows = useMemo(() => {
    if (isRemoteMode) {
      return rows;
    }

    const term = deferredFilterText.trim().toLowerCase();
    if (!term) {
      return rows;
    }

    return rows.filter((row) => columns.some((column) => stringifyCell(row[column]).toLowerCase().includes(term)));
  }, [columns, deferredFilterText, isRemoteMode, rows]);

  const sortedRows = useMemo(() => {
    if (isRemoteMode) {
      return filteredRows;
    }

    if (!sortBy) {
      return filteredRows;
    }

    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((left, right) => compareCells(left[sortBy], right[sortBy]) * direction);
  }, [filteredRows, sortBy, sortDirection]);

  const totalRows = isRemoteMode ? Math.max(0, remoteState.totalRows) : sortedRows.length;
  const resolvedPageSize = isRemoteMode ? Math.max(1, remoteState.pageSize) : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / resolvedPageSize));
  const currentPage = isRemoteMode ? Math.min(Math.max(1, remoteState.page), totalPages) : Math.min(page, totalPages);
  const start = (currentPage - 1) * resolvedPageSize;
  const pageRows = isRemoteMode ? rows : sortedRows.slice(start, start + resolvedPageSize);

  const compact = density === "dense";
  const controlsPadding = compact ? "p-2" : "p-3";
  const controlInputPadding = compact ? "px-2 py-1.5" : "px-2 py-2";
  const tableTextSize = compact ? "text-xs" : "text-xs sm:text-sm";
  const tableCellPadding = compact ? "px-2 py-1.5" : "px-3 py-2";
  const footerPadding = compact ? "p-2" : "p-3";
  const footerText = compact ? "text-xs" : "text-sm";
  const hasRowActions = rowActions.length > 0;
  const estimatedRowHeight = compact ? 40 : 48;
  const virtualizationThreshold = 24;
  const virtualizationOverscan = 6;
  const virtualViewportHeight = compact ? 320 : 420;
  const shouldVirtualizeRows = pageRows.length > virtualizationThreshold;
  const visibleRowCapacity = Math.max(1, Math.ceil(virtualViewportHeight / estimatedRowHeight));
  const virtualStartIndex = shouldVirtualizeRows ? Math.max(0, Math.floor(scrollTop / estimatedRowHeight) - virtualizationOverscan) : 0;
  const virtualEndIndex = shouldVirtualizeRows ? Math.min(pageRows.length, virtualStartIndex + visibleRowCapacity + virtualizationOverscan * 2) : pageRows.length;
  const visiblePageRows = shouldVirtualizeRows ? pageRows.slice(virtualStartIndex, virtualEndIndex) : pageRows;
  const topSpacerHeight = shouldVirtualizeRows ? virtualStartIndex * estimatedRowHeight : 0;
  const bottomSpacerHeight = shouldVirtualizeRows ? Math.max(0, (pageRows.length - virtualEndIndex) * estimatedRowHeight) : 0;
  const controlLabelClass = compact ? "text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--md-sys-color-on-surface-variant)]" : "text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--md-sys-color-on-surface-variant)]";
  const secondaryPillClass = compact ? "ui-action-pill text-[11px] px-3 py-1.5" : "ui-action-pill text-xs";
  const quietPillClass = compact ? "ui-action-pill ui-action-pill--quiet text-[11px] px-3 py-1.5" : "ui-action-pill ui-action-pill--quiet text-xs";

  const handlePageSizeChange = (nextPageSize: number) => {
    if (isRemoteMode) {
      remoteState.onPageSizeChange?.(nextPageSize);
      return;
    }

    setPageSize(nextPageSize);
  };

  const handlePreviousPage = () => {
    if (currentPage <= 1) {
      return;
    }

    if (isRemoteMode) {
      remoteState.onPageChange?.(currentPage - 1);
      return;
    }

    setPage((value) => Math.max(1, value - 1));
  };

  const handleNextPage = () => {
    if (currentPage >= totalPages) {
      return;
    }

    if (isRemoteMode) {
      remoteState.onPageChange?.(currentPage + 1);
      return;
    }

    setPage((value) => Math.min(totalPages, value + 1));
  };

  const actionToneClass = (tone: "neutral" | "primary" | "success" | "warn" = "neutral") => {
    switch (tone) {
      case "primary":
        return "ui-action-pill ui-action-pill--tonal";
      case "success":
        return "ui-action-pill border-emerald-600 text-emerald-700";
      case "warn":
        return "ui-action-pill border-amber-600 text-amber-700";
      default:
        return "ui-action-pill";
    }
  };

  const isLikelyUrl = (value: string) => /^https?:\/\//i.test(value.trim());

  const isLikelyJson = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
      return false;
    }
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  };

  const isLikelyXml = (value: string) => {
    const trimmed = value.trim();
    return trimmed.startsWith("<") && trimmed.endsWith(">") && /<[^>]+>/.test(trimmed);
  };

  const prettyXml = (xml: string) => {
    const normalized = xml.replace(/>\s+</g, "><").trim();
    const tokens = normalized.replace(/></g, ">\n<").split("\n");
    let indent = 0;
    return tokens
      .map((line) => {
        const isClosing = /^<\//.test(line);
        const isSelfClosing = /\/>$/.test(line);
        const isOpening = /^<[^!?/][^>]*>$/.test(line);

        if (isClosing) {
          indent = Math.max(0, indent - 1);
        }

        const formatted = `${"  ".repeat(indent)}${line}`;

        if (isOpening && !isSelfClosing && !line.includes("</")) {
          indent += 1;
        }

        return formatted;
      })
      .join("\n");
  };

  const resolveDialogContent = () => {
    const trimmed = dialogValue.trim();
    const effectiveFormat =
      dialogFormat === "auto"
        ? isLikelyJson(trimmed)
          ? "json"
          : isLikelyXml(trimmed)
            ? "xml"
            : isLikelyUrl(trimmed)
              ? "url"
              : "plain"
        : dialogFormat;

    if (effectiveFormat === "json") {
      try {
        return { format: "json" as const, content: JSON.stringify(JSON.parse(trimmed), null, 2) };
      } catch {
        return { format: "plain" as const, content: dialogValue };
      }
    }

    if (effectiveFormat === "xml") {
      return { format: "xml" as const, content: prettyXml(dialogValue) };
    }

    if (effectiveFormat === "url") {
      return { format: "url" as const, content: dialogValue.trim() };
    }

    return { format: "plain" as const, content: dialogValue };
  };

  const openDialog = (column: string, rawValue: unknown, compact = false) => {
    setDialogColumn(column);
    setDialogValue(stringifyCell(rawValue));
    setDialogFormat("auto");
    setDialogCompact(compact);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setDialogValue("");
    setDialogColumn("");
    setDialogFormat("auto");
    setDialogCompact(false);
  };

  const dialogResolved = resolveDialogContent();

  const shouldUseDialogCell = (value: unknown) => {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === "object") {
      return true;
    }
    const normalized = stringifyCell(value);
    if (normalized.length > 110) {
      return true;
    }
    if (normalized.includes("\n") || normalized.includes("\t")) {
      return true;
    }
    return false;
  };

  const shouldUseIconOnlyButton = (column: string, value: unknown) => {
    if (value === null || value === undefined) {
      return false;
    }
    const normalized = column.trim().toLowerCase();
    return iconOnlyColumnSet.has(normalized);
  };

  if (!columns.length) {
    return <p className="rounded-lg border border-dashed border-[var(--md-sys-color-outline)] p-4 text-sm">{t("table.noColumns")}</p>;
  }

  return (
    <div className="space-y-3">
      {(!isRemoteMode || remoteState?.onPageSizeChange) && (
      <div className={`ui-subtle-card rounded-2xl ${controlsPadding}`}>
        {collapsibleControls && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className={controlLabelClass}>{isRemoteMode ? t("table.pageSize") : t("table.filter")}</p>
            <button
              type="button"
              onClick={() => setControlsExpanded((current) => !current)}
              className={quietPillClass}
              aria-expanded={controlsExpanded}
            >
              {controlsExpanded ? t("service.section.hide") : t("service.section.show")}
            </button>
          </div>
        )}
        {(controlsExpanded || !collapsibleControls) && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {!isRemoteMode && (
        <>
        <label className={controlLabelClass}>
          {t("table.filter")}
          <input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder={t("table.filterPlaceholder")}
            className={`control-input mt-1 w-full ${controlInputPadding}`}
          />
        </label>

        <label className={controlLabelClass}>
          {t("table.sortBy")}
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className={`control-input mt-1 w-full ${controlInputPadding}`}
          >
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>

        <label className={controlLabelClass}>
          {t("table.direction")}
          <select
            value={sortDirection}
            onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")}
            className={`control-input mt-1 w-full ${controlInputPadding}`}
          >
            <option value="asc">{t("table.directionAsc")}</option>
            <option value="desc">{t("table.directionDesc")}</option>
          </select>
        </label>
        </>
        )}

        <label className={controlLabelClass}>
          {t("table.pageSize")}
          <select
            value={resolvedPageSize}
            onChange={(event) => handlePageSizeChange(Number(event.target.value))}
            className={`control-input mt-1 w-full ${controlInputPadding}`}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
        </div>
        )}
      </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={shouldVirtualizeRows ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
        className={`ui-table-shell overflow-x-auto rounded-[1.2rem] ${shouldVirtualizeRows ? "overflow-y-auto" : ""}`}
        style={shouldVirtualizeRows ? { maxHeight: `${virtualViewportHeight}px` } : undefined}
      >
        <table className={`min-w-full ${tableTextSize}`}>
          <thead className={`text-left ${shouldVirtualizeRows ? "sticky top-0 z-10" : ""}`}>
            <tr>
              {columns.map((column) => (
                <th key={column} className={`${tableCellPadding} font-semibold`}>
                  {column}
                </th>
              ))}
              {hasRowActions && <th className={`${tableCellPadding} font-semibold`}>{t("table.actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {shouldVirtualizeRows && topSpacerHeight > 0 && (
              <tr aria-hidden="true">
                <td colSpan={columns.length + (hasRowActions ? 1 : 0)} style={{ height: `${topSpacerHeight}px`, padding: 0, border: 0 }} />
              </tr>
            )}
            {visiblePageRows.map((row, rowIndex) => {
              const actualIndex = shouldVirtualizeRows ? virtualStartIndex + rowIndex : rowIndex;
              return (
              <tr key={`${start + actualIndex}-${stringifyCell(row[columns[0]])}`} className="border-t border-[color:color-mix(in_srgb,var(--md-sys-color-outline-variant)_82%,transparent_18%)]">
                {columns.map((column) => (
                  <td key={column} className={`${tableCellPadding} align-top`}>
                    {shouldUseIconOnlyButton(column, row[column]) ? (
                      <button
                        type="button"
                        onClick={() => openDialog(column, row[column], true)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] transition hover:bg-[var(--md-sys-color-surface-container)]"
                        aria-label={t("table.expandCell")}
                        title={t("table.expandCell")}
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <circle cx="11" cy="11" r="7" />
                          <line x1="16.65" y1="16.65" x2="21" y2="21" />
                        </svg>
                      </button>
                    ) : shouldUseDialogCell(row[column]) ? (
                      <button
                        type="button"
                        onClick={() => openDialog(column, row[column])}
                        className={secondaryPillClass}
                        aria-label={t("table.expandCell")}
                      >
                        {t("table.viewContent")}
                      </button>
                    ) : (
                      <span className="break-words">{renderCellValue(row[column]) || "-"}</span>
                    )}
                  </td>
                ))}
                {hasRowActions && (
                  <td className={`${tableCellPadding} align-top`}>
                    <div className="flex flex-wrap gap-2">
                      {rowActions.map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => action.onClick(row)}
                          className={`${compact ? "px-3 py-1.5 text-[11px]" : "text-xs"} ${actionToneClass(action.tone)}`}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
              );
            })}
            {shouldVirtualizeRows && bottomSpacerHeight > 0 && (
              <tr aria-hidden="true">
                <td colSpan={columns.length + (hasRowActions ? 1 : 0)} style={{ height: `${bottomSpacerHeight}px`, padding: 0, border: 0 }} />
              </tr>
            )}
            {!pageRows.length && (
              <tr>
                <td colSpan={columns.length + (hasRowActions ? 1 : 0)} className={`px-3 py-6 text-center ${footerText} text-[var(--md-sys-color-on-surface-variant)]`}>
                  {t("table.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={`ui-subtle-card flex flex-wrap items-center justify-between gap-3 rounded-[1.15rem] ${footerPadding} ${footerText}`}>
        <p>
          {t("table.showing", {
            from: pageRows.length ? start + 1 : 0,
            to: Math.min(start + pageRows.length, totalRows),
            total: totalRows,
          })}
        </p>
        <div className="flex items-center gap-2">
          <span>
            {t("table.pageOf", { page: currentPage, total: totalPages })}
          </span>
          <button
            type="button"
            onClick={handlePreviousPage}
            disabled={currentPage <= 1}
            className={quietPillClass}
          >
            {t("table.previous")}
          </button>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className={quietPillClass}
          >
            {t("table.next")}
          </button>
        </div>
      </div>

      {dialogOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true">
          <div className={`ui-popover-panel max-h-[85vh] w-full overflow-hidden rounded-[1.75rem] p-0 ${dialogCompact ? "max-w-md" : "max-w-3xl"}`}>
            <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
              <div>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{t("table.column")}</p>
                <h4 className="m3-title text-base">{dialogColumn}</h4>
              </div>
              <button type="button" onClick={closeDialog} className="ui-action-pill ui-action-pill--quiet text-sm">{t("table.close")}</button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2">
              <label className="text-xs">
                {t("table.format")}
                <select value={dialogFormat} onChange={(event) => setDialogFormat(event.target.value as "auto" | "json" | "xml" | "plain" | "url")} className="control-input ml-2 py-1">
                  <option value="auto">{t("table.format.auto")}</option>
                  <option value="json">JSON</option>
                  <option value="xml">XML</option>
                  <option value="plain">{t("table.format.plain")}</option>
                  <option value="url">URL</option>
                </select>
              </label>
            </div>

            <div className="max-h-[60vh] overflow-auto p-4">
              {dialogResolved.format === "url" ? (
                <div className="space-y-3">
                  <a href={dialogResolved.content} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[var(--md-sys-color-primary)] underline">
                    {t("table.openUrl")}
                  </a>
                  <iframe src={dialogResolved.content} title={t("table.urlPreviewTitle")} className="h-[45vh] w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]" />
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-3 text-xs sm:text-sm">{dialogResolved.content || "-"}</pre>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
});
