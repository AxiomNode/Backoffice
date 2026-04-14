# backoffice

React-based operations console for the AxiomNode ecosystem.

## Responsibilities

- Provide visibility for health, traffic, and service-level metrics.
- Enable controlled operational actions for admin users.
- Offer a secure UI layer over edge APIs.

## Tech stack

- React
- TypeScript
- Vite
- Tailwind CSS

## Key modules

1. Observability dashboards.
2. Control/administration views.
3. AI generation control actions.
4. Role-gated access (`SuperAdmin`, `Admin`, `Viewer`, `Gamer`).

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Build for production:

```bash
npm run build
```

## Edge integration (dev)

```bash
cd ../secrets
node scripts/prepare-runtime-secrets.mjs dev

cd ../platform-infra/environments/dev
docker compose -f docker-compose.edge-integration.yml up -d --build
```

## CI/CD workflow behavior

- `.github/workflows/ci.yml`
	- Trigger: push (`main`, `develop`), pull request, manual dispatch.
	- Job `validate`: installs dependencies, blocks tracked build artifacts, runs tests, typechecks, builds the app, and audits production dependencies.
	- Job `trigger-platform-infra-build`:
		- Runs on push to `main`.
		- Dispatches `platform-infra/.github/workflows/build-push.yaml` with `service=backoffice`.
		- Requires `PLATFORM_INFRA_DISPATCH_TOKEN` in this repo.

## Deployment automation chain

Push to `main` triggers image rebuild in `platform-infra`. Environment deployment is controlled by the current platform promotion policy and should be verified in `platform-infra` before assuming an automatic target.

## Environment variables

- `VITE_API_BASE_URL`
- `VITE_EDGE_API_TOKEN`
- `VITE_AUTH_MODE` (`dev` or `firebase`)
- `VITE_FIREBASE_*`
- `VITE_ADMIN_DEV_UID`
