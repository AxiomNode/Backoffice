import { useCallback, useEffect, useState } from "react";

import type { BackofficeRole, RoleItem, SessionContext, UiDensity } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
import { useI18n } from "../../i18n/context";

type RoleManagementPanelProps = {
  context: SessionContext;
  density: UiDensity;
};

export function RoleManagementPanel({ context, density }: RoleManagementPanelProps) {
  const { t } = useI18n();
  const compact = density === "dense";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<RoleItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJson<{ total: number; users: RoleItem[] }>(`${EDGE_API_BASE}/v1/backoffice/admin/users/roles`, {
        headers: composeAuthHeaders(context),
      });
      setItems(payload.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("roles.errorUnknown"));
    } finally {
      setLoading(false);
    }
  }, [context, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRoleChange = async (firebaseUid: string, nextRole: BackofficeRole) => {
    setError(null);
    try {
      await fetchJson<{ message: string }>(`${EDGE_API_BASE}/v1/backoffice/admin/users/roles/${encodeURIComponent(firebaseUid)}`, {
        method: "PATCH",
        headers: composeAuthHeaders(context),
        body: JSON.stringify({ role: nextRole }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("roles.errorUnknown"));
    }
  };

  return (
    <section className={`m3-card ${compact ? "p-4" : "p-5"}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className={`m3-title ${compact ? "text-lg" : "text-xl"}`}>{t("roles.title")}</h2>
          <p className={`${compact ? "text-xs" : "text-sm"} text-[var(--md-sys-color-on-surface-variant)]`}>{t("roles.subtitle")}</p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm">{t("roles.refresh")}</button>
      </div>

      {loading && <p className="text-sm">{t("roles.loading")}</p>}
      {error && <p className="ui-feedback ui-feedback--error mb-3">{error}</p>}

      <div className="ui-surface-raised overflow-x-auto rounded-xl">
        <table className={`min-w-full ${compact ? "text-xs" : "text-sm"}`}>
          <thead className="bg-[var(--md-sys-color-surface-container)] text-left">
            <tr>
              <th className="px-3 py-2">{t("roles.col.name")}</th>
              <th className="px-3 py-2">{t("roles.col.email")}</th>
              <th className="px-3 py-2">{t("roles.col.uid")}</th>
              <th className="px-3 py-2">{t("roles.col.role")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.firebaseUid} className="border-t border-[var(--md-sys-color-outline-variant)]">
                <td className="px-3 py-2">{item.displayName ?? "-"}</td>
                <td className="px-3 py-2">{item.email ?? "-"}</td>
                <td className="px-3 py-2 font-mono text-xs">{item.firebaseUid}</td>
                <td className="px-3 py-2">
                  <select
                    value={item.role}
                    onChange={(event) => void onRoleChange(item.firebaseUid, event.target.value as BackofficeRole)}
                    className="rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-1"
                    disabled={item.role === "SuperAdmin"}
                  >
                    <option value="SuperAdmin">SuperAdmin</option>
                    <option value="Admin">Admin</option>
                    <option value="Viewer">Viewer</option>
                    <option value="Gamer">Gamer</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
