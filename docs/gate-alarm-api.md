# Post a gate read

Send every tag a gate reads to the MUJI EAS server. The server checks the sold list. A sold tag passes and leaves no trace. A tag that is not sold raises one alarm, and the alarm shows on the dashboard's Alarm Events page.

No `Authorization` header.

`POST http://localhost:8000/api/v1/alarms`

Post every read, about every 3 seconds while a tag stays in range. Do not filter repeats in the gate app. The server does that.

This route can take about 10 seconds to answer an unsold tag, because it waits for the camera. To decide whether the
gate itself should sound, use [`POST /api/v1/anti-theft/known-epcs/check`](gate-sold-check-api.md) instead. It only
reads the sold list.

## Request

```json
{
  "epc": "30351597B03DAA10A02DD553",
  "readerName": "GATE-1",
  "scannedAt": "2026-11-02T10:14:20.000Z"
}
```

`readerName` and `scannedAt` may be omitted. `scannedAt` is an ISO 8601 date string.

The server strips spaces and uppercases the EPC. It does not check the length or that it is hex. A tag that is not on the sold list raises an alarm, whatever its format.

A field that is not listed above is rejected.

## Response

There are three outcomes. Read `data.outcome` to tell them apart.

| `outcome` | Status | When | What the server did |
| --- | --- | --- | --- |
| `ignored_sold` | 200 | The EPC is on the sold list. | Wrote nothing. No camera capture. `id` is null. |
| `duplicate` | 200 | This EPC already has an alarm from the last 30 seconds. | Wrote nothing new. No camera capture. `id` is that earlier alarm. |
| `alarm_created` | 201 | The EPC is not sold and has no alarm in the last 30 seconds. | Wrote one alarm. Asked the camera for a snapshot. |

The 30 seconds is `ALARM_COOLDOWN_SECONDS` on the server. It counts per EPC, whichever gate read the tag.

A new alarm returns HTTP 201. This is the body from that call:

```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "ok": true,
    "outcome": "alarm_created",
    "message": "Unsold tag, alarm created",
    "id": "c2fb29dd-f532-4eab-bd98-5fba63975b52",
    "captured": true
  }
}
```

A sold tag returns HTTP 200:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "ok": true,
    "outcome": "ignored_sold",
    "message": "Sold tag, ignored",
    "id": null,
    "captured": false
  }
}
```

A repeat returns HTTP 200 with `"outcome": "duplicate"` and the `id` of the earlier alarm.

`captured` is true when that alarm has a camera snapshot. It is false when the camera is not set up or the capture failed. The alarm is written either way. On a `duplicate`, `captured` is the state of the earlier alarm right now. If that alarm is still waiting for its snapshot, it can be false.

## What to do with the status

The server allows 600 requests per minute per IP on this route. A 429 means you hit that limit.

| Status | What you do |
| --- | --- |
| 201 | Success. A new alarm was written. Stop. |
| 200 | Success. The tag was sold or it was a repeat. Stop. |
| 400 | The body is invalid. Do not retry until the body is fixed. |
| 429 | Wait, then retry the same body. |
| 5xx | Retry the same body. |
| Network error | Retry the same body. |

201 and 200 are both success. Never retry a 400.

Retrying is safe. A retry inside the 30 seconds comes back as `duplicate` and writes nothing.

## curl

Bash:

```bash
curl -X POST http://localhost:8000/api/v1/alarms -H "Content-Type: application/json" -d '{"epc":"30351597B03DAA10A02DD553","readerName":"GATE-1","scannedAt":"2026-11-02T10:14:20.000Z"}'
```

Windows PowerShell. `curl` is an alias there, so call `curl.exe`.

```powershell
curl.exe -X POST http://localhost:8000/api/v1/alarms -H "Content-Type: application/json" -d '{"epc":"30351597B03DAA10A02DD553","readerName":"GATE-1","scannedAt":"2026-11-02T10:14:20.000Z"}'
```
