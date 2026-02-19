# CoffeeChat MVP

Notion PRD(v2) 기반 MVP 백엔드 구현.

## 구현 범위 (현재)
- Auth: Mock OAuth 로그인, 전화번호 인증 플래그
- Profile: 프로필/관심사
- Availability 슬롯
- Matching 제안/수락/거절
- Appointment 생성/조회
- Check-in(4자리 코드)
- Review / Report
- Admin Report 처리 / 제재
- **No-show 자동 제재 정책** (90일 내 누적: 1회 7일, 2회 30일, 3회 BAN)

## 실행
```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

## Seed
```bash
npm run seed
```

## E2E 흐름 테스트
서버 실행 후:
```bash
npm run test:flow
```

## 주요 API
- `POST /auth/:provider`
- `POST /auth/phone/verify`
- `GET /me/:userId`
- `PUT /me/profile`
- `PUT /me/interests`
- `POST /me/availability`
- `GET /matches/suggestions/:userId`
- `POST /matches/proposals`
- `POST /matches/:id/accept` (accepterId 필요)
- `POST /appointments/:id/checkin-code`
- `POST /appointments/:id/review`
- `POST /appointments/:id/report`
- `POST /appointments/:id/no-show`
- `GET /admin/reports`
- `POST /admin/reports/:id/resolve`

## 단계별 계획
1. 프로젝트/스키마 구성 ✅
2. Auth/Profile/Availability ✅
3. Matching/Appointment/Check-in ✅
4. Review/Report/Admin ✅
5. 정책/seed/E2E 보강 ✅(1차)
