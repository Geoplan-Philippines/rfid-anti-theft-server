# Unsell tags

Remove one or more EPCs from the sold list without deleting their transaction history. Every request writes an audit
event containing the authenticated user, reason and outcome.

## Request

`POST /api/v1/anti-theft/epcs/unsell`

Send a JWT in `Authorization: Bearer <token>` and JSON like:

```json
{
  "epcs": ["E28069950000AA039398B5EA"],
  "reason": "Customer refund"
}
```

`epcs` must contain 1 to 200 strings. The server strips whitespace, uppercases each EPC and collapses duplicates.
`reason` is optional and can contain at most 500 characters.

## Response

The route returns HTTP 201. EPCs removed from `known_epcs` are in `unsoldEpcs`. EPCs that were already absent are in
`alreadyUnsoldEpcs`, so retrying the request is safe.

```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "id": "34c392a4-a438-4208-b6e0-0584bd8d9dfd",
    "actorUserId": "d2cf551c-fbde-469e-809f-a5c9988b3420",
    "actorEmail": "admin@example.com",
    "reason": "Customer refund",
    "requestedEpcs": ["E28069950000AA039398B5EA"],
    "unsoldEpcs": ["E28069950000AA039398B5EA"],
    "alreadyUnsoldEpcs": [],
    "duplicateEpcsIgnored": 0,
    "createdAt": "2026-11-10T01:00:00.000Z"
  }
}
```

After the request commits, gate checks report each removed EPC as `sold: false`. The original transaction and its tags
remain stored.
