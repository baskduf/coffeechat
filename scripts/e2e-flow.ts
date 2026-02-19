import { execSync, spawn } from 'node:child_process'

const API = 'http://127.0.0.1:4000'
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'dev-admin-key'

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function post(path: string, body: unknown) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${path} failed: ${r.status} ${await r.text()}`)
  return r.json()
}

async function main() {
  execSync('npx prisma db push --force-reset --accept-data-loss', { stdio: 'inherit' })

  const server = spawn('node', ['dist/server.js'], {
    stdio: 'inherit',
    env: { ...process.env, ADMIN_API_KEY },
  })

  try {
    await wait(1000)

    const a = await post('/auth/google', { email: `alice.flow-${Date.now()}@dev.com`, nickname: 'aliceFlow' })
    const b = await post('/auth/kakao', { email: `bob.flow-${Date.now()}@dev.com`, nickname: 'bobFlow' })

    const proposal = await post('/matches/proposals', { proposerId: a.user.id, partnerId: b.user.id, message: 'coffee?' })
    const accepted = await post(`/matches/${proposal.id}/accept`, {
      place: 'Gangnam Station',
      startsAt: new Date(Date.now() + 3600_000).toISOString(),
      accepterId: b.user.id,
    })

    await post(`/appointments/${accepted.appointment.id}/checkin-code`, {
      userId: a.user.id,
      code: accepted.appointment.checkinCode,
    })
    await post(`/appointments/${accepted.appointment.id}/checkin-code`, {
      userId: b.user.id,
      code: accepted.appointment.checkinCode,
    })

    await post(`/appointments/${accepted.appointment.id}/review`, {
      reviewerId: a.user.id,
      revieweeId: b.user.id,
      comment: 'good chat',
      scoreDelta: 2,
    })

    console.log('E2E flow ok:', accepted.appointment.id)
  } finally {
    server.kill('SIGTERM')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
