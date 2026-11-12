import "@testing-library/jest-dom/vitest";

import { loadDictionary } from "../i18n/labels";

// Most integration tests render the UI in Spanish: keep that dictionary in memory so the provider stays synchronous for them.
await loadDictionary("es");
