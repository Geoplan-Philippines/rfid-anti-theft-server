# Post a sold-tag sale

Send one sale to the MUJI EAS server. The server stores the sale and adds every EPC to the sold list. The gate lets a tag on that list pass.

No `Authorization` header.

`POST http://localhost:8000/api/v1/transactions`

## Request

```json
{
  "clientTransactionId": "7b0c1e0a-3f0c-4a7b-9d57-0a6f7a1d2c11",
  "storeCode": "MUJI-NUVALI",
  "deviceId": "POS-03-HAX7700",
  "cashierName": "Ana",
  "startedAt": "2026-11-02T10:14:05.000Z",
  "endedAt": "2026-11-02T10:15:12.000Z",
  "tags": [
    {
      "epc": "30351597B03DAA10A02DD553",
      "scannedAt": "2026-11-02T10:14:20.000Z"
    }
  ]
}
```

`cashierName` may be omitted. A blank or missing cashier name is stored as null.

EPCs are stored as 24-character uppercase hex. The server strips spaces and uppercases each EPC before it checks the length. An EPC that is not 24 hex characters after that is rejected, and the server writes nothing.

More than 200 tags is rejected. The limit counts the array you send, before duplicate EPCs are collapsed. Duplicate EPCs in one request are collapsed. The first `scannedAt` for each EPC is the one that is stored.

## Response

A new sale returns HTTP 201. This is the body from that call:

```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "id": "c2fb29dd-f532-4eab-bd98-5fba63975b52",
    "clientTransactionId": "7b0c1e0a-3f0c-4a7b-9d57-0a6f7a1d2c11",
    "itemCount": 1,
    "duplicateEpcsIgnored": 0,
    "alreadySoldEpcs": [],
    "createdAt": "2026-10-28T01:28:08.414Z"
  }
}
```

HTTP 200 uses the same `data` fields. `alreadySoldEpcs` lists EPCs that were already on the sold list before this sale, in the order they first appeared in the request.

## What to do with the status

The server allows 100 requests per minute. A 429 means you hit that limit.

| Status | What you do |
| --- | --- |
| 201 | The sale is stored. Stop. |
| 200 | The sale was already stored. Stop. Do not count it as a new sale. |
| 409 | This id was stored with a different body. Do not retry. |
| 400 | The body is invalid. Do not retry until the body is fixed. |
| 429 | Wait, then retry the same body. |
| 5xx | Retry the same body. |
| Network error | Retry the same body. |

Never retry a 400. Never retry a 409 by changing the body and posting the same `clientTransactionId` again.

## curl

Bash:

```bash
curl -X POST http://localhost:8000/api/v1/transactions -H "Content-Type: application/json" -d '{"clientTransactionId":"7b0c1e0a-3f0c-4a7b-9d57-0a6f7a1d2c11","storeCode":"MUJI-NUVALI","deviceId":"POS-03-HAX7700","cashierName":"Ana","startedAt":"2026-11-02T10:14:05.000Z","endedAt":"2026-11-02T10:15:12.000Z","tags":[{"epc":"30351597B03DAA10A02DD553","scannedAt":"2026-11-02T10:14:20.000Z"}]}'
```

Windows PowerShell. `curl` is an alias there, so call `curl.exe`.

```powershell
curl.exe -X POST http://localhost:8000/api/v1/transactions -H "Content-Type: application/json" -d '{"clientTransactionId":"7b0c1e0a-3f0c-4a7b-9d57-0a6f7a1d2c11","storeCode":"MUJI-NUVALI","deviceId":"POS-03-HAX7700","cashierName":"Ana","startedAt":"2026-11-02T10:14:05.000Z","endedAt":"2026-11-02T10:15:12.000Z","tags":[{"epc":"30351597B03DAA10A02DD553","scannedAt":"2026-11-02T10:14:20.000Z"}]}'
```
