# Backoffice Operations

Last updated: 2026-05-03.

## Purpose

Provide the minimum local run, validation, and integration workflow for the operator UI.

## Local run

From `backoffice/src`:

```bash
npm install
cp .env.example .env
npm run dev
```

## Validation

From `backoffice/src`:

```bash
npm run typecheck
npm run test:run
npm run build
```

End-to-end coverage is available through:

```bash
npm run test:e2e
```

## Edge integration

For integrated local testing:

```bash
cd ../secrets
node scripts/prepare-runtime-secrets.mjs dev

cd ../platform-infra/environments/dev
docker compose -f docker-compose.edge-integration.yml up -d --build
```

## Risks and cautions

- UI health does not guarantee that downstream runtime state is current.
- AI diagnostics can degrade when the external llama target is unreachable.
- Operator controls should be validated against persisted backend behavior, not only client state.

## Related documents

- [../architecture/README.md](../architecture/README.md)
- [../guides/README.md](../guides/README.md)