# CoffeeChat MVP

Notion PRD(v2) 기반 MVP 구현 저장소.

## 범위 (MVP)
- Auth: Kakao/Google/Phone verify (MVP에서는 Mock OAuth + Phone OTP)
- Profile/Interests
- Availability 슬롯
- Matching 제안 수락/거절
- Appointment 생성/조회
- Check-in(4자리 코드)
- Review / Report
- Admin Report 처리 / 제재

## 실행
```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

## 단계별 구현 계획
1. 프로젝트 스캐폴딩 + DB 스키마
2. Auth/Profile/Availability API
3. Matching/Appointment/Check-in API
4. Review/Report/Admin API
5. 정책/제재 로직 + seed + 문서 보강

## 참고
- PRD: CoffeeChat 웹 MVP 최종 PRD v2 (Notion)
