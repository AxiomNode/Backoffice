import type { NavItem, NavKey } from "../../domain/types/backoffice";
import { useI18n } from "../../i18n/context";

/** @module Sidebar - Navigational sidebar listing all available backoffice sections. */

type SidebarProps = {
  current: NavKey;
  onChange: (key: NavKey) => void;
  items: NavItem[];
  className?: string;
};

/** Sidebar navigation component rendering a list of nav items with active state. */
export function Sidebar({ current, onChange, items, className }: SidebarProps) {
  const { t } = useI18n();

  const item = (key: NavKey, title: string, subtitle: string) => {
    const active = current === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        className={`group w-full rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
          active
            ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] shadow-sm ring-1 ring-[var(--md-sys-color-primary)]/30"
            : "ui-surface-soft hover:-translate-y-[1px] hover:bg-[var(--md-sys-color-surface-container)] hover:shadow-sm"
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{title}</p>
          <span className={`h-2 w-2 rounded-full ${active ? "bg-[var(--md-sys-color-primary)]" : "bg-[var(--md-sys-color-outline-variant)] group-hover:bg-[var(--md-sys-color-outline)]"}`} />
        </div>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{subtitle}</p>
      </button>
    );
  };

  return (
    <aside className={`m3-card h-fit p-3 sm:p-4 xl:p-5 ${className ?? ""}`}>
      <div className="mb-4 border-b border-[var(--md-sys-color-outline-variant)] pb-4">
        <div className="flex items-center justify-center">
          <img src="/axiomnode-mark.svg" alt={t("sidebar.brandMarkAlt")} className="h-48 w-64 object-contain" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {items.map((navItem) => item(navItem.key, navItem.title, navItem.subtitle))}
      </div>
    </aside>
  );
}
