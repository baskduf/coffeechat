import express from 'express'
import cors from 'cors'
import { z } from 'zod'
import { prisma } from './prisma.js'

const app = express()
app.use(cors())
app.use(express.json())

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

function isValidTimeRange(startTime: string, endTime: string) {
  return startTime < endTime
}

function isInAppointment(appt: { userAId: string; userBId: string }, userId: string) {
  return appt.userAId === userId || appt.userBId === userId
}

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

async function ensureUserExists(userId: string, res: express.Response) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    res.status(404).json({ error: `user not found: ${userId}` })
    return null
  }
  return user
}

// Auth (mock OAuth + phone verify)
app.post('/auth/:provider', async (req, res) => {
  const providerSchema = z.enum(['google', 'kakao', 'apple'])
  const providerParsed = providerSchema.safeParse(req.params.provider)
  if (!providerParsed.success) return res.status(400).json({ error: 'unsupported provider' })

  const bodySchema = z.object({ email: z.string().email(), nickname: z.string().trim().min(1).max(30) })
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json(parsed.error.flatten())

  const { email, nickname } = parsed.data
  const user = await prisma.user.upsert({
    where: { email },
    update: { nickname, provider: providerParsed.data },
    create: { email, nickname, provider: providerParsed.data },
  })
  res.json({ user })
})

