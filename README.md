# Backend Core Development Kit

> Internal use — **Geoplan Philippines**

NestJS template w/ PostgreSQL (Prisma) + Passport.js JWT auth. Cloneable starting point for dashboard-type projects.

Template: `nestjs-postgres-passport`

## What's Included

- NestJS 11 + TypeScript
- **PostgreSQL** via Prisma ORM (`@prisma/adapter-pg`)
- **JWT auth** via Passport.js (`passport-jwt`, `passport-local`)
- `bcrypt` password hashing
- Basic security: `helmet`, CORS allowlist, rate limiting via `@nestjs/throttler` (global 100 req / 60s, `/auth/login` tightened to 5 req / 60s, health endpoints skipped)
- Zod-validated env config (`src/core/config/env.config.ts`)
- Global `ValidationPipe` registered via `APP_PIPE` (whitelist + forbidNonWhitelisted + transform) — also active in test modules
- Global response interceptor — wraps payloads as `{ statusCode, message, data }`
- Global HTTP exception filter — handles `HttpException` + Prisma `P2002` / `P2025` / `P2003`
- Health check via `@nestjs/terminus`:
    - `GET /api/v1/health` — DB ping
- API prefix: `api/v1`
- bun as package manager

## What's NOT Included (by design)

- No social/OAuth login
- No magic link / passwordless
- No refresh tokens — access token is 30d (acceptable for single-admin / very low-user scenarios)
- No Swagger/OpenAPI
- No role/permission system
- No payment integration
- No business modules

## When To Use This Template

Use when:
- Small-scale internal dashboard (1–10 concurrent users)
- Simple email/password auth is sufficient
- No social login or advanced session management needed
- Long-lived single-admin session is acceptable

Use the Postgres + Better Auth template instead when OAuth, magic links, refresh tokens, or richer session management are needed.

## Quick Start

```bash
git clone -b nestjs-postgres-passport https://github.com/Geoplan-Philippines/backend-boilerplate <project-name>
cd <project-name>
bun install
cp .env.example .env
# fill in DATABASE_URL and JWT_SECRET (min 32 chars)
bunx prisma migrate dev
bunx prisma db seed     # creates the first SUPER_ADMIN (defaults in prisma/seed.ts)
bun run start:dev
```

Then:
1. Rename the project in `package.json`
2. Define your schema in `prisma/schema.prisma` and re-run `bunx prisma migrate dev`
3. Build features under `src/modules`

Server: `http://localhost:8000/api/v1`

Verify setup — hit the health check:

```bash
curl http://localhost:8000/api/v1/health
```

Healthy: `{ "statusCode": 200, "message": "Success", "data": { "status": "ok", ... } }`

## Environment

See `.env.example`:
- `NODE_ENV`, `PORT`
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — secret for signing JWT tokens (min 32 chars)
- `CORS_ALLOWED_ORIGINS` (comma-separated)

## Seeding

The app has no `/auth/register` endpoint by design — the first user is created via seed, and every subsequent user is created by an authenticated admin through `POST /api/v1/users`.

```bash
bunx prisma db seed
```

Runs `prisma/seed.ts` (configured in `prisma.config.ts`). The default credentials are hardcoded in `prisma/seed.ts`:

| Field | Default |
|---|---|
| Email | `admin@geoplan.ph` |
| Password | `ChangeMeNow123!` |
| Role | `SUPER_ADMIN` |

**Change the password immediately after first login.** Idempotent: if a user with that email already exists, the seed exits without changes — it will **not** overwrite an existing password.

## Auth Endpoints

| Method | Path | Guard | Description |
|---|---|---|---|
| POST | `/api/v1/auth/login` | `passport-local` | Returns access token |
| GET  | `/api/v1/auth/me` | `passport-jwt` | Returns fresh user from DB |
| POST | `/api/v1/users` | `passport-jwt` | Admin-create user |
| GET  | `/api/v1/users` | `passport-jwt` | List users |
| GET  | `/api/v1/users/:id` | `passport-jwt` | Get user by id |

## Scripts

See `scripts` in `package.json`. Run with `bun run <name>`.

## Folder Structure

```
src/
  common/
    dto/             # shared DTOs (pagination, etc.)
    filters/         # global exception filter (incl. Prisma error mapping)
    interceptors/    # global response interceptor
    responses/       # response type shapes
  core/
    config/          # zod-validated env config
    database/        # PrismaService + module (global)
    health/          # health checks
    security/        # rate-limit module (throttler)
  modules/
    auth/            # Passport strategies, guards, controller, DTOs, types
    users/           # users service + controller + DTOs + types
  app.module.ts
  main.ts
prisma/
  schema.prisma      # DB schema
  migrations/        # migration history
prisma.config.ts     # prisma 7 config
```

---

Maintained by Geoplan Philippines. Internal use only.