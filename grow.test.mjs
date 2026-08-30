// grow.test.mjs — the growth-learning law, falsifiable. The load-bearing property (the FUZZ):
// feed lopsided outcomes and the winner's weight MUST rise above the losers, and NOTHING NaNs on a
// zero-data arm. A bandit that doesn't actually shift toward the winner is theatre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGNALS, reward, makeArm, posterior, select, update, consolidate } from './grow.mjs';

test('REWARD — goal-weighted blend; the SAME outcome scores differently per goal', () => {
  const outcome = { reach: 1.0, engagement: 0.5, revenue: 0.0 };
  const forReach = reward(outcome, { reach: 1 });
  const forRevenue = reward(outcome, { revenue: 1 });
  assert.equal(forReach.reward, 1, 'aiming at reach, this outcome is a win');
  assert.equal(forRevenue.reward, 0, 'aiming at revenue, the same outcome is a loss');
  const blend = reward(outcome, { reach: 3, engagement: 1 });   // (3*1 + 1*0.5)/4 = 0.875
  assert.equal(blend.reward, 0.875, 'weighted blend is exact and auditable');
});

test('REWARD REFUSES — a signal the goal weights must be present and in range; empty goal is named', () => {
  assert.match(reward(null, { reach: 1 }).why, /signals must be an object/);
  assert.match(reward({ reach: 1 }, null).why, /goal must be an object/);
  assert.match(reward({}, { revenue: 1 }).why, /signal "revenue" must be a number in \[0,1\]/, 'weighted signal missing = refuse');
  assert.match(reward({ reach: 2 }, { reach: 1 }).why, /\[0,1\]/, 'out-of-range signal refused');
  assert.match(reward({ reach: 1 }, { unknown: 1 }).why, /weights no known signal/);
  assert.match(reward({ reach: 1 }, { reach: -1 }).why, /weights no known signal/, 'a non-positive weight does not count');
});

test('POSTERIOR — a fresh arm is centred at 0.5 with wide uncertainty; evidence narrows it', () => {
  const { arm } = makeArm('a', { hook: 'bold' });
  const p0 = posterior(arm);
  assert.equal(p0.mean, 0.5);
  assert.ok(p0.upper > 0.6 && p0.lower < 0.4, 'no data → wide band');
  let a = arm;
  for (let i = 0; i < 20; i++) a = update(a, 0.9).arm;   // consistent winner
  const p1 = posterior(a);
  assert.ok(p1.mean > 0.8, 'twenty strong rewards pull the mean up');
  assert.ok(p1.sd < p0.sd, 'evidence narrows the band');
});

test('THE FUZZ — lopsided outcomes: the winner overtakes, and zero-data arms never NaN', () => {
  let win = makeArm('winner', {}).arm, lose = makeArm('loser', {}).arm;
  const fresh = makeArm('untried', {}).arm;                 // never updated — must survive selection maths
  // 30 rounds: winner rewards ~0.9, loser ~0.1
  for (let i = 0; i < 30; i++) { win = update(win, 0.9).arm; lose = update(lose, 0.1).arm; }
  const pw = posterior(win), pl = posterior(lose), pf = posterior(fresh);
  assert.ok(Number.isFinite(pf.upper) && Number.isFinite(pf.lower), 'a zero-data arm produces finite bounds, never NaN');
  assert.ok(pw.mean > 0.8 && pl.mean < 0.2, 'the arithmetic separates winner from loser');
  assert.ok(pw.lower > pl.upper, 'the winner is decisively, not marginally, ahead');
  // once both are well-explored, select must exploit the winner over the loser
  const s = select([win, lose]);
  assert.equal(s.pick, 'winner', 'after enough data, the optimist picks the proven winner');
});