app.post('/auth/phone/verify', async (req, res) => {
  const body = z.object({ userId: z.string() }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const existing = await ensureUserExists(body.data.userId, res)
  if (!existing) return

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
    .object({
      userId: z.string(),
      nickname: z.string().trim().min(1).max(30),
      bio: z.string().max(300).optional(),
      region: z.string().max(50).optional(),
    })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const { userId, nickname, bio, region } = body.data
  const existing = await ensureUserExists(userId, res)
  if (!existing) return

  const user = await prisma.user.update({ where: { id: userId }, data: { nickname, bio, region } })
  res.json(user)
})

app.put('/me/interests', async (req, res) => {
  const body = z.object({ userId: z.string(), interests: z.array(z.string().trim().min(1).max(30)).max(10) }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const { userId, interests } = body.data
  const existing = await ensureUserExists(userId, res)
  if (!existing) return

  const normalized = Array.from(new Set(interests.map((name) => name.toLowerCase())))
  await prisma.userInterest.deleteMany({ where: { userId } })
  await prisma.userInterest.createMany({ data: normalized.map((name) => ({ userId, name })) })
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
    .object({
      userId: z.string(),
      weekday: z.number().int().min(0).max(6),
      startTime: z.string().regex(timeRegex, 'Invalid time format. Use HH:MM'),
      endTime: z.string().regex(timeRegex, 'Invalid time format. Use HH:MM'),
      area: z.string().trim().min(1).max(80),
    })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  if (!isValidTimeRange(body.data.startTime, body.data.endTime)) {
    return res.status(400).json({ error: 'startTime must be earlier than endTime' })
  }

  const existing = await ensureUserExists(body.data.userId, res)
  if (!existing) return

  const overlapping = await prisma.availabilitySlot.findFirst({
    where: {
      userId: body.data.userId,
      weekday: body.data.weekday,
      startTime: { lt: body.data.endTime },
      endTime: { gt: body.data.startTime },
    },
  })
  if (overlapping) return res.status(409).json({ error: 'overlapping availability slot exists' })

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
    .object({ proposerId: z.string(), partnerId: z.string(), message: z.string().max(300).optional() })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  if (body.data.proposerId === body.data.partnerId) {
    return res.status(400).json({ error: 'cannot propose to self' })
  }

  const proposer = await ensureUserExists(body.data.proposerId, res)
  if (!proposer) return

  const partner = await ensureUserExists(body.data.partnerId, res)
  if (!partner) return

  if (await isUserRestricted(body.data.proposerId)) {
    return res.status(403).json({ error: 'proposer is restricted by sanction' })
  }
  if (await isUserRestricted(body.data.partnerId)) {
    return res.status(403).json({ error: 'partner is restricted by sanction' })
  }

  const duplicatePending = await prisma.matchProposal.findFirst({
    where: {
      status: 'PENDING',
      OR: [
        { proposerId: body.data.proposerId, partnerId: body.data.partnerId },
        { proposerId: body.data.partnerId, partnerId: body.data.proposerId },
      ],
    },
  })
  if (duplicatePending) return res.status(409).json({ error: 'pending proposal already exists between users' })

  const proposal = await prisma.matchProposal.create({ data: body.data })
  res.json(proposal)
})

app.post('/matches/:id/accept', async (req, res) => {
  const id = req.params.id
  const body = z.object({ place: z.string().trim().min(1).max(120), startsAt: z.string(), accepterId: z.string() }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const startsAt = new Date(body.data.startsAt)
  if (Number.isNaN(startsAt.getTime())) return res.status(400).json({ error: 'invalid startsAt datetime' })

  if (await isUserRestricted(body.data.accepterId)) {
    return res.status(403).json({ error: 'accepter is restricted by sanction' })
  }

  const proposalBefore = await prisma.matchProposal.findUnique({ where: { id } })
  if (!proposalBefore) return res.status(404).json({ error: 'proposal not found' })
  if (proposalBefore.status !== 'PENDING') return res.status(409).json({ error: 'proposal is not pending' })
  if (proposalBefore.partnerId !== body.data.accepterId) return res.status(403).json({ error: 'only partner can accept' })

  const proposal = await prisma.matchProposal.update({ where: { id }, data: { status: 'ACCEPTED' } })
  const appointment = await prisma.appointment.create({
    data: {
      proposalId: proposal.id,
      userAId: proposal.proposerId,
      userBId: proposal.partnerId,
      place: body.data.place,
      startsAt,
      checkinCode: String(Math.floor(1000 + Math.random() * 9000)),
    },
  })
  res.json({ proposal, appointment })
})

app.post('/matches/:id/reject', async (req, res) => {
  const body = z.object({ rejecterId: z.string() }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const proposal = await prisma.matchProposal.findUnique({ where: { id: req.params.id } })
  if (!proposal) return res.status(404).json({ error: 'proposal not found' })
  if (proposal.partnerId !== body.data.rejecterId) return res.status(403).json({ error: 'only partner can reject' })
  if (proposal.status !== 'PENDING') return res.status(409).json({ error: 'proposal is not pending' })

  const updated = await prisma.matchProposal.update({ where: { id: req.params.id }, data: { status: 'REJECTED' } })
  res.json(updated)
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
  if (!isInAppointment(appt, body.data.userId)) return res.status(403).json({ error: 'user is not part of this appointment' })
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
  const body = z.object({ reporterId: z.string(), targetUserId: z.string(), reason: z.string().default('no-show') }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  if (body.data.reporterId === body.data.targetUserId) return res.status(400).json({ error: 'cannot report no-show for self' })

  const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } })
  if (!appt) return res.status(404).json({ error: 'appointment not found' })
  if (!isInAppointment(appt, body.data.reporterId) || !isInAppointment(appt, body.data.targetUserId)) {
    return res.status(403).json({ error: 'users must be appointment participants' })
  }

  await prisma.appointment.update({ where: { id: req.params.id }, data: { status: 'NO_SHOW' } })

  const now = new Date()
  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const noShowCount = await prisma.sanction.count({
    where: {
      userId: body.data.targetUserId,
      reason: { startsWith: 'no-show' },
      createdAt: { gte: from },
    },
  })

  const level = noShowCount === 0 ? 'SUSPEND_7D' : noShowCount === 1 ? 'SUSPEND_30D' : 'BAN'
  const endAt =
    level === 'SUSPEND_7D'
      ? new Date(now.getTime() + 7 * 86400000)
      : level === 'SUSPEND_30D'
        ? new Date(now.getTime() + 30 * 86400000)
        : null

  const sanction = await prisma.sanction.create({
    data: {
      userId: body.data.targetUserId,
      level,
      reason: `no-show:${body.data.reason}:appointment=${req.params.id}:reporter=${body.data.reporterId}`,
      endAt,
    },
  })

  await prisma.user.update({ where: { id: body.data.targetUserId }, data: { trustScore: { decrement: 10 } } })

  if (level === 'BAN') {
    await prisma.user.update({ where: { id: body.data.targetUserId }, data: { blocked: true } })
  }

  res.json({ appointmentId: req.params.id, sanction, strikesIn90d: noShowCount + 1 })
})

app.post('/appointments/:id/review', async (req, res) => {
  const body = z
    .object({
      reviewerId: z.string(),
      revieweeId: z.string(),
      comment: z.string().trim().min(1).max(500),
      scoreDelta: z.number().int().min(-5).max(5).default(1),
    })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  if (body.data.reviewerId === body.data.revieweeId) return res.status(400).json({ error: 'cannot review self' })

  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } })
  if (!appointment) return res.status(404).json({ error: 'appointment not found' })
  if (appointment.status !== 'COMPLETED') return res.status(409).json({ error: 'review is allowed only after completion' })
  if (!isInAppointment(appointment, body.data.reviewerId) || !isInAppointment(appointment, body.data.revieweeId)) {
    return res.status(403).json({ error: 'users must be appointment participants' })
  }

  const review = await prisma.review.create({ data: { appointmentId: req.params.id, ...body.data } })
  await prisma.user.update({ where: { id: body.data.revieweeId }, data: { trustScore: { increment: body.data.scoreDelta } } })
  res.json(review)
})

