// fallgrowth · grow.mjs — THE GROWTH-LEARNING LAW.
//
// The growth organ of an AI-first company: it LEARNS which social/ecommerce strategy moves you
// toward YOUR stated goal, from real outcomes — not a static generator. The honest mechanism
// (sididy's design, no magic ML):
//
//   · ARMS      — a small explicit set of levers you actually control (hook × time × platform × …).
//   · REWARD    — a real outcome (engagement, clicks, revenue) blended into ONE [0,1] scalar by the
//                 GOAL weights, so the SAME outcome scores differently depending on what you're aiming
//                 at. This is how it learns "for your goal": the goal defines what winning means.
//   · POSTERIOR — each arm carries a Beta(α,β): α = accumulated reward + 1, β = accumulated miss + 1.
//                 Auditable arithmetic — anyone can read the ledger and see why a weight moved.
//   · SELECT    — Bayesian upper-confidence: pick the arm whose posterior UPPER bound is highest.
//                 Exploits winners, still explores the uncertain — and it is DETERMINISTIC (a gate
//                 needs reproducible selection; pure Thompson sampling is Beta-posterior-compatible
//                 but not gateable, so we hold the Beta and select by its confidence bound instead).
//   · CONSOLIDATE — retire arms that have had a real chance and lost; spawn a near-neighbour of a
//                 winner. The idle "dream" pass, made arithmetic.
//
// Pure and total: garbage in → { ok:false, why }, never a throw mid-decision.

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
const num01 = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1);

// the outcome signals a growth action can produce — each normalised to [0,1] by the caller
export const SIGNALS = ['reach', 'engagement', 'clicks', 'revenue', 'list'];

/**
 * REWARD — blend real outcome signals into one [0,1] scalar, weighted by the GOAL.
 * goal is { revenue: 0.7, reach: 0.2, ... } (weights need not sum to 1; they are normalised).
 * A signal the goal does not weight contributes nothing — you learn only toward what you aim at.
 */
export function reward(signals, goal) {
  const s = obj(signals), g = obj(goal);
  if (!s) return { ok: false, why: 'signals must be an object of signal→[0,1]' };
  if (!g) return { ok: false, why: 'goal must be an object of signal→weight' };
  let wsum = 0, acc = 0, used = 0;
  for (const k of SIGNALS) {
    const w = g[k];
    if (!(typeof w === 'number' && Number.isFinite(w) && w > 0)) continue;
    const v = s[k];
    if (!num01(v)) return { ok: false, why: `signal "${k}" must be a number in [0,1] (the goal weights it)` };
    wsum += w; acc += w * v; used++;
  }
  if (used === 0) return { ok: false, why: 'the goal weights no known signal — nothing to learn toward' };
  return { ok: true, reward: Math.round((acc / wsum) * 1000) / 1000 };
}

/** a fresh arm: named levers + an untouched Beta(1,1) prior. */
export function makeArm(id, levers) {
  if (!(typeof id === 'string' && id.length > 0)) return { ok: false, why: 'arm id required' };
  if (!obj(levers)) return { ok: false, why: 'levers must be an object (hook, time, platform, cta, angle, price)' };
  return { ok: true, arm: { id, levers: { ...levers }, alpha: 1, beta: 1, pulls: 0, rewardSum: 0 } };
}

/** POSTERIOR — mean and a Bayesian upper/lower bound from the Beta(α,β). Normal approx on the Beta,
 *  which is accurate enough for ranking and keeps the arithmetic auditable. z=1.96 ≈ 95%. */
export function posterior(arm, z = 1.96) {
  const a = obj(arm);
  if (!a || !(a.alpha > 0) || !(a.beta > 0)) return { ok: false, why: 'arm has no valid Beta(α,β)' };
  const n = a.alpha + a.beta;
  const mean = a.alpha / n;
  const sd = Math.sqrt((mean * (1 - mean)) / (n + 1));   // Beta variance, +1 keeps a fresh arm honest-wide
  const upper = Math.min(1, mean + z * sd);
  const lower = Math.max(0, mean - z * sd);
  return { ok: true, mean: round3(mean), sd: round3(sd), upper: round3(upper), lower: round3(lower), pulls: a.pulls };
}

