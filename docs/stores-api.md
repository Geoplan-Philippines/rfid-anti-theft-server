# Stores

The store registry gives a store code a name, an address and a photo. Every route needs a JWT.

A sale is never rejected or changed because of its store code. The sales list matches each sale's code to a registered store when it is read, so a store registered later labels its old sales too.

## Fields

| Field | Rule |
| --- | --- |
| `code` | Required. Up to 120 characters. Unique, ignoring case and spaces at either end. |
| `name` | Required. Up to 120 characters. |
| `address` | Optional. Up to 300 characters. A blank address is stored as null. |
| `photo` | Optional file. JPG, PNG or WebP, up to 5 MB. The server checks the file's bytes, not only its type. |

The code is stored as typed, after trimming. `muji-nuvali` and `MUJI-NUVALI` are the same store.

## Routes

| Method | Path | Body |
| --- | --- | --- |
| GET | `/api/v1/stores?page=1&limit=12` | None. Sorted by name. `limit` is 1 to 50. |
| GET | `/api/v1/stores/:id` | None |
| POST | `/api/v1/stores` | `multipart/form-data` or JSON |
| PATCH | `/api/v1/stores/:id` | `multipart/form-data` or JSON. Send only the fields that change. |
| DELETE | `/api/v1/stores/:id` | None. Returns the deleted store. |

On PATCH, a new `photo` replaces the old one and the old file is deleted. `removePhoto=true` without a file clears the photo. DELETE also deletes the photo file.

## Response

```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "id": "6f1d4a2e-7c55-4c3b-9a43-0b8d2f1e9a10",
    "code": "MUJI-MARIKINA",
    "name": "MUJI SM City Marikina",
    "address": "SM City Marikina, Marcos Highway, Marikina City",
    "photoUrl": "/uploads/stores/2b0c5f9e-4f7d-4c52-8f1a-6a1f3e2d9b77.jpg",
    "createdAt": "2026-11-19T08:30:00.000Z"
  }
}
```

`photoUrl` is relative to the server origin, for example `http://localhost:8000/uploads/stores/<file>.jpg`. It is null when there is no photo.

## Errors

| Status | When |
| --- | --- |
| 400 | A field breaks a rule above, or the photo is not a JPG, PNG or WebP. `message` says which. |
| 404 | No store has that id. |
| 409 | Another store already has that code, in any case. `message` names the existing code. |
| 413 | The photo is larger than 5 MB. |

## Sales

Each row of `GET /api/v1/transactions`, and `GET /api/v1/transactions/:id`, carries:

| Field | Value |
| --- | --- |
| `storeCode` | The code the till sent. |
| `storeName` | The matching store's name, or null. |
| `registered` | `true` when a store matches the code, `false` otherwise. |

The `storeCode` filter on the sales list ignores case.

## curl

```bash
curl -X POST http://localhost:8000/api/v1/stores \
  -H "Authorization: Bearer $TOKEN" \
  -F code=MUJI-MARIKINA \
  -F "name=MUJI SM City Marikina" \
  -F "address=SM City Marikina, Marcos Highway, Marikina City" \
  -F photo=@marikina.jpg
```