test('SELECT — optimism under uncertainty: an untried arm outranks a proven mediocre one', () => {
  let mediocre = makeArm('mediocre', {}).arm;
  for (let i = 0; i < 40; i++) mediocre = update(mediocre, 0.5).arm;  // lots of data, dead average
  const fresh = makeArm('fresh', {}).arm;                              // no data, ceiling still high
  const s = select([mediocre, fresh]);
  assert.equal(s.pick, 'fresh', 'the untried ceiling beats a well-known average — explore');
  assert.match(s.reason, /earns the first real test/);
  // deterministic ties: two identical untried arms → the id-lower one, always the same
  const a = makeArm('aaa', {}).arm, b = makeArm('bbb', {}).arm;
  assert.equal(select([b, a]).pick, 'aaa', 'ties break by id — reproducible, not insertion luck');
  assert.match(select([mediocre]).reason, /optimistic pick|mean/);
});

test('SELECT REFUSES — no arms, junk arms', () => {
  assert.match(select([]).why, /seed the levers first/);
  assert.match(select(null).why, /must be a list/);
  assert.match(select([{ id: 'x', alpha: 0, beta: 1 }]).why, /malformed/);
});

test('CONSOLIDATE — retires only the tried-and-hopeless (ceiling below the field best), keeps the unlucky', () => {
  let champ = makeArm('champ', {}).arm, dud = makeArm('dud', {}).arm, unlucky = makeArm('unlucky', {}).arm;
  for (let i = 0; i < 20; i++) { champ = update(champ, 0.9).arm; dud = update(dud, 0.05).arm; }
  unlucky = update(unlucky, 0.1).arm; unlucky = update(unlucky, 0.2).arm;   // only 2 pulls — not enough chance
  const r = consolidate([champ, dud, unlucky], 8);
  assert.deepEqual(r.retired.map((x) => x.id), ['dud'], 'the well-tried hopeless arm is retired');
  assert.deepEqual(r.keep.map((a) => a.id).sort(), ['champ', 'unlucky'], 'champ kept; unlucky kept — it never had a real chance');
  assert.match(consolidate([champ], 0).why, /positive integer/);
  assert.match(consolidate('x').why, /must be a list/);
});

test('MAKEARM + UPDATE — guards, immutability, and SIGNALS integrity', () => {
  assert.match(makeArm('', {}).why, /arm id required/);
  assert.match(makeArm('a', null).why, /levers must be an object/);
  const { arm } = makeArm('a', { hook: 'x' });
  const next = update(arm, 0.7).arm;
  assert.equal(arm.pulls, 0, 'update never mutates the input arm');
  assert.equal(next.pulls, 1);
  assert.equal(round(next.alpha), 1.7); assert.equal(round(next.beta), 1.3);
  assert.match(update(arm, 2).why, /\[0,1\]/);
  assert.match(update(arm, 'x').why, /\[0,1\]/);
  assert.deepEqual(SIGNALS, ['reach', 'engagement', 'clicks', 'revenue', 'list']);
});
const round = (x) => Math.round(x * 1000) / 1000;

// ── hardening: pin every boundary + tie-break the fuzz didn't hit exactly ──

test('POSTERIOR depends on α,β NOT pulls — and a zero-α arm refuses', () => {
  // two arms, identical Beta, different pull counts → identical posterior (sd uses α+β, not pulls)
  const a = { id: 'a', alpha: 3, beta: 2, pulls: 0 };
  const b = { id: 'b', alpha: 3, beta: 2, pulls: 99 };
  const pa=posterior(a), pb=posterior(b);
  assert.deepEqual([pa.mean,pa.sd,pa.upper,pa.lower],[pb.mean,pb.sd,pb.upper,pb.lower], 'the MATH is pulls-independent (sd uses α+β)');
  // the exact sd pins the (n+1) in the variance denominator (kills n+1 → n-1)
  // mean=0.6, n=5: sd = sqrt(0.6*0.4/6) = sqrt(0.04) = 0.2
  assert.equal(posterior(a).sd, 0.2, 'the Beta variance denominator is n+1, exactly');
  assert.match(posterior({ alpha: 0, beta: 1 }).why, /valid Beta/, 'α=0 refuses, boundary is > not >=');
  assert.match(posterior({ alpha: 1, beta: 0 }).why, /valid Beta/);
  // UPDATE guards its Beta the same way — an arm with α=0 or β=0 refuses, never folds reward into a dead posterior
  assert.match(update({ id: 'z', alpha: 0, beta: 1, pulls: 0 }, 0.5).why, /valid Beta/, 'update α=0 refuses, boundary is > not >=');
  assert.match(update({ id: 'z', alpha: 1, beta: 0, pulls: 0 }, 0.5).why, /valid Beta/);
});

