import { useMemo } from "react";

import type { NavItem, NavKey, NavSectionKey } from "../../domain/types/backoffice";
import { useI18n } from "../../i18n/context";

/** @module Sidebar - Navigational sidebar listing all available backoffice sections. */

type SidebarProps = {
  current: NavKey;
  onChange: (key: NavKey) => void;
  items: NavItem[];
  className?: string;
};

function SidebarIcon({ path }: { path: string }) {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]/80 text-[var(--md-sys-color-primary)]">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
        <path d={path} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Sidebar navigation component rendering a list of nav items with active state. */
export function Sidebar({ current, onChange, items, className }: SidebarProps) {
  const { t } = useI18n();
  const sectionOrder: NavSectionKey[] = ["overview", "platform", "games", "ai", "admin"];
  const sectionIcons: Record<NavSectionKey, string> = {
    overview: "M3 12h18M12 3v18",
    platform: "M4 7h16M6 7v10m12-10v10M4 17h16",
    games: "M8 10h8M7 14h2m6 0h2M6 8l2-2h8l2 2 1 7a2 2 0 0 1-2 2h-2l-2-2h-2l-2 2H8a2 2 0 0 1-2-2l1-7Z",
    ai: "M9 3h6m-9 4h12M8 21h8M7 7v10m10-10v10M9 10h6M9 14h6",
    admin: "M12 3l7 4v5c0 4.5-2.6 7.5-7 9-4.4-1.5-7-4.5-7-9V7l7-4Z",
  };
  const itemIcons: Record<NavKey, string> = {
    "svc-overview": "M4 5h16v5H4zm0 9h7v5H4zm9 0h7v5h-7z",
    "svc-api-gateway": "M4 12h16M7 7l-3 5 3 5m10-10 3 5-3 5",
    "svc-bff-backoffice": "M5 5h14v14H5zM9 9h6v6H9z",
    "svc-bff-mobile": "M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 15h.01",
    "svc-users": "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m14 0v-2a4 4 0 0 0-3-3.87M14 4.13a4 4 0 0 1 0 7.75M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    "svc-quiz": "M9.09 9a3 3 0 1 1 5.82 1c-.4.69-.91 1.07-1.42 1.45-.5.37-.99.74-1.4 1.38M12 17h.01",
    "svc-wordpass": "M4 7h16M7 7l1 10h8l1-10M10 11v3m4-3v3",
    "svc-ai-stats": "M5 19V9m7 10V5m7 14v-7",
    "svc-ai-api": "M12 2 4 6v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6l-8-4Z",
    "ai-diagnostics": "M10 4h4m-7 5h10m-8 5h6m-9 5h12",
    hotfix: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
    roles: "M12 2l3 3 4 .5-1 4 2 3.5-3.5 2-1 4-4-.5-3.5 2-2-3.5-4-1  .5-4-2-3.5 3.5-2 1-4 4 .5Z",
  };
  const sectionLabels: Record<NavSectionKey, { title: string; subtitle: string }> = {
    overview: {
      title: t("sidebar.section.overview.title"),
      subtitle: t("sidebar.section.overview.subtitle"),
    },
    platform: {
      title: t("sidebar.section.platform.title"),
      subtitle: t("sidebar.section.platform.subtitle"),
    },
    games: {
      title: t("sidebar.section.games.title"),
      subtitle: t("sidebar.section.games.subtitle"),
    },
    ai: {
      title: t("sidebar.section.ai.title"),
      subtitle: t("sidebar.section.ai.subtitle"),
    },
    admin: {
      title: t("sidebar.section.admin.title"),
      subtitle: t("sidebar.section.admin.subtitle"),
    },
  };

  const groupedItems = useMemo(
    () =>
      sectionOrder
        .map((section) => ({
          section,
          items: items.filter((item) => item.section === section),
        }))
        .filter((entry) => entry.items.length > 0),
    [items],
  );

  const item = (key: NavKey, title: string, subtitle: string) => {
    const active = current === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        className={`group w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
          active
            ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] shadow-sm ring-1 ring-[var(--md-sys-color-primary)]/30"
            : "ui-surface-soft hover:-translate-y-[1px] hover:border-[var(--md-sys-color-outline)] hover:bg-[var(--md-sys-color-surface-container)] hover:shadow-sm"
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarIcon path={itemIcons[key]} />
            <p className="text-sm font-semibold">{title}</p>
          </div>
          <span className={`h-2 w-2 rounded-full ${active ? "bg-[var(--md-sys-color-primary)]" : "bg-[var(--md-sys-color-outline-variant)] group-hover:bg-[var(--md-sys-color-outline)]"}`} />
        </div>
        <p className="pl-12 text-xs text-[var(--md-sys-color-on-surface-variant)]">{subtitle}</p>
      </button>
    );
  };

  return (
    <aside className={`m3-card h-fit p-3 sm:p-4 xl:p-5 ${className ?? ""}`}>
      <div className="mb-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[linear-gradient(140deg,color-mix(in_srgb,var(--md-sys-color-primary-container)_78%,transparent_22%)_0%,color-mix(in_srgb,var(--md-sys-color-tertiary-container)_72%,transparent_28%)_100%)] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--md-sys-color-surface)]/80 shadow-sm">
            <img src="/axiomnode-mark.svg" alt={t("sidebar.brandMarkAlt")} className="h-10 w-10 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{t("sidebar.title")}</p>
            <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">{t("sidebar.subtitle")}</p>
          </div>
        </div>
      </div>
      <div className="space-y-4">
        {groupedItems.map(({ section, items: sectionItems }) => (
          <section key={section} className="space-y-2">
            <div className="px-1">
              <div className="flex items-center gap-2">
                <SidebarIcon path={sectionIcons[section]} />
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--md-sys-color-primary)]">{sectionLabels[section].title}</p>
              </div>
              <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">{sectionLabels[section].subtitle}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {sectionItems.map((navItem) => item(navItem.key, navItem.title, navItem.subtitle))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
