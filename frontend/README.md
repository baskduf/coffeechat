# CoffeeChat Frontend (MVP Track)

React + TypeScript + Vite 기반의 CoffeeChat MVP 프론트엔드입니다.

## 실행
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

기본 API 대상:
- `VITE_API_BASE_URL=http://localhost:4000`

## 현재 구현 범위
- Mock Auth + phone verify
- Profile / interests 조회·수정
- Availability 조회·등록
- Match suggestions / proposal 생성·수락·거절
- Appointment 조회 / check-in / no-show / review / report
- Admin report list (관리자 키 입력)

## 참고
- 프론트엔드 계획 문서: `../docs/frontend-plan.md`
- 백엔드 API 문서: `../docs/api.md`
