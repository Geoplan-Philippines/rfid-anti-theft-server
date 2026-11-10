# MUJI EAS server

This server records RFID tags sold at MUJI and decides which tags pass the gate.

A cashier widget posts one sale to `POST /api/v1/transactions`. Every EPC in that sale is added to `known_epcs`. `known_epcs` is the sold list. A tag on that list passes the gate. Any other tag raises an alarm. A gate posts every tag it reads to `POST /api/v1/alarms`. A sold tag leaves no trace, and a tag that reads again inside `ALARM_COOLDOWN_SECONDS` does not raise a second alarm.

Dashboard reads of the sold list and of transactions require a JWT. Three routes stay open until a per-device key exists.

- `POST /api/v1/transactions`
- `POST /api/v1/alarms`
- `GET /api/v1/anti-theft/known-epcs`

The widget contract is `docs/widget-api.md`. The gate contract is `docs/gate-alarm-api.md`.

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
| POST | `/api/v1/anti-theft/epcs/unsell` | JWT |
| GET, PATCH, DELETE | `/api/v1/anti-theft/epcs/:id` | JWT |

Successful JSON is `{ "statusCode", "message": "Success", "data" }`. List routes put `{ "total", "page", "limit", "lastPage" }` on `data.meta`.

## Scripts

Run the `scripts` in `package.json` with `bun run`.

## Layout

```
src/
  common/          filters, the response interceptor, pagination
  core/            env, Prisma, health, rate limit
  modules/
    alarms/        gate alarms
    anti-theft/    known_epcs, the sold list
    auth/
    transactions/  cashier sales
    users/
prisma/
  schema.prisma
  migrations/
  seed.ts
```
