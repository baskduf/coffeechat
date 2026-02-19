export type OAuthProvider = 'google' | 'kakao' | 'apple'

export type User = {
  id: string
  email: string
  nickname: string
  provider: OAuthProvider
  phoneVerified: boolean
  bio: string | null
  region: string | null
  trustScore: number
  blocked: boolean
}

export type UserInterest = {
  id: string
  userId: string
  name: string
}

export type AvailabilitySlot = {
  id: string
  userId: string
  weekday: number
  startTime: string
  endTime: string
  area: string
}

export type MatchProposal = {
  id: string
  proposerId: string
  partnerId: string
  message?: string | null
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  createdAt: string
}

export type MatchSuggestion = {
  user: User & { interests: UserInterest[]; availability: AvailabilitySlot[] }
  score: number
  breakdown: {
    overlapInterests: number
    interestOverlapRatio: number
    regionMatch: boolean
    availabilityOverlapMinutes: number
    availabilityOverlapRatio: number
  }
}

export type AttendanceCheck = {
  id: string
  appointmentId: string
  userId: string
  method: string
}

export type Appointment = {
  id: string
  proposalId: string
  userAId: string
  userBId: string
  place: string
  startsAt: string
  checkinCode: string
  status: 'SCHEDULED' | 'COMPLETED' | 'NO_SHOW'
  checks?: AttendanceCheck[]
}

export type Report = {
  id: string
  appointmentId: string
  reporterId: string
  targetUserId: string
  reason: string
  evidence?: string | null
  status: 'OPEN' | 'RESOLVED'
  createdAt: string
}
