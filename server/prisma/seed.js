import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let prisma;
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgresql")) {
  prisma = new PrismaClient();
} else {
  const dataDir = path.resolve(__dirname, "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbUrl = `file:${path.join(dataDir, "demo.db").replace(/\\/g, "/")}`;
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  prisma = new PrismaClient({ adapter });
}

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
      interests: ["Travel", "Fitness", "Photography"],
      lookingFor: "Long-term relationship",
      profileTheme: "sunset",
      profileGraphic: "hearts",
      musicUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      profileMotto: "Soft heart, strong boundaries.",
      dreamDate: "Food truck crawl and a skyline walk.",
      avatar:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800",
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
      interests: ["Business", "Dancing", "Food"],
      lookingFor: "Meaningful connection",
      profileTheme: "neon",
      profileGraphic: "stars",
      musicUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      profileMotto: "Build boldly. Love gently.",
      dreamDate: "Live jazz and late night tacos.",
      avatar:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800",
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
      interests: ["Music", "Beach", "Art"],
      lookingFor: "Dating and friendship",
      profileTheme: "ocean",
      profileGraphic: "sparkles",
      musicUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
      profileMotto: "Romance is in the details.",
      dreamDate: "Sunrise paddleboard then brunch.",
      avatar:
        "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=800",
    },
  ];

  for (const seed of seeds) {
    await prisma.user.upsert({
      where: { email: seed.email },
      update: {
        name: seed.name,
        age: seed.age,
        city: seed.city,
        state: seed.state,
        zipCode: seed.zipCode,
        pronouns: seed.pronouns,
        genderIdentity: seed.genderIdentity,
        sexualOrientation: seed.sexualOrientation,
        polyPreference: seed.polyPreference,
        bio: seed.bio,
        interests: JSON.stringify(seed.interests),
        lookingFor: seed.lookingFor,
        profileTheme: seed.profileTheme,
        profileGraphic: seed.profileGraphic,
        musicUrl: seed.musicUrl,
        profileMotto: seed.profileMotto,
        dreamDate: seed.dreamDate,
        avatar: seed.avatar,
        passwordHash: hash,
      },
      create: { passwordHash: hash, ...seed, interests: JSON.stringify(seed.interests) },
    });
  }

  console.log("Seeded 3 demo users (password: demo1234).");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
