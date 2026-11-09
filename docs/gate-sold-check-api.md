# Check whether gate tags are sold

Ask the MUJI EAS server which tags in one gate packet are sold, so the gate bridge can decide straight away whether
the gate should sound. This route only reads the sold list. It writes nothing, raises no alarm and never asks the
camera for a snapshot. Dashboard alarms still come from [`POST /api/v1/alarms`](gate-alarm-api.md).

No `Authorization` header.

`POST http://localhost:8000/api/v1/anti-theft/known-epcs/check`

## Request

```json
{ "epcs": ["E28069950000AA039398B5EA", "3BE100003744AA2700000769"] }
```

- `epcs`: 1 to 100 strings, each non-empty and at most 128 characters.
- The server strips spaces and uppercases each EPC, the same way `POST /api/v1/alarms` does. An EPC that is only
  spaces is rejected.
- A field that is not listed above is rejected.

## Response

Always HTTP 200 on success:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "results": [
      { "epc": "E28069950000AA039398B5EA", "sold": true },
      { "epc": "3BE100003744AA2700000769", "sold": false }
    ]
  }
}
```

- One result per distinct EPC after normalizing, in the order each first appears in the request.
- `sold` is true when the EPC is on the sold list (`known_epcs`), the same rule `POST /api/v1/alarms` uses to answer
  `ignored_sold`.

## What to do with the status

The server allows 3000 requests per minute per IP on this route. A 429 means you hit that limit.

| Status | Meaning |
| --- | --- |
| 200 | Use `data.results`. |
| 400 | The body is invalid. Do not retry until it is fixed. |
| 429 | Too many checks. The answer is unknown. |
| 5xx | The server could not check. The answer is unknown. |
| Network error or timeout | The answer is unknown. |

Anything but a 200 is not an answer: it says nothing about whether a tag is sold or unsold.

## curl

Windows PowerShell. `curl` is an alias there, so call `curl.exe`.

```powershell
curl.exe -X POST http://localhost:8000/api/v1/anti-theft/known-epcs/check -H "Content-Type: application/json" -d '{"epcs":["E28069950000AA039398B5EA"]}'
```
