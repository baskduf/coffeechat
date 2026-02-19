import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api, getApiErrorMessage } from './api'
import type { Appointment, MatchProposal, MatchSuggestion, OAuthProvider, Report, User } from './types'
import { JourneyNav, type JourneyStep } from './components/JourneyNav'
import { Badge, Button, Card, EmptyState, InputField, Notice, Skeleton } from './components/ui'
import './App.css'

const providers: OAuthProvider[] = ['google', 'kakao', 'apple']

const steps: JourneyStep[] = [
  { key: 'onboarding', label: '온보딩 & 인증', desc: '모의 OAuth 로그인 후 휴대폰 인증으로 시작합니다.' },
  { key: 'profile', label: '프로필 설정', desc: '닉네임/소개/지역/관심사/주간 가능 시간을 설정합니다.' },
  { key: 'matching', label: '추천 & 제안', desc: '적합한 상대를 찾고 제안을 보내거나 처리합니다.' },
  { key: 'appointment', label: '약속 진행', desc: '체크인, 리뷰, 문제 신고/no-show 처리를 진행합니다.' },
  { key: 'admin', label: '관리자 모더레이션', desc: '열린 신고를 검토하고 제재로 처리합니다.' },
]

type Status = { type: 'idle' | 'success' | 'error'; message: string }
type Me = User & { interests: { name: string }[]; availability: { id: string; weekday: number; startTime: string; endTime: string; area: string }[] }

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function App() {
  const [activeStep, setActiveStep] = useState<string>(steps[0].key)
  const [completed, setCompleted] = useState<Set<string>>(new Set())

  const [userId, setUserId] = useState('')
  const [adminKey, setAdminKey] = useState('dev-admin-key')

  const [me, setMe] = useState<Me | null>(null)
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([])
  const [proposals, setProposals] = useState<MatchProposal[]>([])
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [reports, setReports] = useState<Report[]>([])

  const [proposalId, setProposalId] = useState('')
  const [appointmentId, setAppointmentId] = useState('')
  const [targetUserId, setTargetUserId] = useState('')

  const [status, setStatus] = useState<Status>({ type: 'idle', message: '☕ CoffeeChat에 오신 것을 환영해요. 온보딩부터 천천히 시작해보세요.' })
  const [loading, setLoading] = useState(false)

  const [interestInput, setInterestInput] = useState('coffee, startup, design')
  const [checkinCode, setCheckinCode] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('coffeechat.frontend.state')
    if (!saved) return
    try {
      const st = JSON.parse(saved)
      if (st.userId) setUserId(st.userId)
      if (st.adminKey) setAdminKey(st.adminKey)
      if (st.activeStep) setActiveStep(st.activeStep)
      if (st.proposalId) setProposalId(st.proposalId)
      if (st.appointmentId) setAppointmentId(st.appointmentId)
      if (st.targetUserId) setTargetUserId(st.targetUserId)
      if (st.checkinCode) setCheckinCode(st.checkinCode)
      if (st.interestInput) setInterestInput(st.interestInput)
    } catch {
      setStatus({ type: 'error', message: '로컬 임시 저장값을 읽지 못했습니다. 다시 입력해 주세요.' })
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      'coffeechat.frontend.state',
      JSON.stringify({ userId, adminKey, activeStep, proposalId, appointmentId, targetUserId, checkinCode, interestInput }),
    )
  }, [userId, adminKey, activeStep, proposalId, appointmentId, targetUserId, checkinCode, interestInput])

  const nextStep = useMemo(() => {
    const index = steps.findIndex((step) => step.key === activeStep)
    return index < steps.length - 1 ? steps[index + 1].key : steps[index].key
  }, [activeStep])

  const run = async (label: string, fn: () => Promise<void>) => {
    setLoading(true)
    setStatus({ type: 'idle', message: `${label}...` })
    try {
      await fn()
      setStatus({ type: 'success', message: `${label} 완료.` })
    } catch (error) {
      setStatus({ type: 'error', message: getApiErrorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  const markDone = (stepKey: string) => {
    setCompleted((prev) => new Set(prev).add(stepKey))
  }

  const onboardingReady = Boolean(userId)
  const profileReady = Boolean(me && me.interests.length > 0 && me.availability.length > 0)
  const matchingReady = Boolean(proposals.find((p) => p.status === 'ACCEPTED') || appointmentId)

  const onAuthSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const provider = fd.get('provider') as OAuthProvider
    const email = String(fd.get('email')).trim()
    const nickname = String(fd.get('nickname')).trim()

    if (!emailRegex.test(email)) {
      setStatus({ type: 'error', message: '이메일 형식이 올바르지 않습니다.' })
      return
    }
    if (nickname.length < 2) {
      setStatus({ type: 'error', message: '닉네임은 2자 이상 입력해 주세요.' })
      return
    }

    await run('사용자 인증 중', async () => {
      const authRes = await api.auth(provider, email, nickname)
      setUserId(authRes.user.id)
      const verifyRes = await api.verifyPhone(authRes.user.id)
      setMe({ ...verifyRes.user, interests: [], availability: [] })
      markDone('onboarding')
      setActiveStep('profile')
    })
  }

  const loadMe = async () => {
    await run('프로필 불러오는 중', async () => {
      const res = await api.me(userId)
      setMe(res)
      if (res.interests.length > 0 && res.availability.length > 0) {
        markDone('profile')
      }
    })
  }

  const saveProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    await run('프로필/관심사 저장 중', async () => {
      await api.updateProfile({
        userId,
        nickname: String(fd.get('nickname')).trim(),
        bio: String(fd.get('bio')).trim(),
        region: String(fd.get('region')).trim().toLowerCase(),
      })

      const interests = interestInput
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
      if (interests.length > 0) {
        await api.updateInterests({ userId, interests })
      }

      const updated = await api.me(userId)
      setMe(updated)
      markDone('profile')
      setActiveStep('matching')
    })
  }

  const addSlot = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const startTime = String(fd.get('startTime'))
    const endTime = String(fd.get('endTime'))

    if (startTime >= endTime) {
      setStatus({ type: 'error', message: '종료 시간은 시작 시간보다 늦어야 합니다.' })
      return
    }

    await run('가능 시간 추가 중', async () => {
      await api.addAvailability({
        userId,
        weekday: Number(fd.get('weekday')),
        startTime,
        endTime,
        area: String(fd.get('area')).trim(),
      })
      const updated = await api.me(userId)
      setMe(updated)
    })
  }

  const loadSuggestions = async () => {
    await run('매칭 추천 불러오는 중', async () => {
      const res = await api.suggestions(userId)
      setSuggestions(res)
      markDone('matching')
    })
  }

  const createProposal = async (partnerId: string) => {
    await run('제안 생성 중', async () => {
      const proposal = await api.createProposal({ proposerId: userId, partnerId, message: '이번 주 커피챗 하실래요?' })
      setProposalId(proposal.id)
      const myProposals = await api.proposals(userId)
      setProposals(myProposals)
    })
  }

  const refreshProposals = async () => {
    await run('제안 목록 새로고침 중', async () => {
      const res = await api.proposals(userId)
      setProposals(res)
    })
  }

  const acceptProposal = async (id: string) => {
    await run('제안 수락 중', async () => {
      const res = await api.acceptProposal(id, {
        accepterId: userId,
        place: '강남 카페 레이어드',
        startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      setAppointment(res.appointment)
      setAppointmentId(res.appointment.id)
      setCheckinCode(res.appointment.checkinCode)
      markDone('matching')
      setActiveStep('appointment')
      await refreshProposals()
    })
  }

  const rejectProposal = async (id: string) => {
    await run('제안 거절 중', async () => {
      await api.rejectProposal(id, userId)
      await refreshProposals()
    })
  }

  const loadAppointment = async () => {
    await run('약속 정보 불러오는 중', async () => {
      const appt = await api.appointment(appointmentId)
      setAppointment(appt)
      setCheckinCode(appt.checkinCode)
    })
  }

  const submitCheckin = async () => {
    if (checkinCode.length < 4) {
      setStatus({ type: 'error', message: '체크인 코드는 4자리 이상 입력해 주세요.' })
      return
    }
    await run('체크인 처리 중', async () => {
      await api.checkin(appointmentId, { userId, code: checkinCode })
      const appt = await api.appointment(appointmentId)
      setAppointment(appt)
      if (appt.status === 'COMPLETED') {
        markDone('appointment')
      }
    })
  }

  const submitReview = async () => {
    await run('리뷰 등록 중', async () => {
      await api.review(appointmentId, {
        reviewerId: userId,
        revieweeId: targetUserId,
        comment: '대화가 좋았고 분위기도 편했습니다.',
        scoreDelta: 2,
      })
      markDone('appointment')
    })
  }

  const submitNoShow = async () => {
    await run('노쇼 신고 중', async () => {
      await api.noShow(appointmentId, { reporterId: userId, targetUserId, reason: '20분 이상 미도착' })
      const appt = await api.appointment(appointmentId)
      setAppointment(appt)
      markDone('appointment')
    })
  }

  const submitReport = async () => {
    await run('사건 신고 등록 중', async () => {
      await api.report(appointmentId, {
        reporterId: userId,
        targetUserId,
        reason: '미팅 중 부적절한 커뮤니케이션',
        evidence: '사용자 기록 대화 요약',
      })
    })
  }

  const loadOpenReports = async () => {
    await run('열린 신고 불러오는 중', async () => {
      const res = await api.adminReports(adminKey)
      setReports(res)
      markDone('admin')
    })
  }

  const resolveReport = async (reportId: string) => {
    await run('신고 처리 중', async () => {
      await api.adminResolveReport(adminKey, reportId, { sanction: 'WARNING', trustDelta: -5 })
      const updated = await api.adminReports(adminKey)
      setReports(updated)
      markDone('admin')
    })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CoffeeChat Operator Console</p>
          <h1>따뜻한 커피챗 운영 여정</h1>
          <p>사용자 온보딩부터 신고 모더레이션까지, 실제 운영 흐름을 단계별로 점검합니다.</p>
        </div>
        <Badge tone="neutral">API: {import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'}</Badge>
      </header>

      <JourneyNav steps={steps} active={activeStep} completed={completed} onSelect={setActiveStep} />

      <div className="global-controls card-lite">
        <InputField label="현재 사용자 ID" hint="온보딩 이후 자동 입력됩니다.">
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="인증 후 발급된 사용자 ID" />
        </InputField>
        <InputField label="관리자 API 키" hint="기본값: dev-admin-key">
          <input value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="x-admin-api-key" />
        </InputField>
        <Button variant="secondary" onClick={() => setActiveStep(nextStep)}>
          다음 단계
        </Button>
      </div>

      <Notice type={status.type} message={status.message} />

      {activeStep === 'onboarding' ? (
        <Card title="온보딩 & 인증" subtitle="모의 OAuth 로그인 + 자동 휴대폰 인증">
          <form className="grid" onSubmit={onAuthSubmit}>
            <InputField label="제공자">
              <select name="provider" defaultValue="google">
                {providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </InputField>
            <InputField label="이메일" hint="example@coffeechat.com 형식으로 입력">
              <input name="email" placeholder="you@example.com" required />
            </InputField>
            <InputField label="닉네임" hint="2자 이상 권장">
              <input name="nickname" placeholder="CoffeeFriend" required minLength={2} />
            </InputField>
            <Button type="submit" disabled={loading}>
              여정 시작
            </Button>
          </form>
          {loading ? <Skeleton lines={3} /> : null}
        </Card>
      ) : null}

      {activeStep === 'profile' ? (
        <div className="stack">
          {!onboardingReady ? (
            <EmptyState title="먼저 온보딩이 필요합니다" message="사용자 ID가 없으면 프로필을 저장할 수 없습니다. 1단계에서 인증을 먼저 진행해 주세요." />
          ) : null}

          <Card title="프로필 & 관심사" subtitle="기본 정보와 관심 대화 주제를 입력하세요.">
            <form className="grid" onSubmit={saveProfile}>
              <InputField label="닉네임">
                <input name="nickname" defaultValue={me?.nickname ?? '커피친구'} required minLength={2} />
              </InputField>
              <InputField label="소개" hint="상대가 대화 주제를 고를 수 있게 짧게 써보세요.">
                <input name="bio" defaultValue={me?.bio ?? ''} placeholder="에스프레소를 좋아하는 프로덕트 디자이너" />
              </InputField>
              <InputField label="지역" hint="추천 정확도를 위해 영문 소문자 권장 (예: seoul)">
                <input name="region" defaultValue={me?.region ?? ''} placeholder="seoul" />
              </InputField>
              <InputField label="관심사(콤마로 구분)">
                <input value={interestInput} onChange={(e) => setInterestInput(e.target.value)} />
              </InputField>
              <div className="row">
                <Button type="submit" disabled={loading || !userId}>
                  프로필 저장
                </Button>
                <Button variant="ghost" onClick={loadMe} disabled={loading || !userId}>
                  내 정보 새로고침
                </Button>
              </div>
            </form>
          </Card>

          <Card title="가능 시간" subtitle="주간 가능 시간을 추가하면 매칭 품질이 좋아집니다.">
            <form className="grid grid-inline" onSubmit={addSlot}>
              <InputField label="요일 (0=일요일)">
                <input name="weekday" type="number" min={0} max={6} defaultValue={2} required />
              </InputField>
              <InputField label="시작">
                <input name="startTime" type="time" defaultValue="10:00" required />
              </InputField>
              <InputField label="종료">
                <input name="endTime" type="time" defaultValue="11:30" required />
              </InputField>
              <InputField label="활동 지역">
                <input name="area" defaultValue="Gangnam" required />
              </InputField>
              <Button type="submit" disabled={loading || !userId}>
                시간대 추가
              </Button>
            </form>
            <div className="chips">
              {(me?.availability ?? []).map((slot) => (
                <Badge key={slot.id}>D{slot.weekday} · {slot.startTime}-{slot.endTime} · {slot.area}</Badge>
              ))}
              {(me?.availability ?? []).length === 0 ? <p className="empty">등록된 가능 시간이 없습니다. 최소 1개를 추가하세요.</p> : null}
            </div>
            {profileReady ? <p className="hint-success">프로필 준비 완료! 다음 단계에서 추천을 받아보세요.</p> : null}
          </Card>
        </div>
      ) : null}

      {activeStep === 'matching' ? (
        <div className="stack">
          {!profileReady ? (
            <EmptyState title="프로필 정보가 부족합니다" message="관심사와 가능 시간을 1개 이상 입력하면 추천 정확도가 크게 올라갑니다." />
          ) : null}

          <Card title="맞춤 추천" subtitle="관심사/지역/시간 겹침 점수로 추천됩니다.">
            <div className="row">
              <Button onClick={loadSuggestions} disabled={loading || !userId}>
                추천 불러오기
              </Button>
              <Button variant="ghost" onClick={refreshProposals} disabled={loading || !userId}>
                내 제안 새로고침
              </Button>
            </div>
            {loading ? <Skeleton lines={4} /> : null}
            <div className="list">
              {suggestions.map((s) => (
                <article className="item" key={s.user.id}>
                  <div>
                    <strong>{s.user.nickname}</strong>
                    <p>{s.user.bio || '소개가 아직 없습니다.'}</p>
                    <small>점수 {s.score} · 공통 관심사 {s.breakdown.overlapInterests} · 시간 겹침 {s.breakdown.availabilityOverlapMinutes}분</small>
                  </div>
                  <Button onClick={() => createProposal(s.user.id)} disabled={loading}>
                    제안 보내기
                  </Button>
                </article>
              ))}
              {suggestions.length === 0 && !loading ? <EmptyState title="추천이 아직 없습니다" message="프로필 저장 후 '추천 불러오기'를 누르면 후보가 표시됩니다." /> : null}
            </div>
          </Card>

          <Card title="제안함" subtitle="대기 제안을 수락/거절합니다. 수락하면 약속이 생성됩니다.">
            <InputField label="수동 제안 ID" hint="디버깅/운영 점검용">
              <input value={proposalId} onChange={(e) => setProposalId(e.target.value)} placeholder="제안 ID" />
            </InputField>
            <div className="list">
              {proposals.map((p) => (
                <article className="item" key={p.id}>
                  <div>
                    <strong>{p.id.slice(0, 8)}...</strong>
                    <p>
                      {p.proposerId} → {p.partnerId}
                    </p>
                    <Badge tone={p.status === 'PENDING' ? 'warn' : 'neutral'}>{p.status}</Badge>
                  </div>
                  {p.status === 'PENDING' ? (
                    <div className="row">
                      <Button onClick={() => acceptProposal(p.id)} disabled={loading}>
                        수락
                      </Button>
                      <Button variant="danger" onClick={() => rejectProposal(p.id)} disabled={loading}>
                        거절
                      </Button>
                    </div>
                  ) : null}
                </article>
              ))}
              {proposals.length === 0 ? <p className="empty">아직 제안 내역이 없습니다.</p> : null}
            </div>
            {matchingReady ? <p className="hint-success">약속 단계로 진행할 준비가 되었습니다.</p> : null}
          </Card>
        </div>
      ) : null}

      {activeStep === 'appointment' ? (
        <div className="stack">
          <Card title="약속 진행" subtitle="체크인/리뷰/no-show/신고를 처리합니다.">
            <div className="grid grid-inline">
              <InputField label="약속 ID" hint="제안 수락 시 자동 입력">
                <input value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} placeholder="약속 ID" />
              </InputField>
              <InputField label="상대 사용자 ID" hint="리뷰/신고 시 필수">
                <input value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} placeholder="상대 참가자 ID" />
              </InputField>
              <InputField label="체크인 코드" hint="약속 상세 조회 시 자동 채움">
                <input value={checkinCode} onChange={(e) => setCheckinCode(e.target.value)} placeholder="4자리 코드" />
              </InputField>
            </div>
            <div className="row wrap">
              <Button onClick={loadAppointment} disabled={loading || !appointmentId}>
                약속 불러오기
              </Button>
              <Button onClick={submitCheckin} disabled={loading || !appointmentId || !checkinCode}>
                체크인
              </Button>
              <Button variant="secondary" onClick={submitReview} disabled={loading || !appointmentId || !targetUserId}>
                리뷰 등록
              </Button>
              <Button variant="danger" onClick={submitNoShow} disabled={loading || !appointmentId || !targetUserId}>
                노쇼 신고
              </Button>
              <Button variant="ghost" onClick={submitReport} disabled={loading || !appointmentId || !targetUserId}>
                문제 신고
              </Button>
            </div>
            {appointment ? (
              <div className="appointment-box">
                <p>
                  <strong>{appointment.place}</strong> · {new Date(appointment.startsAt).toLocaleString()}
                </p>
                <p>
                  상태: <Badge tone={appointment.status === 'COMPLETED' ? 'good' : appointment.status === 'NO_SHOW' ? 'bad' : 'warn'}>{appointment.status}</Badge>
                </p>
              </div>
            ) : (
              <EmptyState title="불러온 약속이 없습니다" message="제안 수락 후 생성된 약속 ID로 상세를 불러오세요." />
            )}
          </Card>
        </div>
      ) : null}

      {activeStep === 'admin' ? (
        <Card title="관리자 모더레이션" subtitle="보안 키로 열린 사용자 신고를 처리합니다.">
          <div className="row">
            <Button onClick={loadOpenReports} disabled={loading || !adminKey}>
              열린 신고 불러오기
            </Button>
          </div>
          {loading ? <Skeleton lines={4} /> : null}
          <div className="list">
            {reports.map((report) => (
              <article className="item" key={report.id}>
                <div>
                  <strong>{report.reason}</strong>
                  <p>신고 #{report.id.slice(0, 8)} · 대상 {report.targetUserId.slice(0, 8)}...</p>
                  <Badge tone="warn">{report.status}</Badge>
                </div>
                <Button variant="secondary" onClick={() => resolveReport(report.id)} disabled={loading}>
                  처리(경고)
                </Button>
              </article>
            ))}
            {reports.length === 0 && !loading ? <EmptyState title="현재 열린 신고가 없습니다" message="새 신고 발생 시 목록에 표시됩니다." /> : null}
          </div>
        </Card>
      ) : null}
    </div>
  )
}

export default App
