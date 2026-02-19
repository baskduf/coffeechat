import { prisma } from '../src/prisma.js'

async function main() {
  const alice = await prisma.user.upsert({
    where: { email: 'alice@coffeechat.dev' },
    update: {},
    create: { email: 'alice@coffeechat.dev', nickname: 'alice', provider: 'google', phoneVerified: true },
  })
  const bob = await prisma.user.upsert({
    where: { email: 'bob@coffeechat.dev' },
    update: {},
    create: { email: 'bob@coffeechat.dev', nickname: 'bob', provider: 'kakao', phoneVerified: true },
  })

  await prisma.userInterest.createMany({
    data: [
      { userId: alice.id, name: 'frontend' },
      { userId: alice.id, name: 'startup' },
      { userId: bob.id, name: 'backend' },
      { userId: bob.id, name: 'ai' },
    ],
    skipDuplicates: true,
  })

  await prisma.availabilitySlot.createMany({
    data: [
      { userId: alice.id, weekday: 2, startTime: '19:00', endTime: '21:00', area: 'Gangnam' },
      { userId: bob.id, weekday: 2, startTime: '19:00', endTime: '22:00', area: 'Gangnam' },
    ],
  })

  console.log({ alice: alice.id, bob: bob.id })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