const round3 = (x) => Math.round(x * 1000) / 1000;

/**
 * SELECT — the arm to pull next: highest posterior UPPER bound (optimism under uncertainty).
 * Deterministic; ties break by fewer pulls (favour the less-tried), then by id. Returns the pick
 * with the reason, so every choice can say why — a choice that cannot say why is not a strategy.
 */
export function select(arms, z = 1.96) {
  const list = Array.isArray(arms) ? arms.filter(obj) : null;
  if (!list) return { ok: false, why: 'arms must be a list' };
  if (list.length === 0) return { ok: false, why: 'no arms to choose from — seed the levers first' };
  let best = null;
  for (const arm of list) {
    const p = posterior(arm, z);
    if (!p.ok) return { ok: false, why: `arm "${arm.id}" is malformed: ${p.why}` };
    const cand = { arm, upper: p.upper, mean: p.mean, pulls: arm.pulls };
    if (!best
      || cand.upper > best.upper
      || (cand.upper === best.upper && cand.pulls < best.pulls)
      || (cand.upper === best.upper && cand.pulls === best.pulls && arm.id < best.arm.id)) best = cand;
  }
  const reason = best.pulls === 0
    ? `untried arm "${best.arm.id}" — its confidence ceiling ${best.upper} is highest, so it earns the first real test`
    : `arm "${best.arm.id}" — mean ${best.mean}, confidence ceiling ${best.upper} over ${best.pulls} pull(s): the optimistic pick`;
  return { ok: true, pick: best.arm.id, upper: best.upper, mean: best.mean, reason };
}

/** UPDATE — fold a real reward into an arm's Beta. Continuous reward in [0,1]: α += r, β += (1−r).
 *  Returns a FRESH arm (never mutates) — the ledger is append-only in spirit. */
export function update(arm, r) {
  const a = obj(arm);
  if (!a || !(a.alpha > 0) || !(a.beta > 0)) return { ok: false, why: 'arm has no valid Beta(α,β)' };
  if (!num01(r)) return { ok: false, why: 'reward must be a number in [0,1] (blend real outcomes with reward())' };
  return { ok: true, arm: { ...a, alpha: a.alpha + r, beta: a.beta + (1 - r), pulls: a.pulls + 1, rewardSum: (a.rewardSum || 0) + r } };
}

/**
 * CONSOLIDATE — the idle pass. An arm is RETIRED only after it has had a real chance (pulls ≥ minPulls)
 * AND its confidence CEILING is below the field's best mean — i.e. even optimistically it cannot win.
 * Retiring on mean alone would kill unlucky-but-promising arms; the ceiling test is the honest bar.
 * Returns { keep, retired } — nothing is deleted here, the caller decides what to do with retired.
 */
export function consolidate(arms, minPulls = 8, z = 1.96) {
  const list = Array.isArray(arms) ? arms.filter(obj) : null;
  if (!list) return { ok: false, why: 'arms must be a list' };
  if (!Number.isInteger(minPulls) || minPulls < 1) return { ok: false, why: 'minPulls must be a positive integer' };
  let bestMean = 0;
  for (const a of list) { const p = posterior(a, z); if (p.ok && p.mean > bestMean) bestMean = p.mean; }
  const keep = [], retired = [];
  for (const a of list) {
    const p = posterior(a, z);
    if (!p.ok) return { ok: false, why: `arm "${a.id}" is malformed: ${p.why}` };
    if (a.pulls >= minPulls && p.upper < bestMean) retired.push({ id: a.id, mean: p.mean, upper: p.upper, pulls: a.pulls });
    else keep.push(a);
  }
  return { ok: true, keep, retired };
}
