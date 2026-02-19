import { spawn } from 'node:child_process'

const API = 'http://127.0.0.1:4000'

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function post(path: string, body: unknown) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

function assertStatus(actual: number, expected: number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

async function main() {
  const server = spawn('node', ['dist/server.js'], { stdio: 'inherit' })

  try {
    await wait(1000)

    const a = await post('/auth/google', { email: `guard-a-${Date.now()}@dev.com`, nickname: 'guardA' })
    const b = await post('/auth/kakao', { email: `guard-b-${Date.now()}@dev.com`, nickname: 'guardB' })
    const c = await post('/auth/apple', { email: `guard-c-${Date.now()}@dev.com`, nickname: 'guardC' })
    assertStatus(a.status, 200, 'create user A')
    assertStatus(b.status, 200, 'create user B')
    assertStatus(c.status, 200, 'create user C')

    const proposal = await post('/matches/proposals', {
      proposerId: a.json.user.id,
      partnerId: b.json.user.id,
      message: 'coffee?',
    })
    assertStatus(proposal.status, 200, 'create proposal')

    const duplicate = await post('/matches/proposals', {
      proposerId: b.json.user.id,
      partnerId: a.json.user.id,
      message: 'reverse duplicate',
    })
    assertStatus(duplicate.status, 409, 'reject duplicate pending proposal')

    const badAccept = await post(`/matches/${proposal.json.id}/accept`, {
      place: 'Gangnam',
      startsAt: new Date(Date.now() + 3600_000).toISOString(),
      accepterId: c.json.user.id,
    })
    assertStatus(badAccept.status, 403, 'block non-partner acceptance')

    const accepted = await post(`/matches/${proposal.json.id}/accept`, {
      place: 'Gangnam',
      startsAt: new Date(Date.now() + 3600_000).toISOString(),
      accepterId: b.json.user.id,
    })
    assertStatus(accepted.status, 200, 'accept proposal by partner')

    const outsiderCheckin = await post(`/appointments/${accepted.json.appointment.id}/checkin-code`, {
      userId: c.json.user.id,
      code: accepted.json.appointment.checkinCode,
    })
    assertStatus(outsiderCheckin.status, 403, 'block outsider check-in')

    const earlyReview = await post(`/appointments/${accepted.json.appointment.id}/review`, {
      reviewerId: a.json.user.id,
      revieweeId: b.json.user.id,
      comment: 'too early',
      scoreDelta: 1,
    })
    assertStatus(earlyReview.status, 409, 'block review before completion')

    const selfNoShow = await post(`/appointments/${accepted.json.appointment.id}/no-show`, {
      reporterId: a.json.user.id,
      targetUserId: a.json.user.id,
      reason: 'self-test',
    })
    assertStatus(selfNoShow.status, 400, 'block self no-show report')

    const outsiderReport = await post(`/appointments/${accepted.json.appointment.id}/report`, {
      reporterId: c.json.user.id,
      targetUserId: a.json.user.id,
      reason: 'outsider report',
    })
    assertStatus(outsiderReport.status, 403, 'block outsider report')

    console.log('Integration guardrails test ok')
  } finally {
    server.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
