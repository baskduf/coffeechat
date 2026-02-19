# CoffeeChat Frontend UX Plan (Finalized MVP)

## Objective
백엔드 API와 실제로 연동되는 **production-like MVP UX**를 구현한다.
핵심은 기능 버튼 나열이 아니라 사용자 여정 중심의 완결된 플로우다.

## Final User Journey
1. **Onboarding/Auth**
   - OAuth(mock) 로그인
   - phone verify
   - 생성된 userId를 전역 컨텍스트로 사용
2. **Profile Setup**
   - profile 정보 수정 (nickname, bio, region)
   - interests 다중 입력
   - availability slot 등록으로 매칭 품질 확보
3. **Suggestion/Proposal**
   - 추천 목록 조회(점수 + 설명)
   - proposal 생성
   - proposal 수락/거절
   - 수락 시 appointment 자동 생성
4. **Appointment Lifecycle**
   - appointment 조회
   - check-in code 처리
   - completed 후 review
   - no-show / incident report 처리
5. **Admin Moderation**
   - open reports 조회 (admin key 헤더)
   - report resolve + sanction/trust 처리

## Frontend Structure
- `src/App.tsx`
  - 단계형 시나리오 orchestration
  - 공통 상태(user, proposal, appointment, reports)
- `src/components/ui.tsx`
  - Button/Card/InputField/Badge/Notice 등 재사용 UI
- `src/components/JourneyNav.tsx`
  - 현재 단계, 완료 상태, 단계 이동
- `src/api.ts`
  - 타입 기반 API 바인딩 + 공통 에러 처리

## Design System Rules
- 카드 기반 레이아웃 + 충분한 여백
- 명확한 CTA 버튼(primary/secondary/ghost/danger)
- 상태 메시지 통합(notice: idle/success/error)
- 빈 상태/로딩 비활성화/실패 메시지 일관성
- 반응형: 모바일에서 단일 컬럼으로 자동 변환

## Acceptance Checklist
- [x] 온보딩~관리자 모더레이션까지 단일 앱에서 흐름 연결
- [x] 주요 액션이 실제 API와 양방향 데이터 연동
- [x] 공통 UI 컴포넌트로 스타일 일관성 확보
- [x] README에 실행/플로우 문서화
- [x] `npm run build` 성공
