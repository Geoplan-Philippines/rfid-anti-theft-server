# MUJI EAS server

This server records RFID tags sold at MUJI and decides which tags pass the gate.

A cashier widget posts one sale to `POST /api/v1/transactions`. Every EPC in that sale is added to `known_epcs`. `known_epcs` is the sold list. A tag on that list passes the gate. Any other tag raises an alarm. A gate posts every tag it reads to `POST /api/v1/alarms`. A sold tag leaves no trace, and a tag that reads again inside `ALARM_COOLDOWN_SECONDS` does not raise a second alarm.

Dashboard reads of the sold list and of transactions require a JWT. The following machine-facing routes are open:

- `POST /api/v1/transactions`
- `POST /api/v1/anti-theft/epcs/unsell`
- `POST /api/v1/alarms`
- `GET /api/v1/anti-theft/known-epcs`
- `POST /api/v1/anti-theft/known-epcs/check`

The widget contract is `docs/widget-api.md`. The gate contract is `docs/gate-alarm-api.md`. The store registry is `docs/stores-api.md`.

A sale keeps the store code the till sent. The sales list and the sale detail add `storeName` and `registered` by matching that code against `stores` when they are read, after trimming and ignoring case. Registering or deleting a store relabels old sales without changing them.

Store photos are saved in `uploads/stores/` and CCTV snapshots in `uploads/captures/`. Both are served at `/uploads/*`. The `uploads` folder is not in git; the server creates it at startup.

## Run

```bash
bun install
cp .env.example .env
bunx prisma migrate deploy
bunx prisma db seed
bun run start:dev
```

Fill in `DATABASE_URL` and `JWT_SECRET` before `migrate deploy`. `JWT_SECRET` must be at least 32 characters. The API prefix is `/api/v1`. The listen port is `PORT`.

```bash
curl http://localhost:8000/api/v1/health
```

A healthy body has `"statusCode": 200` and `data.status` set to `ok`. `data.info.database.status` is `up`.

## Environment

Names match `src/core/config/env.config.ts` and `.env.example`.

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `ALARM_COOLDOWN_SECONDS`, optional, default 30
- `CCTV_SNAPSHOT_URL`, optional
- `CCTV_USERNAME`, optional
- `CCTV_PASSWORD`, optional

`ALARM_COOLDOWN_SECONDS` is a whole number from 1 to 86400. After an alarm for an EPC, the server writes no second alarm and takes no second snapshot for that EPC until that many seconds pass. This holds whichever gate reads the tag.

Leave the three CCTV keys commented until a camera is configured. Do not set `CCTV_SNAPSHOT_URL` to an empty string. When that key is present, the value has to be a URL.

## First user

There is no registration route. `bunx prisma db seed` creates the first user from `prisma/seed.ts`. Change the password after login. If that email already exists, the seed does not replace the password. Later users are created by a signed-in admin at `POST /api/v1/users`.

## Routes

| Method | Path | Who can call it |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | Open, rate limited |
| GET | `/api/v1/auth/me` | JWT |
| POST | `/api/v1/transactions` | Open until a per-device key exists |
| GET | `/api/v1/transactions` | JWT |
| GET | `/api/v1/transactions/:id` | JWT |
| POST | `/api/v1/alarms` | Open until a per-device key exists, 600 requests per minute per IP |
| GET | `/api/v1/alarms` | JWT |
| GET | `/api/v1/anti-theft/known-epcs` | Open until a per-device key exists |
| GET, POST | `/api/v1/anti-theft/epcs` | JWT |
| POST | `/api/v1/anti-theft/epcs/unsell` | Open, like sale submission |
| GET, PATCH, DELETE | `/api/v1/anti-theft/epcs/:id` | JWT |
| GET, POST | `/api/v1/stores` | JWT |
| GET, PATCH, DELETE | `/api/v1/stores/:id` | JWT |
| GET | `/uploads/*` | Open. Store photos and CCTV snapshots |

Successful JSON is `{ "statusCode", "message": "Success", "data" }`. List routes put `{ "total", "page", "limit", "lastPage" }` on `data.meta`.

## Widget returns

`POST /api/v1/anti-theft/epcs/unsell` is open like `POST /api/v1/transactions`.
Send JSON `{ "epcs": ["<EPC>"], "reason": "Item Return" }` with no authentication headers,
user ID, API key, or access token. The widget supplies the fixed reason automatically.
The service no longer requires an authenticated actor. Audit events retain their existing fields,
with `actorUserId` and `actorEmail` set to the explicit marker `unauthenticated`; no user is impersonated
and no user record/configuration or schema migration is needed. Existing historical audits are unchanged.
Any caller that can reach this route can unsell EPCs. Other protected endpoints retain JWT authentication.

The previous `WIDGET_UNSELL_API_KEY` / `WIDGET_UNSELL_USER_ID` server settings and
`HAX7700_UNSELL_API_KEY` / `HAX7700_UNSELL_ACCESS_TOKEN` widget settings are no longer used.
They can be removed from your deployment environment. Keep `JWT_SECRET` for dashboard authentication.
Restart the updated server and widgets; older pending return files resume without conversion.
See `docs/unsell-tags-api.md` for request validation and response details.

## Scripts

Run the `scripts` in `package.json` with `bun run`.

## Layout

```
src/
  common/          filters, the response interceptor, pagination, uploads folder
  core/            env, Prisma, health, rate limit
  modules/
    alarms/        gate alarms
    anti-theft/    known_epcs, the sold list
    auth/
    stores/        store registry and store photos
    transactions/  cashier sales
    users/
prisma/
  schema.prisma
  migrations/
  seed.ts
```
