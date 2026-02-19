# CoffeeChat 프론트엔드 (MVP 운영 콘솔)

React + TypeScript + Vite 기반 CoffeeChat 프론트엔드입니다.

## 실행 방법
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

기본 API 주소:
- `VITE_API_BASE_URL=http://localhost:4000`

빌드 확인:
```bash
npm run build
```

## 사용자 여정 (End-to-End)
앱은 실제 운영 흐름 기준 5단계 네비게이션으로 구성됩니다.

1. **온보딩 & 인증**
   - OAuth(mock) 로그인
   - 휴대폰 인증
   - 사용자 ID 확보

2. **프로필 설정**
   - 닉네임 / 소개 / 지역 업데이트
   - 관심사(콤마 입력) 저장
   - 가능 시간 슬롯 추가

3. **추천 & 제안**
   - 매칭 후보(점수 기반) 조회
   - 후보에게 제안 전송
   - 제안 수락/거절
   - 수락 시 약속 생성

4. **약속 진행**
   - 약속 상세 조회
   - 체크인 코드 입력
   - 미팅 후 리뷰 작성
   - no-show 신고 / 사건 신고

5. **관리자 모더레이션**
   - 열린 신고 조회 (관리자 키 필요)
   - 신고 처리 + 제재 적용

## 디자인/UX 폴리시 (Yellow Coffee Theme)
- 따뜻한 옐로우/크림/커피 브라운 기반 테마 토큰 적용
- 공통 컴포넌트(`Card`, `Button`, `InputField`, `Badge`, `Notice`) 일관 스타일
- 운영 흐름별 Empty state / Skeleton / 상태 메시지 강화
- 입력 검증 힌트(이메일, 닉네임, 시간대, 체크인 코드) 제공

## 주요 파일
- `src/App.tsx`: 사용자 시나리오 중심 메인 흐름
- `src/components/ui.tsx`: 공통 UI 컴포넌트 + Skeleton/EmptyState
- `src/components/JourneyNav.tsx`: 단계 네비게이션
- `src/api.ts`: 백엔드 API 연동
- `../docs/frontend-polish-report.md`: 폴리시 단계별 결과 보고
