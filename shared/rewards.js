/**
 * Streak milestones and the XP market.
 *
 * Two rules shape what is for sale.
 *
 * 1. Cosmetics only. Selling access to marking would mean the student who
 *    studies least gets the least help, which is backwards for a study tool.
 *    Nothing here changes what you can learn or how well your work is marked.
 *
 * 2. Spending never lowers your level. Level comes from lifetime XP earned;
 *    the wallet is lifetime minus spent. Dropping a level for buying a colour
 *    would punish you for using the reward.
 */

/** Reaching a streak day pays once. Later milestones pay more. */
export const MILESTONES = [
  { days: 3,   xp: 20,  name: "Three days",  blurb: "The hardest part is starting." },
  { days: 7,   xp: 60,  name: "One week",    blurb: "A week is a habit forming." },
  { days: 14,  xp: 120, name: "Two weeks",   blurb: "This is what revision actually looks like." },
  { days: 30,  xp: 250, name: "A month",     blurb: "A month of daily work shows up in a grade." },
  { days: 60,  xp: 500, name: "Two months",  blurb: "Genuinely rare. Most people stop by now." },
  { days: 100, xp: 900, name: "One hundred", blurb: "A hundred days. Nothing to add." },
];

/** Avatar designs beyond the twelve free ones, plus a few flourishes. */
export const SHOP = [
  { id: "avatar-gold",    kind: "avatar", cost: 150,  name: "Gold",        blurb: "A warm gold avatar." },
  { id: "avatar-forest",  kind: "avatar", cost: 150,  name: "Forest",      blurb: "Deep green." },
  { id: "avatar-rose",    kind: "avatar", cost: 150,  name: "Rose",        blurb: "Muted rose." },
  { id: "avatar-mono",    kind: "avatar", cost: 250,  name: "Monochrome",  blurb: "Black on white. Understated." },
  { id: "avatar-gradient",kind: "avatar", cost: 400,  name: "Gradient",    blurb: "The EconIB gradient, as an avatar." },
  { id: "ring-gold",      kind: "ring",   cost: 300,  name: "Gold ring",   blurb: "Your level ring in gold." },
  { id: "badge-scholar",  kind: "badge",  cost: 500,  name: "Scholar",     blurb: "A badge beside your name." },
  { id: "badge-examiner", kind: "badge",  cost: 1200, name: "Examiner",    blurb: "For people who have marked a great deal of work." },
];

export const SHOP_BY_ID = new Map(SHOP.map((i) => [i.id, i]));

/**
 * Which milestones this streak has reached but not yet claimed.
 * A claim is manual so the reward is something you collect, not something that
 * happens while you are looking elsewhere.
 */
export function availableMilestones(streak, claimedDays = []) {
  const claimed = new Set(claimedDays.map(Number));
  return MILESTONES.filter((m) => streak >= m.days && !claimed.has(m.days));
}

/** The next one to aim at, and how far away it is. */
export function nextMilestone(streak) {
  const next = MILESTONES.find((m) => m.days > streak);
  return next ? { ...next, daysAway: next.days - streak } : null;
}

/**
 * Spendable XP. Lifetime earned minus everything spent — never negative, and
 * never used to compute the level.
 */
export function wallet(lifetimeXp, spent) {
  return Math.max(0, (lifetimeXp || 0) - (spent || 0));
}

/**
 * Can this be bought? Returns a reason rather than a bare false, so the
 * interface can say why instead of just disabling a button.
 */
export function canBuy(item, balance, owned) {
  if (!item) return { ok: false, reason: "That item does not exist." };
  if (owned.includes(item.id)) return { ok: false, reason: "You already own this." };
  if (balance < item.cost) {
    return { ok: false, reason: `${item.cost - balance} more XP needed.`, short: item.cost - balance };
  }
  return { ok: true };
}