app.post('/appointments/:id/report', async (req, res) => {
  const body = z
    .object({ reporterId: z.string(), targetUserId: z.string(), reason: z.string().min(1).max(500), evidence: z.string().max(1000).optional() })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  if (body.data.reporterId === body.data.targetUserId) return res.status(400).json({ error: 'cannot report self' })

  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } })
  if (!appointment) return res.status(404).json({ error: 'appointment not found' })
  if (!isInAppointment(appointment, body.data.reporterId) || !isInAppointment(appointment, body.data.targetUserId)) {
    return res.status(403).json({ error: 'users must be appointment participants' })
  }

  const report = await prisma.report.create({ data: { appointmentId: req.params.id, ...body.data } })
  res.json(report)
})

// Admin
app.get('/admin/reports', async (_req, res) => {
  const reports = await prisma.report.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' } })
  res.json(reports)
})

app.post('/admin/reports/:id/resolve', async (req, res) => {
  const body = z
    .object({
      sanction: z.enum(['WARNING', 'SUSPEND_7D', 'SUSPEND_30D', 'BAN']).optional(),
      trustDelta: z.number().int().min(-30).max(5).default(-5),
    })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const existingReport = await prisma.report.findUnique({ where: { id: req.params.id } })
  if (!existingReport) return res.status(404).json({ error: 'report not found' })
  if (existingReport.status !== 'OPEN') return res.status(409).json({ error: 'report already handled' })

  const report = await prisma.report.update({ where: { id: req.params.id }, data: { status: 'RESOLVED' } })

  await prisma.user.update({
    where: { id: report.targetUserId },
    data: { trustScore: { increment: body.data.trustDelta } },
  })

  if (body.data.sanction) {
    const endAt =
      body.data.sanction === 'SUSPEND_7D'
        ? new Date(Date.now() + 7 * 86400000)
        : body.data.sanction === 'SUSPEND_30D'
          ? new Date(Date.now() + 30 * 86400000)
          : null

    await prisma.sanction.create({
      data: { userId: report.targetUserId, level: body.data.sanction, reason: `Report ${report.id} resolved`, endAt },
    })

    if (body.data.sanction === 'BAN') {
      await prisma.user.update({ where: { id: report.targetUserId }, data: { blocked: true } })
    }
  }

  res.json({ ok: true })
})

app.post('/admin/users/:id/sanction', async (req, res) => {
  const body = z.object({ level: z.enum(['WARNING', 'SUSPEND_7D', 'SUSPEND_30D', 'BAN']), reason: z.string().trim().min(1).max(500) }).safeParse(req.body)
  if (!body.success) return res.status(400).json(body.error.flatten())

  const user = await ensureUserExists(req.params.id, res)
  if (!user) return

  const endAt =
    body.data.level === 'SUSPEND_7D'
      ? new Date(Date.now() + 7 * 86400000)
      : body.data.level === 'SUSPEND_30D'
        ? new Date(Date.now() + 30 * 86400000)
        : null
  const sanction = await prisma.sanction.create({ data: { userId: req.params.id, level: body.data.level, reason: body.data.reason, endAt } })

  if (body.data.level === 'BAN') {
    await prisma.user.update({ where: { id: req.params.id }, data: { blocked: true } })
  }

  res.json(sanction)
})

const port = Number(process.env.PORT || 4000)
app.listen(port, () => {
  console.log(`CoffeeChat MVP API listening on ${port}`)
})
