import { PrismaClient } from "../generated/postgres-client/index.js";

const dbUrl = process.env.DATABASE_URL_POSTGRES || process.env.DATABASE_PUBLIC_URL;
if (!dbUrl) {
  console.error("No postgres URL found (DATABASE_URL_POSTGRES or DATABASE_PUBLIC_URL)");
  process.exit(1);
}
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

async function main() {
  // Delete in dependency order
  await prisma.messageReaction.deleteMany();
  await prisma.message.deleteMany();
  await prisma.like.deleteMany();
  await prisma.profileView.deleteMany();
  await prisma.blockedUser.deleteMany();
  await prisma.report.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.liveRoom.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.dailyLike.deleteMany();
  await prisma.securityEvent.deleteMany();
  await prisma.media.deleteMany();
  await prisma.user.deleteMany();
  console.log("All users and related data purged.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
