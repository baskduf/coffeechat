import type { Appointment, AvailabilitySlot, MatchProposal, MatchSuggestion, OAuthProvider, Report, User, UserInterest } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

class ApiError extends Error {
  status: number
  details: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg = data?.error?.message ?? `Request failed: ${res.status}`
    throw new ApiError(msg, res.status, data?.error?.details)
  }

  return data as T
}

export const api = {
  auth(provider: OAuthProvider, email: string, nickname: string) {
    return request<{ user: User }>(`/auth/${provider}`, {
      method: 'POST',
      body: JSON.stringify({ email, nickname }),
    })
  },
  verifyPhone(userId: string) {
    return request<{ user: User }>('/auth/phone/verify', { method: 'POST', body: JSON.stringify({ userId }) })
  },
  me(userId: string) {
    return request<User & { interests: UserInterest[]; availability: AvailabilitySlot[] }>(`/me/${userId}`)
  },
  updateProfile(payload: { userId: string; nickname: string; bio?: string; region?: string }) {
    return request<User>('/me/profile', { method: 'PUT', body: JSON.stringify(payload) })
  },
  updateInterests(payload: { userId: string; interests: string[] }) {
    return request<UserInterest[]>('/me/interests', { method: 'PUT', body: JSON.stringify(payload) })
  },
  availability(userId: string) {
    return request<AvailabilitySlot[]>(`/me/${userId}/availability`)
  },
  addAvailability(payload: { userId: string; weekday: number; startTime: string; endTime: string; area: string }) {
    return request<AvailabilitySlot>('/me/availability', { method: 'POST', body: JSON.stringify(payload) })
  },
  deleteAvailability(id: string, userId: string) {
    return request<{ ok: boolean }>(`/me/availability/${id}`, { method: 'DELETE', body: JSON.stringify({ userId }) })
  },
  suggestions(userId: string) {
    return request<MatchSuggestion[]>(`/matches/suggestions/${userId}`)
  },
  proposals(userId: string) {
    return request<MatchProposal[]>(`/matches/proposals/${userId}`)
  },
  createProposal(payload: { proposerId: string; partnerId: string; message?: string }) {
    return request<MatchProposal>('/matches/proposals', { method: 'POST', body: JSON.stringify(payload) })
  },
  acceptProposal(id: string, payload: { accepterId: string; place: string; startsAt: string }) {
    return request<{ proposal: MatchProposal; appointment: Appointment }>(`/matches/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  rejectProposal(id: string, rejecterId: string) {
    return request<MatchProposal>(`/matches/${id}/reject`, { method: 'POST', body: JSON.stringify({ rejecterId }) })
  },
  appointment(id: string) {
    return request<Appointment>(`/appointments/${id}`)
  },
  checkin(id: string, payload: { userId: string; code: string }) {
    return request(`/appointments/${id}/checkin-code`, { method: 'POST', body: JSON.stringify(payload) })
  },
  noShow(id: string, payload: { reporterId: string; targetUserId: string; reason: string }) {
    return request(`/appointments/${id}/no-show`, { method: 'POST', body: JSON.stringify(payload) })
  },
  review(id: string, payload: { reviewerId: string; revieweeId: string; comment: string; scoreDelta: number }) {
    return request(`/appointments/${id}/review`, { method: 'POST', body: JSON.stringify(payload) })
  },
  report(id: string, payload: { reporterId: string; targetUserId: string; reason: string; evidence?: string }) {
    return request(`/appointments/${id}/report`, { method: 'POST', body: JSON.stringify(payload) })
  },
  adminReports(adminApiKey: string) {
    return request<Report[]>('/admin/reports', { headers: { 'x-admin-api-key': adminApiKey } })
  },
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `${error.message} (status ${error.status})`
  }
  return error instanceof Error ? error.message : 'Unknown error'
}
