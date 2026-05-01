export const PROFILE_QUALITY_UNLOCK_SCORE = 70;

export function computeProfileQuality(user, mediaCount = 0) {
  const interests = (() => {
    try {
      return JSON.parse(user.interests || "[]");
    } catch {
      return [];
    }
  })();

  const prompts = (() => {
    try {
      const parsed = JSON.parse(user.profilePrompts || "[]");
      return Array.isArray(parsed) ? parsed.filter((p) => p?.q && p?.a) : [];
    } catch {
      return [];
    }
  })();

  const checks = {
    photos: mediaCount >= 4,
    bio: (user.bio || "").trim().length >= 120,
    prompts: prompts.length >= 3,
    interests: interests.length >= 5,
    verified: !!user.verified,
    intent: !!(user.lookingFor || "").trim(),
  };

  let score = 0;
  if (checks.photos) score += 25;
  if (checks.bio) score += 20;
  if (checks.prompts) score += 20;
  if (checks.interests) score += 15;
  if (checks.verified) score += 10;
  if (checks.intent) score += 10;

  const tips = [];
  if (!checks.photos) tips.push("Add at least 4 photos");
  if (!checks.bio) tips.push("Write a bio with at least 120 characters");
  if (!checks.prompts) tips.push("Answer at least 3 profile prompts");
  if (!checks.interests) tips.push("Add at least 5 interests");
  if (!checks.verified) tips.push("Request profile verification");

  return {
    score,
    unlocked: score >= PROFILE_QUALITY_UNLOCK_SCORE,
    checks,
    tips,
    threshold: PROFILE_QUALITY_UNLOCK_SCORE,
  };
}
