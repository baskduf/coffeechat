# CoffeeChat Frontend Track Plan

## Goal
Deliver a React + TypeScript (Vite) frontend shell that exercises all core MVP backend flows.

## Scope (Phase 1)
1. **App foundation**
   - Vite React+TS app under `/frontend`
   - Route-based navigation and shared API client
2. **Auth (mock)**
   - OAuth provider login form (`/auth/:provider`)
   - Phone verification action (`/auth/phone/verify`)
3. **Profile & interests**
   - Read current user snapshot (`/me/:userId`)
   - Update profile and interests (`/me/profile`, `/me/interests`)
4. **Availability**
   - List, create, delete availability slots (`/me/:userId/availability`, `/me/availability`, DELETE `/me/availability/:id`)
5. **Matching**
   - Suggestions list and proposal board (`/matches/suggestions/:userId`, `/matches/proposals/:userId`)
   - Proposal create / accept / reject actions
6. **Appointments**
   - Fetch appointment details, check-in code, no-show, review, and report flows
7. **Admin report list**
   - Admin key input and open report list (`/admin/reports`)

## Implementation Approach
- Build a typed fetch wrapper (`apiClient`) with unified error handling.
- Keep state local to pages for fast MVP iteration.
- Expose `API_BASE_URL` via `VITE_API_BASE_URL`.
- Use `currentUserId` and `adminApiKey` from simple UI inputs (no persistent auth in phase 1).

## Next Iterations
- Add shared state (context/query cache), validation UX, and loading skeletons.
- Add comprehensive routing guards and polished design system.
- Add e2e tests against seeded backend.
