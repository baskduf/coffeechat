import express from 'express'
import cors from 'cors'
import { z } from 'zod'
import { prisma } from './prisma.js'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true }))

async function isUserRestricted(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.blocked) return true

  const now = new Date()
  const activeSanction = await prisma.sanction.findFirst({
    where: {
      userId,
      OR: [{ endAt: null }, { endAt: { gt: now } }],
      level: { in: ['SUSPEND_7D', 'SUSPEND_30D', 'BAN'] },
    },
    orderBy: { createdAt: 'desc' },
  })
  return Boolean(activeSanction)
}

// Auth (mock OAuth + phone verify)
app.post('/auth/:provider', async (req, res) => {
  const provider = req.params.provider
  const bodySchema = z.object({ email: z.string().email(), nickname: z.string().min(1) })
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json(parsed.error.flatten())

  const { email, nickname } = parsed.data
  const user = await prisma.user.upsert({
    where: { email },
    update: { nickname, provider },
    create: { email, nickname, provider },
  })
  res.json({ user })
})

app.post('/auth/phone/verify', async (req, res) => {
  const body = z.object({ userId: z.string() }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const user = await prisma.user.update({
    where: { id: body.data.userId },
    data: { phoneVerified: true },
  })
  res.json({ user })
})

// Profile
app.get('/me/:userId', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    include: { interests: true, availability: true },
  })
  if (!user) return res.status(404).json({ error: 'user not found' })
  res.json(user)
})

app.put('/me/profile', async (req, res) => {
  const body = z
    .object({ userId: z.string(), nickname: z.string().min(1), bio: z.string().optional(), region: z.string().optional() })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const { userId, nickname, bio, region } = body.data
  const user = await prisma.user.update({ where: { id: userId }, data: { nickname, bio, region } })
  res.json(user)
})

