# Backoffice AxiomNode

MVP web para administracion del ecosistema AxiomNode con foco en:

1. Control
2. Observacion
3. Modificacion en caliente

Tecnologias:

- React
- TypeScript
- Tailwind CSS
- Vite

La interfaz aplica tokens de color Material 3 derivados de [docs/design/theme/Global theme.json](../docs/design/theme/Global%20theme.json).

## Modulos MVP

1. Observacion:
- consumo de `GET /v1/backoffice/monitor/stats`
- tarjetas de salud y trafico

2. Control:
- consumo de `GET /v1/backoffice/users/leaderboard`
- filtros de metrica y limite

3. Modificacion en caliente:
- disparo de generacion IA (`quiz` y `word-pass`) via edge
- registro manual de eventos en users via edge + bff-backoffice

4. Acceso de administradores:
- gate de autenticacion por rol (`SuperAdmin`, `Admin`, `Viewer`, `Gamer`)
- modo `dev` para trabajo local
- modo `firebase` para autenticacion real de operadores con Google

## Modelo de roles

- `SuperAdmin`: unico usuario con permisos totales y gestion de roles.
- `Admin`: puede observar y modificar datos operativos, pero no gestionar usuarios.
- `Viewer`: solo observacion; no puede modificar datos.
- `Gamer`: rol por defecto al crear usuario por primera vez; no tiene acceso al backoffice.

## Desarrollo local

1. Instalar dependencias:

```bash
npm install
```

2. Crear entorno local:

```bash
cp .env.example .env
```

3. Ejecutar en modo desarrollo:

```bash
npm run dev
```

4. Build de produccion:

```bash
npm run build
```

## Variables de entorno

- `VITE_API_BASE_URL`: base del gateway edge (default `http://localhost:7005`)
- `VITE_EDGE_API_TOKEN`: token edge para llamadas autenticadas desde backoffice
- `VITE_AUTH_MODE`: `dev` o `firebase`
- `VITE_FIREBASE_API_KEY`: config cliente Firebase
- `VITE_FIREBASE_AUTH_DOMAIN`: config cliente Firebase
- `VITE_FIREBASE_PROJECT_ID`: config cliente Firebase
- `VITE_FIREBASE_STORAGE_BUCKET`: config cliente Firebase
- `VITE_FIREBASE_MESSAGING_SENDER_ID`: config cliente Firebase
- `VITE_FIREBASE_APP_ID`: config cliente Firebase
- `VITE_FIREBASE_MEASUREMENT_ID`: config cliente Firebase
- `VITE_ADMIN_DEV_UID`: UID dev usado en el header `x-dev-firebase-uid` para operacion local

## Nota de seguridad

`VITE_*` se inyecta en cliente. No colocar secretos de infraestructura reales en produccion dentro de variables publicas del frontend.

## Login Firebase (Google)

- En Firebase Console, habilitar Authentication > Sign-in method > Google.
- El login del backoffice en modo `firebase` usa popup de Google (`signInWithPopup`).
- No se usa login por email/password en esta version.
