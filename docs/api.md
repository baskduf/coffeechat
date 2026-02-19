# CoffeeChat MVP API Spec (v0.1)

Base URL: `http://127.0.0.1:4000`

## Error format
All errors return:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "human readable"
  }
}
```

Common codes:
- `BAD_REQUEST`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `USER_RESTRICTED`
- `SERVER_MISCONFIGURED`

---

## Auth
### POST `/auth/:provider`
Body:
```json
{ "email": "user@example.com", "nickname": "alice" }
```
Response: `{ "user": { ... } }`

### POST `/auth/phone/verify`
Body:
```json
{ "userId": "cuid" }
```

---

## Profile
### GET `/me/:userId`
### PUT `/me/profile`
Body:
```json
{ "userId": "...", "nickname": "...", "bio": "...", "region": "Gangnam" }
```

### PUT `/me/interests`
Body:
```json
{ "userId": "...", "interests": ["frontend", "ai"] }
```

---

## Availability
### GET `/me/:userId/availability`
### POST `/me/availability`
Body:
```json
{ "userId": "...", "weekday": 2, "startTime": "19:00", "endTime": "21:00", "area": "Gangnam" }
```

### DELETE `/me/availability/:id`

---

## Matching
### GET `/matches/suggestions/:userId`
Returns ranked candidates based on overlap(interests, region, availability window).

### GET `/matches/proposals/:userId`
### POST `/matches/proposals`
Body:
```json
{ "proposerId": "...", "partnerId": "...", "message": "coffee?" }
```

### POST `/matches/:id/accept`
Body:
```json
{ "accepterId": "...", "place": "Gangnam", "startsAt": "2026-02-20T10:00:00.000Z" }
```

### POST `/matches/:id/reject`

---

## Appointment
### GET `/appointments/:id`

### POST `/appointments/:id/checkin-code`
Body:
```json
{ "userId": "...", "code": "1234" }
```

### POST `/appointments/:id/review`
Body:
```json
{ "reviewerId": "...", "revieweeId": "...", "comment": "good", "scoreDelta": 2 }
```

### POST `/appointments/:id/report`
Body:
```json
{ "reporterId": "...", "targetUserId": "...", "reason": "abuse", "evidence": "optional" }
```

### POST `/appointments/:id/no-show`
Body:
```json
{ "reporterId": "...", "targetUserId": "...", "reason": "did not arrive" }
```
Policy: 90d strikes escalate `SUSPEND_7D -> SUSPEND_30D -> BAN`.

---

## Admin (requires API key)
Header: `x-admin-api-key: <ADMIN_API_KEY>` (or `x-api-key`)

### GET `/admin/reports`
### POST `/admin/reports/:id/resolve`
Body:
```json
{ "sanction": "BAN", "trustDelta": -12 }
```

### POST `/admin/users/:id/sanction`
Body:
```json
{ "level": "SUSPEND_7D", "reason": "manual moderation" }
```