app.put('/me/interests', async (req, res) => {
  const body = z.object({ userId: z.string(), interests: z.array(z.string()).max(10) }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const { userId, interests } = body.data
  await prisma.userInterest.deleteMany({ where: { userId } })
  await prisma.userInterest.createMany({ data: interests.map((name) => ({ userId, name })) })
  const updated = await prisma.userInterest.findMany({ where: { userId } })
  res.json(updated)
})

// Availability
app.get('/me/:userId/availability', async (req, res) => {
  const slots = await prisma.availabilitySlot.findMany({ where: { userId: req.params.userId } })
  res.json(slots)
})

app.post('/me/availability', async (req, res) => {
  const body = z
    .object({ userId: z.string(), weekday: z.number().int().min(0).max(6), startTime: z.string(), endTime: z.string(), area: z.string() })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const slot = await prisma.availabilitySlot.create({ data: body.data })
  res.json(slot)
})

app.delete('/me/availability/:id', async (req, res) => {
  await prisma.availabilitySlot.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

// Matching
app.get('/matches/proposals/:userId', async (req, res) => {
  const userId = req.params.userId
  const proposals = await prisma.matchProposal.findMany({
    where: { OR: [{ proposerId: userId }, { partnerId: userId }] },
    orderBy: { createdAt: 'desc' },
  })
  res.json(proposals)
})

app.get('/matches/suggestions/:userId', async (req, res) => {
  const userId = req.params.userId
  const me = await prisma.user.findUnique({ where: { id: userId }, include: { interests: true } })
  if (!me) return res.status(404).json({ error: 'user not found' })

  const others = await prisma.user.findMany({
    where: { id: { not: userId }, blocked: false },
    include: { interests: true, availability: true },
    take: 30,
  })

  const myInterests = new Set(me.interests.map((i) => i.name.toLowerCase()))
  const ranked = others
    .map((u) => {
      const overlap = u.interests.filter((i) => myInterests.has(i.name.toLowerCase())).length
      return { user: u, score: overlap * 10 + u.trustScore }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  res.json(ranked)
})

app.post('/matches/proposals', async (req, res) => {
  const body = z
    .object({ proposerId: z.string(), partnerId: z.string(), message: z.string().optional() })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  if (await isUserRestricted(body.data.proposerId)) {
    return res.status(403).json({ error: 'proposer is restricted by sanction' })
  }

  const proposal = await prisma.matchProposal.create({ data: body.data })
  res.json(proposal)
})

app.post('/matches/:id/accept', async (req, res) => {
  const id = req.params.id
  const body = z.object({ place: z.string(), startsAt: z.string(), accepterId: z.string() }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  if (await isUserRestricted(body.data.accepterId)) {
    return res.status(403).json({ error: 'accepter is restricted by sanction' })
  }

  const proposalBefore = await prisma.matchProposal.findUnique({ where: { id } })
  if (!proposalBefore) return res.status(404).json({ error: 'proposal not found' })
  if (proposalBefore.partnerId !== body.data.accepterId) return res.status(403).json({ error: 'only partner can accept' })

  const proposal = await prisma.matchProposal.update({ where: { id }, data: { status: 'ACCEPTED' } })
  const appointment = await prisma.appointment.create({
    data: {
      proposalId: proposal.id,
      userAId: proposal.proposerId,
      userBId: proposal.partnerId,
      place: body.data.place,
      startsAt: new Date(body.data.startsAt),
      checkinCode: String(Math.floor(1000 + Math.random() * 9000)),
    },
  })
  res.json({ proposal, appointment })
})

app.post('/matches/:id/reject', async (req, res) => {
  const proposal = await prisma.matchProposal.update({ where: { id: req.params.id }, data: { status: 'REJECTED' } })
  res.json(proposal)
})

// Appointment & check-in
app.get('/appointments/:id', async (req, res) => {
  const appt = await prisma.appointment.findUnique({ where: { id: req.params.id }, include: { checks: true } })
  if (!appt) return res.status(404).json({ error: 'not found' })
  res.json(appt)
})

app.post('/appointments/:id/checkin-code', async (req, res) => {
  const body = z.object({ userId: z.string(), code: z.string().length(4) }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } })
  if (!appt) return res.status(404).json({ error: 'not found' })
  if (appt.checkinCode !== body.data.code) return res.status(400).json({ error: 'invalid code' })

  const check = await prisma.attendanceCheck.upsert({
    where: { appointmentId_userId: { appointmentId: appt.id, userId: body.data.userId } },
    update: { method: 'code' },
    create: { appointmentId: appt.id, userId: body.data.userId, method: 'code' },
  })

  const checks = await prisma.attendanceCheck.count({ where: { appointmentId: appt.id } })
  if (checks >= 2) {
    await prisma.appointment.update({ where: { id: appt.id }, data: { status: 'COMPLETED' } })
  }

  res.json(check)
})

app.post('/appointments/:id/no-show', async (req, res) => {
  const body = z.object({ userId: z.string(), reason: z.string().default('no-show') }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const appt = await prisma.appointment.update({ where: { id: req.params.id }, data: { status: 'NO_SHOW' } })

  const now = new Date()
  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const noShowCount = await prisma.sanction.count({
    where: {
      userId: body.data.userId,
      reason: { startsWith: 'no-show' },
      createdAt: { gte: from },
    },
  })

  const level = noShowCount === 0 ? 'SUSPEND_7D' : noShowCount === 1 ? 'SUSPEND_30D' : 'BAN'
  const endAt = level === 'SUSPEND_7D' ? new Date(now.getTime() + 7 * 86400000) : level === 'SUSPEND_30D' ? new Date(now.getTime() + 30 * 86400000) : null

  const sanction = await prisma.sanction.create({
    data: {
      userId: body.data.userId,
      level,
      reason: `no-show:${body.data.reason}:appointment=${appt.id}`,
      endAt,
    },
  })

  await prisma.user.update({ where: { id: body.data.userId }, data: { trustScore: { decrement: 10 } } })

  res.json({ appointment: appt, sanction, strikesIn90d: noShowCount + 1 })
})

app.post('/appointments/:id/review', async (req, res) => {
  const body = z
    .object({ reviewerId: z.string(), revieweeId: z.string(), comment: z.string().min(1), scoreDelta: z.number().int().min(-5).max(5).default(1) })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const review = await prisma.review.create({ data: { appointmentId: req.params.id, ...body.data } })
  await prisma.user.update({ where: { id: body.data.revieweeId }, data: { trustScore: { increment: body.data.scoreDelta } } })
  res.json(review)
})

app.post('/appointments/:id/report', async (req, res) => {
  const body = z
    .object({ reporterId: z.string(), targetUserId: z.string(), reason: z.string().min(1), evidence: z.string().optional() })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const report = await prisma.report.create({ data: { appointmentId: req.params.id, ...body.data } })
  res.json(report)
})

// Admin
app.get('/admin/reports', async (_req, res) => {
  const reports = await prisma.report.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' } })
  res.json(reports)
})

app.post('/admin/reports/:id/resolve', async (req, res) => {
  const body = z.object({ sanction: z.enum(['WARNING', 'SUSPEND_7D', 'SUSPEND_30D', 'BAN']).optional() }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const report = await prisma.report.update({ where: { id: req.params.id }, data: { status: 'RESOLVED' } })
  if (body.data.sanction) {
    const endAt = body.data.sanction === 'SUSPEND_7D' ? new Date(Date.now() + 7 * 86400000) : body.data.sanction === 'SUSPEND_30D' ? new Date(Date.now() + 30 * 86400000) : null
    await prisma.sanction.create({
      data: { userId: report.targetUserId, level: body.data.sanction, reason: `Report ${report.id} resolved`, endAt },
    })
  }
  res.json({ ok: true })
})

app.post('/admin/users/:id/sanction', async (req, res) => {
  const body = z.object({ level: z.enum(['WARNING', 'SUSPEND_7D', 'SUSPEND_30D', 'BAN']), reason: z.string() }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const endAt = body.data.level === 'SUSPEND_7D' ? new Date(Date.now() + 7 * 86400000) : body.data.level === 'SUSPEND_30D' ? new Date(Date.now() + 30 * 86400000) : null
  const sanction = await prisma.sanction.create({ data: { userId: req.params.id, level: body.data.level, reason: body.data.reason, endAt } })
  res.json(sanction)
})

const port = Number(process.env.PORT || 4000)
app.listen(port, () => {
  console.log(`CoffeeChat MVP API listening on ${port}`)
})