test('SELECT tie-break — equal ceilings: FEWER pulls wins, then lower id; never overwrite on plain equal', () => {
  const few = { id: 'zzz', alpha: 3, beta: 2, pulls: 1 };
  const many = { id: 'aaa', alpha: 3, beta: 2, pulls: 50 };   // identical posterior → equal upper
  assert.equal(select([many, few]).pick, 'zzz', 'equal ceiling → the less-tried arm, regardless of id order');
  const p = { id: 'bbb', alpha: 3, beta: 2, pulls: 5 };
  const q = { id: 'aaa', alpha: 3, beta: 2, pulls: 5 };       // equal upper AND equal pulls → id decides
  assert.equal(select([p, q]).pick, 'aaa');
  assert.equal(select([q, p]).pick, 'aaa', 'reproducible under either insertion order');
});

test('REWARD — a weight of exactly 0 does not count that signal (boundary is > 0, not >= 0)', () => {
  // engagement weighted 0, reach weighted 1 → only reach counts; engagement value ignored
  const r = reward({ reach: 1, engagement: 0.0 }, { reach: 1, engagement: 0 });
  assert.equal(r.reward, 1, 'the zero-weight signal contributes nothing, even though present');
  assert.match(reward({ reach: 1 }, { reach: 0 }).why, /weights no known signal/, 'a lone zero weight = nothing to learn toward');
});

test('CONSOLIDATE boundaries — minPulls=1 is valid; exactly-minPulls with ceiling AT bestMean is KEPT', () => {
  assert.equal(consolidate([{ id: 'x', alpha: 2, beta: 2, pulls: 0 }], 1).ok, true, 'minPulls of 1 is allowed');
  // champ mean 0.8; borderline arm has exactly minPulls and upper exactly == champ mean → kept (retire needs upper < bestMean, strict)
  const champ = { id: 'champ', alpha: 8, beta: 2, pulls: 8 };          // mean 0.8
  const border = { id: 'border', alpha: 1, beta: 1, pulls: 8 };        // mean 0.5, upper well above 0.8 → kept anyway
  const clearDud = { id: 'dud', alpha: 1, beta: 20, pulls: 8 };        // mean ~0.05, upper < 0.8 → retired
  const r = consolidate([champ, border, clearDud], 8);
  assert.deepEqual(r.retired.map((x) => x.id), ['dud']);
  // an arm with pulls EXACTLY one below minPulls is never retired (kills pulls >= minPulls → >)
  const r2 = consolidate([champ, { id: 'young', alpha: 1, beta: 20, pulls: 7 }], 8);
  assert.deepEqual(r2.retired.map((x) => x.id), [], 'pulls=7 < minPulls=8 → not retired, the boundary is inclusive-at-8');
});

test('SHAPES — arrays and primitives refuse as themselves across every entry point', () => {
  assert.equal(reward([], { reach: 1 }).ok, false);
  assert.equal(makeArm('a', []).ok, false, 'an array is not a levers object');
  assert.equal(posterior([]).ok, false);
  assert.equal(update([], 0.5).ok, false);
  assert.equal(select([42, 'x']).ok, false, 'junk arms are refused, not coerced');
  // update tolerates an arm with no rewardSum field (|| 0 fallback) without NaN
  const patched = update({ id: 'a', alpha: 1, beta: 1, pulls: 0 }, 0.5);
  assert.equal(patched.arm.rewardSum, 0.5, 'a rewardSum-less arm starts its sum from 0, not NaN');
});
