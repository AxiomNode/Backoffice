# Backoffice AxiomNode

Web MVP for managing the AxiomNode ecosystem, focused on:

1. Control
2. Observation
3. Hot modification

## Main responsibility

- Operational console for supervision, action, and safe ecosystem maintenance.

Technologies:

- React
- TypeScript
- Tailwind CSS
- Vite

The interface applies Material 3 color tokens derived from [docs/design/theme/Global theme.json](../docs/design/theme/Global%20theme.json).

## MVP modules

1. Observation:
- Consumption of `GET /v1/backoffice/monitor/stats`
- Health and traffic cards

2. Control:
- Consumption of `GET /v1/backoffice/users/leaderboard`
- Metric and limit filters

3. Hot modification:
- AI generation trigger (`quiz` and `word-pass`) via edge
- Manual event recording in users via edge + bff-backoffice

4. Admin access:
- Role-based authentication gate (`SuperAdmin`, `Admin`, `Viewer`, `Gamer`)
- `dev` mode for local work
- `firebase` mode for real operator authentication with Google

## Role model

- `SuperAdmin`: sole user with full permissions and role management.
- `Admin`: can observe and modify operational data, but cannot manage users.
- `Viewer`: observation only; cannot modify data.
- `Gamer`: default role when creating a user for the first time; no backoffice access.

## Local development

1. Install dependencies:

```bash
npm install
```

2. Create local environment:

```bash
cp .env.example .env
```

3. Run in development mode:

```bash
npm run dev
```

4. Production build:

```bash
npm run build
```

## Docker (dev / single VPS)

The backoffice can be started as a web container at `http://localhost:7080`.

1. Inject centralized secrets (dev):

```bash
cd ../secrets
node scripts/prepare-runtime-secrets.mjs dev
```

2. Start edge + backoffice stack:

```bash
cd ../platform-infra/environments/dev
docker compose -f docker-compose.edge-integration.yml up -d --build
```

The backoffice container reads `VITE_*` variables from `backoffice/.env.secrets` at runtime via `config.js`, to allow configuration changes without re-building the app.

## Environment variables

- `VITE_API_BASE_URL`: edge gateway base (default `http://localhost:7005`)
- `VITE_EDGE_API_TOKEN`: edge token for authenticated calls from backoffice
- `VITE_AUTH_MODE`: `dev` or `firebase`
- `VITE_FIREBASE_API_KEY`: Firebase client config
- `VITE_FIREBASE_AUTH_DOMAIN`: Firebase client config
- `VITE_FIREBASE_PROJECT_ID`: Firebase client config
- `VITE_FIREBASE_STORAGE_BUCKET`: Firebase client config
- `VITE_FIREBASE_MESSAGING_SENDER_ID`: Firebase client config
- `VITE_FIREBASE_APP_ID`: Firebase client config
- `VITE_FIREBASE_MEASUREMENT_ID`: Firebase client config
- `VITE_ADMIN_DEV_UID`: dev UID used in the `x-dev-firebase-uid` header for local development

## Security note

`VITE_*` variables are injected into the client. Do not place real infrastructure secrets in public frontend variables in production.

## Firebase login (Google)

- In Firebase Console, enable Authentication > Sign-in method > Google.
- The backoffice login in `firebase` mode uses a Google popup (`signInWithPopup`).
- Email/password login is not used in this version.
