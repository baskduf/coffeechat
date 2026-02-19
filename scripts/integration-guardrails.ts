import { execSync, spawn } from 'node:child_process'

const API = 'http://127.0.0.1:4000'
const ADMIN_API_KEY = 'dev-admin-key'

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function req(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, headers?: Record<string, string>) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: r.status, json }
}

const get = (path: string, headers?: Record<string, string>) => req('GET', path, undefined, headers)
const post = (path: string, body: unknown, headers?: Record<string, string>) => req('POST', path, body, headers)
const put = (path: string, body: unknown, headers?: Record<string, string>) => req('PUT', path, body, headers)

function assertStatus(actual: number, expected: number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function assertErrorCode(response: { json: any }, expectedCode: string, label: string) {
  const code = response.json?.error?.code
  if (code !== expectedCode) {
    throw new Error(`${label}: expected error code ${expectedCode}, got ${code}`)
  }
}

async function createAcceptedAppointment(emailPrefixA: string, emailPrefixB: string) {
  const a = await post('/auth/google', { email: `${emailPrefixA}-${Date.now()}@dev.com`, nickname: emailPrefixA })
  const b = await post('/auth/kakao', { email: `${emailPrefixB}-${Date.now()}@dev.com`, nickname: emailPrefixB })
  assertStatus(a.status, 200, 'create user A')
  assertStatus(b.status, 200, 'create user B')

  const proposal = await post('/matches/proposals', {
    proposerId: a.json.user.id,
    partnerId: b.json.user.id,
    message: 'coffee?',
  })
  assertStatus(proposal.status, 200, 'create proposal')

  const accepted = await post(`/matches/${proposal.json.id}/accept`, {
    place: 'Gangnam',
    startsAt: new Date(Date.now() + 3600_000).toISOString(),
    accepterId: b.json.user.id,
  })
  assertStatus(accepted.status, 200, 'accept proposal by partner')

  return { a: a.json.user, b: b.json.user, proposal: proposal.json, appointment: accepted.json.appointment }
}

async function main() {
  execSync('npx prisma db push --force-reset --accept-data-loss', { stdio: 'inherit' })

  const server = spawn('node', ['dist/server.js'], {
    stdio: 'inherit',
    env: { ...process.env, ADMIN_API_KEY },
  })

  try {
    await wait(1000)

    // Baseline guardrail checks + standardized error codes
    const pendingA = await post('/auth/google', { email: `guardA-${Date.now()}@dev.com`, nickname: 'guardA' })
    const pendingB = await post('/auth/kakao', { email: `guardB-${Date.now()}@dev.com`, nickname: 'guardB' })
    assertStatus(pendingA.status, 200, 'create pending user A')
    assertStatus(pendingB.status, 200, 'create pending user B')

    const pendingProposal = await post('/matches/proposals', {
      proposerId: pendingA.json.user.id,
      partnerId: pendingB.json.user.id,
      message: 'coffee?',
    })
    assertStatus(pendingProposal.status, 200, 'create pending proposal')

    const base = await createAcceptedAppointment('baseA', 'baseB')
    const outsider = await post('/auth/apple', { email: `guardC-${Date.now()}@dev.com`, nickname: 'guardC' })
    assertStatus(outsider.status, 200, 'create user C')

    const duplicate = await post('/matches/proposals', {
      proposerId: pendingB.json.user.id,
      partnerId: pendingA.json.user.id,
      message: 'reverse duplicate',
    })
    assertStatus(duplicate.status, 409, 'reject duplicate pending proposal')
    assertErrorCode(duplicate, 'CONFLICT', 'duplicate error code')

    const badAccept = await post(`/matches/${pendingProposal.json.id}/accept`, {
      place: 'Gangnam',
      startsAt: new Date(Date.now() + 3600_000).toISOString(),
      accepterId: outsider.json.user.id,
    })
    assertStatus(badAccept.status, 403, 'block non-partner acceptance')
    assertErrorCode(badAccept, 'FORBIDDEN', 'accept authorization code')

    const outsiderCheckin = await post(`/appointments/${base.appointment.id}/checkin-code`, {
      userId: outsider.json.user.id,
      code: base.appointment.checkinCode,
    })
    assertStatus(outsiderCheckin.status, 403, 'block outsider check-in')

    const earlyReview = await post(`/appointments/${base.appointment.id}/review`, {
      reviewerId: base.a.id,
      revieweeId: base.b.id,
      comment: 'too early',
      scoreDelta: 1,
    })
    assertStatus(earlyReview.status, 409, 'block review before completion')

    const selfNoShow = await post(`/appointments/${base.appointment.id}/no-show`, {
      reporterId: base.a.id,
      targetUserId: base.a.id,
      reason: 'self-test',
    })
    assertStatus(selfNoShow.status, 400, 'block self no-show report')

    const outsiderReport = await post(`/appointments/${base.appointment.id}/report`, {
      reporterId: outsider.json.user.id,
      targetUserId: base.a.id,
      reason: 'outsider report',
    })
    assertStatus(outsiderReport.status, 403, 'block outsider report')

    // Admin key guard checks
    const adminUnauthorized = await get('/admin/reports')
    assertStatus(adminUnauthorized.status, 401, 'admin route requires key')
    assertErrorCode(adminUnauthorized, 'UNAUTHORIZED', 'admin unauthorized code')

    const adminOk = await get('/admin/reports', { 'x-admin-api-key': ADMIN_API_KEY })
    assertStatus(adminOk.status, 200, 'admin route accepts valid key')

    // Matching quality: overlap-heavy profile should rank above weak overlap profile
    const matcher = await post('/auth/google', { email: `matcher-${Date.now()}@dev.com`, nickname: 'matcher' })
    assertStatus(matcher.status, 200, 'create matcher user')
    await put('/me/profile', { userId: matcher.json.user.id, nickname: 'matcher', region: 'seoul' })
    await put('/me/interests', { userId: matcher.json.user.id, interests: ['coffee', 'startup', 'ai'] })
    await post('/me/availability', { userId: matcher.json.user.id, weekday: 2, startTime: '09:00', endTime: '12:00', area: 'gangnam' })

    const strong = await post('/auth/kakao', { email: `strong-${Date.now()}@dev.com`, nickname: 'strong' })
    await put('/me/profile', { userId: strong.json.user.id, nickname: 'strong', region: 'seoul' })
    await put('/me/interests', { userId: strong.json.user.id, interests: ['coffee', 'startup'] })
    await post('/me/availability', { userId: strong.json.user.id, weekday: 2, startTime: '10:00', endTime: '13:00', area: 'gangnam' })

    const weak = await post('/auth/apple', { email: `weak-${Date.now()}@dev.com`, nickname: 'weak' })
    await put('/me/profile', { userId: weak.json.user.id, nickname: 'weak', region: 'busan' })
    await put('/me/interests', { userId: weak.json.user.id, interests: ['music'] })
    await post('/me/availability', { userId: weak.json.user.id, weekday: 4, startTime: '18:00', endTime: '19:00', area: 'haeundae' })

    const restricted = await post('/auth/google', { email: `restricted-${Date.now()}@dev.com`, nickname: 'restricted' })
    await put('/me/profile', { userId: restricted.json.user.id, nickname: 'restricted', region: 'seoul' })
    await put('/me/interests', { userId: restricted.json.user.id, interests: ['coffee', 'startup', 'ai'] })
    await post('/me/availability', { userId: restricted.json.user.id, weekday: 2, startTime: '09:30', endTime: '11:00', area: 'gangnam' })
    const restrictByAdmin = await post(
      `/admin/users/${restricted.json.user.id}/sanction`,
      { level: 'SUSPEND_7D', reason: 'matching-visibility-test' },
      { 'x-admin-api-key': ADMIN_API_KEY },
    )
    assertStatus(restrictByAdmin.status, 200, 'admin can suspend restricted candidate')

    const suggestions = await get(`/matches/suggestions/${matcher.json.user.id}`)
    assertStatus(suggestions.status, 200, 'fetch suggestions')
    if (!Array.isArray(suggestions.json) || suggestions.json.length < 2) {
      throw new Error('expected at least two suggestions for ranking test')
    }
    const strongEntry = suggestions.json.find((entry: any) => entry.user.id === strong.json.user.id)
    const weakEntry = suggestions.json.find((entry: any) => entry.user.id === weak.json.user.id)
    const restrictedEntry = suggestions.json.find((entry: any) => entry.user.id === restricted.json.user.id)
    if (!strongEntry || !weakEntry) throw new Error('expected both strong and weak candidates in suggestions')
    if (strongEntry.score <= weakEntry.score) throw new Error('strong candidate should outrank weak candidate')
    if (restrictedEntry) throw new Error('restricted candidate should not appear in suggestions')

    // No-show escalation: 1st -> 7d, 2nd -> 30d, 3rd -> BAN
    const strikeTarget = await post('/auth/google', { email: `strike-target-${Date.now()}@dev.com`, nickname: 'strikeTarget' })
    const strikeReporter1 = await post('/auth/kakao', { email: `strike-r1-${Date.now()}@dev.com`, nickname: 'strikeR1' })
    const strikeReporter2 = await post('/auth/apple', { email: `strike-r2-${Date.now()}@dev.com`, nickname: 'strikeR2' })
    const strikeReporter3 = await post('/auth/google', { email: `strike-r3-${Date.now()}@dev.com`, nickname: 'strikeR3' })
    assertStatus(strikeTarget.status, 200, 'create strike target user')
    assertStatus(strikeReporter1.status, 200, 'create strike reporter1')
    assertStatus(strikeReporter2.status, 200, 'create strike reporter2')
    assertStatus(strikeReporter3.status, 200, 'create strike reporter3')

    async function createPreAccepted(targetId: string, partnerId: string) {
      const proposal = await post('/matches/proposals', { proposerId: targetId, partnerId, message: 'pre-accepted strike appointment' })
      assertStatus(proposal.status, 200, 'create strike proposal')
      const accepted = await post(`/matches/${proposal.json.id}/accept`, {
        place: 'Gangnam',
        startsAt: new Date(Date.now() + 7200_000).toISOString(),
        accepterId: partnerId,
      })
      assertStatus(accepted.status, 200, 'accept strike proposal')
      return accepted.json.appointment.id
    }

    const strikeAppt1 = await createPreAccepted(strikeTarget.json.user.id, strikeReporter1.json.user.id)
    const strikeAppt2 = await createPreAccepted(strikeTarget.json.user.id, strikeReporter2.json.user.id)
    const strikeAppt3 = await createPreAccepted(strikeTarget.json.user.id, strikeReporter3.json.user.id)

    const s1 = await post(`/appointments/${strikeAppt1}/no-show`, {
      reporterId: strikeReporter1.json.user.id,
      targetUserId: strikeTarget.json.user.id,
      reason: 'first-strike',
    })
    assertStatus(s1.status, 200, 'first no-show strike')
    if (s1.json.sanction.level !== 'SUSPEND_7D') throw new Error('expected first strike to be SUSPEND_7D')

    const s2 = await post(`/appointments/${strikeAppt2}/no-show`, {
      reporterId: strikeReporter2.json.user.id,
      targetUserId: strikeTarget.json.user.id,
      reason: 'second-strike',
    })
    assertStatus(s2.status, 200, 'second no-show strike')
    if (s2.json.sanction.level !== 'SUSPEND_30D') throw new Error('expected second strike to be SUSPEND_30D')

    const s3 = await post(`/appointments/${strikeAppt3}/no-show`, {
      reporterId: strikeReporter3.json.user.id,
      targetUserId: strikeTarget.json.user.id,
      reason: 'third-strike',
    })
    assertStatus(s3.status, 200, 'third no-show strike')
    if (s3.json.sanction.level !== 'BAN') throw new Error('expected third strike to be BAN')

    const bannedProposal = await post('/matches/proposals', {
      proposerId: strikeTarget.json.user.id,
      partnerId: strikeReporter1.json.user.id,
      message: 'should fail due to BAN',
    })
    assertStatus(bannedProposal.status, 403, 'blocked user cannot create proposal')
    assertErrorCode(bannedProposal, 'USER_RESTRICTED', 'banned proposal restriction code')

    // No-show exception path: restricted reporter can still file no-show on existing appointment
    const exceptionCase = await createAcceptedAppointment('exceptionA', 'exceptionB')
    const sanctionReporter = await post(
      `/admin/users/${exceptionCase.a.id}/sanction`,
      { level: 'SUSPEND_7D', reason: 'temporary restriction for exception test' },
      { 'x-admin-api-key': ADMIN_API_KEY },
    )
    assertStatus(sanctionReporter.status, 200, 'admin sanctions reporter')

    const noShowByRestrictedReporter = await post(`/appointments/${exceptionCase.appointment.id}/no-show`, {
      reporterId: exceptionCase.a.id,
      targetUserId: exceptionCase.b.id,
      reason: 'exception-path',
    })
    assertStatus(noShowByRestrictedReporter.status, 200, 'restricted reporter can still submit no-show')

    // Admin resolve flow: resolve open report + conflict on second resolve
    const resolveCase = await createAcceptedAppointment('resolveA', 'resolveB')
    const report = await post(`/appointments/${resolveCase.appointment.id}/report`, {
      reporterId: resolveCase.a.id,
      targetUserId: resolveCase.b.id,
      reason: 'rude behavior',
      evidence: 'chat log',
    })
    assertStatus(report.status, 200, 'create report')

    const resolve = await post(
      `/admin/reports/${report.json.id}/resolve`,
      { sanction: 'BAN', trustDelta: -12 },
      { 'x-admin-api-key': ADMIN_API_KEY },
    )
    assertStatus(resolve.status, 200, 'resolve report with ban')

    const targetAfterResolve = await get(`/me/${resolveCase.b.id}`)
    assertStatus(targetAfterResolve.status, 200, 'read resolved target')
    if (!targetAfterResolve.json.blocked) throw new Error('target user should be blocked after BAN resolution')

    const resolveAgain = await post(
      `/admin/reports/${report.json.id}/resolve`,
      { sanction: 'WARNING', trustDelta: -1 },
      { 'x-admin-api-key': ADMIN_API_KEY },
    )
    assertStatus(resolveAgain.status, 409, 'cannot resolve same report twice')
    assertErrorCode(resolveAgain, 'CONFLICT', 'double resolve conflict code')

    console.log('Integration guardrails test ok')
  } finally {
    server.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
