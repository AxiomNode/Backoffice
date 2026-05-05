# Backoffice Architecture

Last updated: 2026-05-03.

## Purpose

Describe the internal structure of the backoffice SPA and the boundaries between UI composition, application logic, and runtime integrations.

## Runtime boundaries

`backoffice` is a browser application. It should not call private services directly.

Effective runtime path:

1. browser -> `api-gateway`
2. `api-gateway` -> `bff-backoffice`
3. `bff-backoffice` -> downstream services and persisted routing state

## Source layout

- `src/App.tsx`: application shell entry.
- `src/main.tsx`: browser bootstrap.
- `src/application/`: application-level orchestration and flows.
- `src/domain/`: domain models and business-facing concepts.
- `src/infrastructure/`: API and runtime-facing integration code.
- `src/ui/`: operator-facing views, components, and screen composition.
- `src/data/`: data adapters and request/response shaping.
- `src/test/`: local test helpers.
- `src/runtimeConfig.ts`: runtime configuration surface.
- `src/auth.ts`: authentication bootstrapping.

## Design constraints

- Keep operator actions explicit and reversible.
- Preserve the distinction between defaults, overrides, and effective runtime state.
- Prefer shared page models and reusable view patterns over service-specific one-offs.
- Treat AI diagnostics as operational tooling, not generic dashboard chrome.

## Related documents

- [../operations/README.md](../operations/README.md)
- [../guides/README.md](../guides/README.md)