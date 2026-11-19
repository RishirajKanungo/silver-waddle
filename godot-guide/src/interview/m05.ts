import { md, type InterviewQ } from '../content/types';

export const QUESTIONS: InterviewQ[] = [
  {
    id: 'm05-q1',
    module: 'm05',
    area: 'systems',
    level: 2,
    q: md`Compare subtractive and divisive damage formulas. Which would you choose for an action RPG, and why?`,
    answer: md`Subtractive, $a - d$, is readable and gives every defence point a fixed value in damage, but it hits zero when defence reaches attack, and the relative value of a point, $1/(a - d)$, explodes near that edge, so balance must track every attacker/defender pairing. Divisive, $a\,k/(k + d)$, multiplies damage by a factor in $(0, 1]$: defence $k$ halves damage, it never reaches zero, and effective HP $H(k + d)/k$ grows linearly in defence, so each point adds the same survivability and items are easy to compare.

For an action RPG where a weak character should always contribute and stats grow modestly, divisive with a fixed $k$ is a safe default (Shardbound uses $k = 100$). If stats compound over a long game, scale $k$ with level or use the scale-invariant $a^2/(a + d)$.`,
    pitfalls: [md`Patching subtractive with a floor of 1 and calling it solved: 1 damage against 600 HP is still a wall.`, md`Forgetting that a fixed $k$ breaks when stats inflate tenfold.`],
    followups: [md`How much defence halves damage with $k = 100$?`, md`What is Bram's effective HP with 300 HP and 50 defence?`],
  },
  {
    id: 'm05-q2',
    module: 'm05',
    area: 'systems',
    level: 2,
    q: md`How would you design an XP curve?`,
    answer: md`Start from pacing, not XP. Decide how long each level should take, usually a slowly rising number of minutes, and estimate the XP per minute a player earns at each level from the encounter design (stronger enemies give more). Then $\text{next}(L) = \text{minutes}(L) \times \text{rate}(L)$. If rewards grow roughly linearly with level, a linear or gentle power curve gives near-constant or slowly rising time per level; an exponential curve outruns any polynomial reward growth and creates a grind at the end.

Implement it as data (a Resource with the shape and parameters), compute total XP by summing, handle multi-level rewards with a while loop that carries the remainder, and verify with a table of minutes and hours per level. Then playtest: measure real XP rates, which always differ from the estimate.`,
    pitfalls: [md`Tuning the XP numbers in isolation from enemy rewards.`, md`Using an if instead of a while, so a large reward grants only one level.`, md`Off-by-one: reaching level $L$ sums next(1) to next(L − 1).`],
    followups: [md`Derive total XP for an exponential curve.`, md`How would you give explorers more XP without making completionists overlevelled?`],
  },
  {
    id: 'm05-q3',
    module: 'm05',
    area: 'math',
    level: 1,
    q: md`A drop has a 1% chance. How many kills does a player need to be 90% sure of getting it, and what does that imply for design?`,
    answer: md`The chance of no drop in $N$ independent kills is $0.99^N$, so the chance of at least one is $1 - 0.99^N$. Setting $0.99^N \le 0.1$ gives $N \ge \ln 0.1/\ln 0.99 \approx 229$. After 100 kills only 63% of players have it, and one in ten still lacks it after 229. For drops that gate progression, that tail is unacceptable: guarantee them, add a pity counter (a certain drop after some number of misses, set well above $1/p$ so the average barely moves), or make the drop come from a source the player controls. Pure randomness is fine for optional rewards whose absence does not block anyone.`,
    pitfalls: [md`Assuming 1% means "within 100 kills".`, md`Adding a pity limit near $1/p$, which changes the effective rate a lot.`],
    followups: [md`What is the general approximation for kills to 90% at small $p$?`],
  },
  {
    id: 'm05-q4',
    module: 'm05',
    area: 'systems',
    level: 2,
    q: md`How do you implement weighted random selection, and why use weights rather than percentages?`,
    answer: md`Sum the weights, roll a uniform number in $[0, \text{total})$, then walk the entries subtracting each weight until the roll is below the current one. Laid end to end the weights partition the range, so each entry is chosen with probability weight/total. For many rolls over a fixed table, precompute the cumulative sums and binary search. Godot 4.3+ provides \`RandomNumberGenerator.rand_weighted\`.

Weights are better for authoring: adding or removing an entry does not require rescaling the others to sum to 100, and designers think in relative terms ("potions are three times as common as ethers"). Keep tables in Resources so they are edited in the Inspector, and seed the generator in tests so results are reproducible.`,
    pitfalls: [md`Rolling with an inclusive upper bound (\`randi_range(0, total)\`), which favours the last entry.`, md`Normalizing to percentages by hand and drifting from 100.`],
    followups: [md`How would you test that a weighted pick is correct?`],
  },
  {
    id: 'm05-q5',
    module: 'm05',
    area: 'feel',
    level: 2,
    q: md`Players complain crits come in streaks and droughts. What causes this and how would you fix it without changing the crit rate?`,
    answer: md`Independent rolls naturally produce runs: at 20%, ten misses in a row has about an 11% chance, so over hundreds of swings long droughts and back-to-back crits are certain. Humans expect randomness to look more even than it is, so they read the runs as bias.

A pseudo-random distribution fixes the feel while keeping the average: the chance starts at a small constant $c$ and grows by $c$ after each miss, resetting on a crit. Solving for $c$ so the long-run rate is still $p$ (about 0.0557 for 20%) caps droughts (the chance reaches 1 after about $1/c$ misses) and makes immediate repeats rare. A pity limit is a simpler alternative that caps droughts but raises the average. Measure with a simulation: compare gap histograms and the observed rate.`,
    pitfalls: [md`Raising the crit chance to compensate, which changes balance.`, md`Using PRD with $c = p$, which makes the real rate much higher than $p$.`],
    followups: [md`How do you compute $c$ for a given $p$?`],
  },
  {
    id: 'm05-q6',
    module: 'm05',
    area: 'combat',
    level: 2,
    q: md`How do you balance encounters with numbers before playtesting?`,
    answer: md`Use time to kill. For each party member against each enemy, compute damage per hit from the real formula, expected damage with crits $b(1 + p(m - 1))$, DPS from attack rate, hits to kill $\lceil H/D \rceil$ and TTK $\approx H/\text{DPS}$; and the reverse for enemies against the party (how many hits until a party member falls). Targets come from design: a common enemy dies in about three hits, an elite in ten seconds of focused play, the boss in a few minutes with staggers.

Keep the sheet as code next to the game (an EditorScript that calls the real damage functions and loads the real Resources), so it cannot drift, and look for walls, breakpoints where small stat changes cross a hits-to-kill threshold, and outliers. Use small damage variance so the computed hits to kill is what players experience.`,
    pitfalls: [md`Balancing on average damage while ignoring breakpoints.`, md`Keeping a spreadsheet whose formulas drift from the game's code.`],
    followups: [md`Why does ±50% damage variance hurt planning?`],
  },
];
