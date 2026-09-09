import { test } from "node:test";
import assert from "node:assert/strict";
import { MILESTONES, SHOP, availableMilestones, nextMilestone, wallet, canBuy, SHOP_BY_ID } from "../shared/rewards.js";

test("milestones rise in both reach and reward", () => {
  for (let i = 1; i < MILESTONES.length; i++) {
    assert.ok(MILESTONES[i].days > MILESTONES[i - 1].days, "days must increase");
    assert.ok(MILESTONES[i].xp > MILESTONES[i - 1].xp, "a longer streak must pay more");
  }
});

test("a milestone is available once reached and never twice", () => {
  assert.deepEqual(availableMilestones(2).map((m) => m.days), []);
  assert.deepEqual(availableMilestones(3).map((m) => m.days), [3]);
  assert.deepEqual(availableMilestones(8).map((m) => m.days), [3, 7]);
  assert.deepEqual(availableMilestones(8, [3]).map((m) => m.days), [7], "claimed ones drop out");
  assert.deepEqual(availableMilestones(8, [3, 7]), [], "nothing left to claim");
});

test("the next target is real, and runs out at the top", () => {
  assert.equal(nextMilestone(0).days, 3);
  assert.equal(nextMilestone(0).daysAway, 3);
  assert.equal(nextMilestone(5).days, 7);
  assert.equal(nextMilestone(5).daysAway, 2);
  assert.equal(nextMilestone(1000), null, "no fake target beyond the last milestone");
});

test("spending never makes the wallet negative", () => {
  assert.equal(wallet(100, 30), 70);
  assert.equal(wallet(100, 100), 0);
  assert.equal(wallet(100, 500), 0, "a wallet cannot go below zero");
  assert.equal(wallet(0, 0), 0);
  assert.equal(wallet(undefined, undefined), 0);
});

test("buying is refused with a reason, not a bare no", () => {
  const item = SHOP_BY_ID.get("avatar-gold");
  assert.equal(canBuy(item, 1000, []).ok, true);
  const poor = canBuy(item, 10, []);
  assert.equal(poor.ok, false);
  assert.equal(poor.short, item.cost - 10);
  assert.match(poor.reason, /more XP needed/);
  const dupe = canBuy(item, 1000, ["avatar-gold"]);
  assert.equal(dupe.ok, false);
  assert.match(dupe.reason, /already own/);
  assert.equal(canBuy(undefined, 1000, []).ok, false);
});

test("nothing on sale affects learning or marking", () => {
  // The moment something here gates content or marking, the tool starts
  // charging the students who study least the most.
  const allowed = new Set(["avatar", "ring", "badge"]);
  for (const item of SHOP) {
    assert.ok(allowed.has(item.kind), `${item.id} is a "${item.kind}" — only cosmetics may be sold`);
    assert.ok(item.cost > 0 && Number.isInteger(item.cost));
  }
  assert.equal(new Set(SHOP.map((i) => i.id)).size, SHOP.length, "item ids must be unique");
});
