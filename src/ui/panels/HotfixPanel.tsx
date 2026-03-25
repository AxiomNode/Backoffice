import { useEffect, useState } from "react";

import type { BackofficeSession } from "../../auth";
import { roleCanModify } from "../../application/services/rolePolicies";
import type { HotOperationResult, SessionContext } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
import { useI18n } from "../../i18n/context";

type HotfixPanelProps = {
  session: BackofficeSession;
  context: SessionContext;
};

type GameCatalogSnapshot = {
  categories: Array<{ id: string; name: string }>;
  languages: Array<{ code: string; name: string }>;
};

export function HotfixPanel({ session, context }: HotfixPanelProps) {
  const { t } = useI18n();
  const [categoryId, setCategoryId] = useState("23");
  const [generationLanguage, setGenerationLanguage] = useState("es");
  const [difficultyPercentage, setDifficultyPercentage] = useState(55);
  const [numQuestions, setNumQuestions] = useState(3);
  const [generationCatalogSource, setGenerationCatalogSource] = useState<"quiz" | "wordpass">("quiz");
  const [catalogsByGame, setCatalogsByGame] = useState<Record<"quiz" | "wordpass", GameCatalogSnapshot>>({
    quiz: { categories: [], languages: [] },
    wordpass: { categories: [], languages: [] },
  });
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [result, setResult] = useState<HotOperationResult>({ status: "idle", message: t("hotfix.result.idle") });

  const [eventScore, setEventScore] = useState(80);
  const [eventType, setEventType] = useState("quiz");

  const modifyEnabled = roleCanModify(session.role);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async (service: "microservice-quiz" | "microservice-wordpass") => {
      const payload = await fetchJson<{ catalogs?: GameCatalogSnapshot }>(
        `${EDGE_API_BASE}/v1/backoffice/services/${service}/catalogs`,
        {
          headers: composeAuthHeaders(context),
        },
      );
      return payload.catalogs ?? { categories: [], languages: [] };
    };

    const loadAllCatalogs = async () => {
      try {
        setCatalogError(null);
        const [quizCatalog, wordpassCatalog] = await Promise.all([
          loadCatalog("microservice-quiz"),
          loadCatalog("microservice-wordpass"),
        ]);

        if (cancelled) {
          return;
        }

        setCatalogsByGame({
          quiz: quizCatalog,
          wordpass: wordpassCatalog,
        });
      } catch (error) {
        if (!cancelled) {
          setCatalogError(error instanceof Error ? error.message : t("roles.errorUnknown"));
        }
      }
    };

    void loadAllCatalogs();
    return () => {
      cancelled = true;
    };
  }, [context, t]);

  const selectedCatalog = catalogsByGame[generationCatalogSource];

  useEffect(() => {
    if (selectedCatalog.categories.length > 0 && !selectedCatalog.categories.some((item) => item.id === categoryId)) {
      setCategoryId(selectedCatalog.categories[0].id);
    }
    if (selectedCatalog.languages.length > 0 && !selectedCatalog.languages.some((item) => item.code === generationLanguage)) {
      setGenerationLanguage(selectedCatalog.languages[0].code);
    }
  }, [categoryId, generationLanguage, selectedCatalog.categories, selectedCatalog.languages]);

  const runGeneration = async (gameType: "quiz" | "wordpass") => {
    if (!modifyEnabled) {
      setResult({ status: "error", message: t("hotfix.result.noPermission") });
      return;
    }

    setResult({ status: "loading", message: t("hotfix.result.launching", { gameType }) });
    try {
      const endpoint = gameType === "quiz" ? `${EDGE_API_BASE}/v1/mobile/games/quiz/generate` : `${EDGE_API_BASE}/v1/mobile/games/wordpass/generate`;
      const payload = {
        language: generationLanguage,
        categoryId,
        difficultyPercentage,
        numQuestions,
      };
      const response = await fetchJson<{ gameType: string }>(endpoint, {
        method: "POST",
        headers: composeAuthHeaders(context),
        body: JSON.stringify(payload),
      });
      setResult({ status: "done", message: t("hotfix.result.generationOk", { gameType: response.gameType }) });
    } catch (error) {
      setResult({ status: "error", message: error instanceof Error ? error.message : t("hotfix.result.errorUnknown") });
    }
  };

  const injectUserEvent = async () => {
    if (!modifyEnabled) {
      setResult({ status: "error", message: t("hotfix.result.noPermission") });
      return;
    }

    setResult({ status: "loading", message: t("hotfix.result.registering") });
    try {
      const payload = {
        gameType: eventType,
        categoryId,
        categoryName: t("hotfix.manualEventCategoryName"),
        language: generationLanguage,
        outcome: "won",
        score: eventScore,
        durationSeconds: 120,
        metadata: { source: "backoffice-hotfix" },
      };

      await fetchJson<{ message: string }>(`${EDGE_API_BASE}/v1/backoffice/users/events/manual`, {
        method: "POST",
        headers: composeAuthHeaders(context),
        body: JSON.stringify(payload),
      });

      setResult({ status: "done", message: t("hotfix.result.registered") });
    } catch (error) {
      setResult({ status: "error", message: error instanceof Error ? error.message : t("hotfix.result.errorUnknown") });
    }
  };

  return (
    <section className="m3-card p-5">
      <h2 className="m3-title text-xl">{t("hotfix.title")}</h2>
      <p className="mb-4 text-sm text-[var(--md-sys-color-on-surface-variant)]">{t("hotfix.subtitle")}</p>

      {!modifyEnabled && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {t("hotfix.readOnlyRole", { role: session.role })}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">{t("hotfix.genControlTitle")}</h3>
          <label className="mb-2 block text-sm">
            {t("hotfix.catalogSource")}
            <select value={generationCatalogSource} onChange={(event) => setGenerationCatalogSource(event.target.value as "quiz" | "wordpass")} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2">
              <option value="quiz">quiz</option>
              <option value="wordpass">word-pass</option>
            </select>
          </label>
          <label className="mb-2 block text-sm">
            {t("hotfix.categoryId")}
            {selectedCatalog.categories.length > 0 ? (
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2">
                {selectedCatalog.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : (
              <input value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2" />
            )}
          </label>
          <label className="mb-2 block text-sm">
            {t("hotfix.language")}
            {selectedCatalog.languages.length > 0 ? (
              <select value={generationLanguage} onChange={(event) => setGenerationLanguage(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2">
                {selectedCatalog.languages.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : (
              <input value={generationLanguage} onChange={(event) => setGenerationLanguage(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2" />
            )}
          </label>
          <label className="mb-2 block text-sm">
            {t("hotfix.difficulty")}
            <input type="number" min={0} max={100} value={difficultyPercentage} onChange={(event) => setDifficultyPercentage(Number(event.target.value || 0))} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2" />
          </label>
          <label className="mb-3 block text-sm">
            {t("hotfix.numQuestions")}
            <input type="number" min={1} max={50} value={numQuestions} onChange={(event) => setNumQuestions(Number(event.target.value || 1))} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={!modifyEnabled} onClick={() => runGeneration("quiz")} className="flex-1 rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-2 text-sm font-semibold text-[var(--md-sys-color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50">{t("hotfix.generateQuiz")}</button>
            <button type="button" disabled={!modifyEnabled} onClick={() => runGeneration("wordpass")} className="flex-1 rounded-lg bg-[var(--md-sys-color-tertiary)] px-3 py-2 text-sm font-semibold text-[var(--md-sys-color-on-tertiary)] disabled:cursor-not-allowed disabled:opacity-50">{t("hotfix.generateWordpass")}</button>
          </div>
          {catalogError && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{catalogError}</p>}
        </article>

        <article className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">{t("hotfix.dataAdjustTitle")}</h3>
          <label className="mb-2 block text-sm">
            {t("hotfix.gameType")}
            <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2">
              <option value="quiz">quiz</option>
              <option value="word-pass">word-pass</option>
            </select>
          </label>
          <label className="mb-3 block text-sm">
            {t("hotfix.score")}
            <input type="number" value={eventScore} onChange={(event) => setEventScore(Number(event.target.value || 0))} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2" />
          </label>
          <button type="button" disabled={!modifyEnabled} onClick={injectUserEvent} className="w-full rounded-lg bg-[var(--md-sys-color-secondary)] px-3 py-2 text-sm font-semibold text-[var(--md-sys-color-on-secondary)] disabled:cursor-not-allowed disabled:opacity-50">{t("hotfix.manualEvent")}</button>
        </article>
      </div>

      <p className={`mt-4 rounded-lg p-3 text-sm ${result.status === "error" ? "bg-red-50 text-red-700" : result.status === "done" ? "bg-emerald-50 text-emerald-700" : "bg-[var(--md-sys-color-surface-container)]"}`}>{result.message}</p>
    </section>
  );
}
