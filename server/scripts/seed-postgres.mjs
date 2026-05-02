import { PrismaClient } from "../generated/postgres-client/index.js";
import bcrypt from "bcryptjs";

const dbUrl = process.env.DATABASE_URL_POSTGRES || process.env.DATABASE_PUBLIC_URL;
if (!dbUrl) {
  console.error("No postgres URL found (DATABASE_URL_POSTGRES or DATABASE_PUBLIC_URL)");
  process.exit(1);
}
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

async function main() {
  const hash = await bcrypt.hash("demo1234", 10);

  const seeds = [
    {
      email: "maya@demo.com",
      name: "Maya",
      age: 27,
      city: "Atlanta",
      state: "GA",
      zipCode: "30301",
      pronouns: "she/her",
      genderIdentity: "Woman",
      sexualOrientation: "Straight",
      polyPreference: "Open to monogamy",
      bio: "Love rooftop dinners, anime nights, and spontaneous road trips.",
      interests: JSON.stringify(["Travel", "Fitness", "Photography"]),
      lookingFor: "Long-term relationship",
      profileTheme: "sunset",
      profileGraphic: "hearts",
      musicUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      profileMotto: "Soft heart, strong boundaries.",
      dreamDate: "Food truck crawl and a skyline walk.",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800",
      passwordHash: hash,
    },
    {
      email: "jordan@demo.com",
      name: "Jordan",
      age: 31,
      city: "Dallas",
      state: "TX",
      zipCode: "75201",
      pronouns: "he/him",
      genderIdentity: "Man",
      sexualOrientation: "Bisexual",
      polyPreference: "Open to polyamory",
      bio: "Entrepreneur by day, salsa dancer by night.",
      interests: JSON.stringify(["Business", "Dancing", "Food"]),
      lookingFor: "Meaningful connection",
      profileTheme: "neon",
      profileGraphic: "stars",
      musicUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      profileMotto: "Build boldly. Love gently.",
      dreamDate: "Live jazz and late night tacos.",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800",
      passwordHash: hash,
    },
    {
      email: "tiana@demo.com",
      name: "Tiana",
      age: 24,
      city: "Miami",
      state: "FL",
      zipCode: "33101",
      pronouns: "she/they",
      genderIdentity: "Non-binary femme",
      sexualOrientation: "Queer",
      polyPreference: "Polyamorous",
      bio: "Beach sunsets and deep conversations are my thing.",
      interests: JSON.stringify(["Music", "Beach", "Art"]),
      lookingFor: "Dating and friendship",
      profileTheme: "ocean",
      profileGraphic: "sparkles",
      musicUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
      profileMotto: "Romance is in the details.",
      dreamDate: "Sunrise paddleboard then brunch.",
      avatar: "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=800",
      passwordHash: hash,
    },
  ];

  for (const seed of seeds) {
    const { email, ...data } = seed;
    await prisma.user.upsert({
      where: { email },
      update: data,
      create: seed,
    });
    console.log(`Seeded: ${email}`);
  }

  console.log("Done!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
