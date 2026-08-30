# FallGrowth · the growth brain that learns your goal

**LIVE: https://sjgant80-hub.github.io/fallgrowth/**

The growth organ of an AI-first company. It learns which social + ecommerce strategy moves you
toward **your** goal — from real outcomes, not a static generator. It picks the next move (the 90%
AI); you approve anything that spends money or posts publicly (your 10% at the doors); the real
result teaches it.

## The honest mechanism (no magic ML)

A **goal-weighted feedback ledger + bandit** — auditable arithmetic you can read, not a trained model:

- **Arms** — the named levers you control (hook × time × platform × cta × angle × price).
- **Reward** — real outcome signals (reach, engagement, clicks, revenue, list) blended into one
  `[0,1]` scalar **weighted by your goal**. The same post scores differently depending on what
  you're aiming at — that's how it learns *for your goal*.
- **Posterior** — each arm carries a Beta(α,β); selection is Bayesian upper-confidence (optimism
  under uncertainty), deterministic and gateable.
- **Consolidate** — retire arms that had a real chance and lost; keep the unlucky.

`grow.mjs` is **witness-gated 46/49 killed + 3 argued equivalents** — the fuzz proves the winner
decisively overtakes and zero-data arms never NaN. It's inlined into `index.html` verbatim; CI
diffs the rebuild so the live logic can't drift from the proven logic.

## The one truth

There is no free "learning" without real feedback numbers. Ecommerce/revenue comes from your CRM;
engagement you paste weekly. **No real data in = it's a scorer with extra steps.** The organ makes
feeding it real numbers the core ritual.

## Connects to

fallgravity (pre-score) · copy-gate (quality filter) · fallpost / fall-sales-marketing (execute) ·
fallforce (ecommerce ground-truth). The money/publish doors stay human by design
(fallbrain · glass-company pattern).

Everything is local to your browser (IndexedDB); nothing uploads. Konomi Architecture — created by
Thomas Frumkin · konomi-systems.com · built by AI-Native Solutions.
