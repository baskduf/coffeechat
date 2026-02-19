# CoffeeChat Frontend (MVP UX Final)

React + TypeScript + Vite 기반 CoffeeChat 프론트엔드입니다.

## Run Guide
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

기본 API:
- `VITE_API_BASE_URL=http://localhost:4000`

빌드 확인:
```bash
npm run build
```

## UX Journey (End-to-End)
앱은 실제 운영 흐름 기준 5단계 네비게이션으로 구성됩니다.

1. **Onboarding & Auth**
   - OAuth(mock) 로그인
   - phone verify
   - 사용자 ID 확보

2. **Profile Setup**
   - nickname / bio / region 업데이트
   - interests(콤마 입력) 저장
   - availability 슬롯 추가

3. **Suggestions & Proposals**
   - 매칭 후보(점수 기반) 조회
   - 후보에게 proposal 전송
   - proposal 수락/거절
   - 수락 시 appointment 생성

4. **Appointment Lifecycle**
   - appointment 상세 조회
   - check-in code 입력
   - meeting 후 review 작성
   - no-show 신고 / incident report 생성

5. **Admin Moderation**
   - open reports 조회 (admin key 필요)
   - report resolve + sanction 적용

## UI/Design System
- 공통 컴포넌트: `Card`, `Button`, `InputField`, `Badge`, `Notice`
- 일관된 상태 표현: loading/성공/오류 notice
- 빈 상태(Empty state), 카드 리스트, 반응형 레이아웃
- 단계형 Journey Nav(현재 단계 + 완료 표시)

## 주요 파일
- `src/App.tsx`: 사용자 시나리오 중심 메인 플로우
- `src/components/ui.tsx`: 공통 UI primitive
- `src/components/JourneyNav.tsx`: 플로우 네비게이션
- `src/api.ts`: 백엔드 API binding
