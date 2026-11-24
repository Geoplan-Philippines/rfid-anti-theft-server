# Unsell tags

Remove one or more EPCs from the sold list without deleting their transaction history. Every request writes an audit
event containing an explicit unauthenticated actor marker, reason and outcome.

## Request

`POST /api/v1/anti-theft/epcs/unsell`

This route is open, matching sale submission. Send `Content-Type: application/json` and JSON like:

```json
{
  "epcs": ["E28069950000AA039398B5EA"],
  "reason": "Item Return"
}
```

`epcs` must contain 1 to 200 strings. The server strips whitespace, uppercases each EPC and collapses duplicates.
`reason` is optional and can contain at most 500 characters.

No API key, access token, login, or user ID is required. Authentication headers are not used.
The widget always supplies `reason: "Item Return"`. No actor ID is accepted in the request body.
The server stores `unauthenticated` in both existing actor fields; these markers are not user identities.
Any caller that can reach the route can unsell items. Other protected endpoints still require JWT.

## Response

The route returns HTTP 201. EPCs removed from `known_epcs` are in `unsoldEpcs`. EPCs that were already absent are in
`alreadyUnsoldEpcs`. A retry after a lost reply normally reports the EPC as already unsold.
There is no return-ID deduplication: if another till sells that EPC before the retry, the retry can unsell it again.

```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "id": "34c392a4-a438-4208-b6e0-0584bd8d9dfd",
    "actorUserId": "unauthenticated",
    "actorEmail": "unauthenticated",
    "reason": "Item Return",
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
