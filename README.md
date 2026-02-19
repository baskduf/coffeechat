# CoffeeChat MVP Backend

Notion PRD(v2) 기반 CoffeeChat MVP API 구현입니다.

## 1) 실행 방법
```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

### 환경변수
`.env.example` 참고:
- `PORT` (default: `4000`)
- `ADMIN_API_KEY` (**필수**) : `/admin/*` 라우트 접근 키 (`x-admin-api-key` 또는 `x-api-key` 헤더)

`ADMIN_API_KEY` 미설정 시 admin API는 `503 SERVER_MISCONFIGURED`를 반환합니다.

## 2) 테스트
```bash
npm run build
npm run test:flow
npm run test:integration
```

- `test:flow`: happy-path E2E
- `test:integration`: 정책 가드레일/권한/제재 일관성/매칭 품질/관리자 해결 플로우 검증

## 3) 요구사항 ↔ 구현 매핑
- **Auth (OAuth + phone verify)**
  - `POST /auth/:provider`
  - `POST /auth/phone/verify`
- **Profile / Interests / Availability**
  - `GET /me/:userId`
  - `PUT /me/profile`
  - `PUT /me/interests`
  - `GET /me/:userId/availability`
  - `POST /me/availability`
  - `DELETE /me/availability/:id` (본인 소유 슬롯만 삭제 가능)
- **Matching**
  - `GET /matches/suggestions/:userId` (관심사/지역/시간대 겹침 기반 스코어링)
  - `GET /matches/proposals/:userId`
  - `POST /matches/proposals`
  - `POST /matches/:id/accept`
  - `POST /matches/:id/reject`
- **Appointment / Check-in / Review / Report**
  - `GET /appointments/:id`
  - `POST /appointments/:id/checkin-code`
  - `POST /appointments/:id/review`
  - `POST /appointments/:id/report`
  - `POST /appointments/:id/no-show` (90일 누적 자동 제재)
- **Admin Moderation**
  - `GET /admin/reports`
  - `POST /admin/reports/:id/resolve`
  - `POST /admin/users/:id/sanction`

## 4) 핵심 정책
- **제재 일관성**
  - 활성 제재(`SUSPEND_7D`, `SUSPEND_30D`, `BAN`) 또는 `blocked=true` 유저는 일반 액션 제한
  - no-show 누적: `7일 정지 → 30일 정지 → BAN`
  - BAN 시 `blocked=true`
- **예외 정책**
  - 제한 상태 유저도 기존 약속에 대해 `no-show` 신고는 가능 (정책 예외 경로)
- **Admin API 보호**
  - 키 없거나 불일치 시 `401 UNAUTHORIZED`

## 5) API 예시
### 로그인
```bash
curl -X POST http://127.0.0.1:4000/auth/google \
  -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","nickname":"alice"}'
```

### 매칭 제안
```bash
curl -X POST http://127.0.0.1:4000/matches/proposals \
  -H 'content-type: application/json' \
  -d '{"proposerId":"<userA>","partnerId":"<userB>","message":"coffee?"}'
```

### no-show 신고
```bash
curl -X POST http://127.0.0.1:4000/appointments/<appointmentId>/no-show \
  -H 'content-type: application/json' \
  -d '{"reporterId":"<userA>","targetUserId":"<userB>","reason":"did not arrive"}'
```

### Admin 리포트 조회
```bash
curl http://127.0.0.1:4000/admin/reports \
  -H 'x-admin-api-key: dev-admin-key'
```

### Admin 리포트 해결 + BAN
```bash
curl -X POST http://127.0.0.1:4000/admin/reports/<reportId>/resolve \
  -H 'content-type: application/json' \
  -H 'x-admin-api-key: dev-admin-key' \
  -d '{"sanction":"BAN","trustDelta":-12}'
```
