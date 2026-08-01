# The between-case layer — design

**Date:** 2026-07-31
**Status:** Proposal, not approved
**Depends on:** the shipped season in `src/game/content/`, `2026-07-26-immune-response-design.md`
**Supersedes:** the immune-response proposal's "immunisation costs a day, not currency"

---

## The problem it solves

Everything this game promises outside a fight resolves to nothing.

- The **bank** shows 180 per clear on the map. Nothing in the codebase spends it.
- **MMR** has read AVAILABLE since two clears, promising to block the amnesia wipe. There is no
  purchase, no effect, and its stated cost — *"a day you don't fight"* — is free, because nothing
  advances against you while you skip.
- **Chickenpox** promises to stop a cleared case reopening. No rule can reopen one.
- **`later.ts`** carries exactly one row: a region you already cleared, coming back.

Four promises on three screens, and they fail together for one reason: **the map is a menu, not a
board.** Cases come in a fixed order, days count up, nothing decays, and a cleared region is a tick
in a list. The run has no shape — each case is a fresh isolated puzzle, which is the same defect the
season-shape review found one layer down, in the boards themselves.

---

## The shape: a body is a tree, and illness comes in at the doors

The body graph already in `body.ts` is a tree with the heart at the root and five branches:

```
sinus → throat → HEART                    handR → shoulderR → HEART
                                          forearm → shoulder → HEART
footL → kneeL → gut → stomach → HEART     lungL, lungR → HEART
footR → kneeR → gut → stomach → HEART
```

The tips are where illness gets in, and **the case fiction already says so**: a kitchen knife
(forearm), a splinter (hand), new boots (foot), the shellfish (stomach), grass season (sinus),
someone coughed on the train (throat). The interior regions are the ones nothing enters directly,
and their stories already read that way: *"the cough that stayed a fortnight"* (lung), *"you had
this in the spring, it never really left"* (gut).

So `body.ts` gains one flag beside `core` and `connective`:

| Kind | Nodes | What it is |
|---|---|---|
| **entry** | forearm, handR, footL, footR, sinus, throat, stomach | A door. Outbreaks start here. |
| **interior** | lungL, lungR, gut | Reached only by something spreading inward. |
| **connective** | shoulder, shoulderR, kneeL, kneeR | Joints. Pass-through; never a case. |
| **core** | heart | What the whole run is protecting. |

Seven doors and three interior regions is the ten case-bearing regions the map already counts.

**This is what makes holding ground a decision rather than a chore.** There is no single front to
push; there are six ways in, and one of you. You can fight it at a tip — cheap, far from the core,
but there are a lot of tips — or fall back and hold a chokepoint, where the throat covers the whole
head and the stomach covers both legs and the gut. Fewer fights, and a bigger loss if it breaks.

---

## The day: your move, then its move

**You get one action a day.**

- **Fight a hot region.** Win and you hold it; lose and it stays hot.
- **Shore up a region you hold.** Spend bank, add a day of resistance to that wall.

**Then the sickness takes one step**, at whichever of its fronts is closest to the heart. One step
per day whatever else is happening, so the rhythm is one-for-one: you take a region, it takes a
region. It is deliberately predictable — the player can see which fire is about to get worse, and
plan against it, which is the difference between pressure and harassment.

A step is: take an adjacent node it does not already hold. Joints are taken like anything else and
cost it a day, but carry no case — they are the corridor between an arm and the core.

**Separately, every few days a new outbreak opens a door.** That is the second pressure, and it is
what stops the run collapsing into a single wedge: a season of illness is things happening to you,
not one thing walking slowly inward. Which door is a seeded roll over the entry points that are not
already hot **and that the player is not holding**. A cleared door has earned immunity and a
standing wall behind it, and that is exactly what stops a new infection taking hold there — so a
held door is defended rather than rolled against. Ground the player took is only ever lost the way
any other held ground is lost, by a siege that costs the sickness days.

---

## Immunity: one number, three effects

The memory response for a strain is the count the immunity screen already shows: how many times you
have cleared a case crediting that strain, 0 to `IMMUNITY_MAX`. It now does three things.

### 1. At the door, it is a chance — this is what a vaccine really does

When an outbreak tries to open a door, the response for that door's strain is the chance it **does
not take hold**. You were exposed and nothing came of it. At zero it always takes; at three it
usually does not.

A roll rather than a number because that is what immunity is: you can still catch flu with a flu
jab, you are just far less likely to. It is also where drama belongs — "it got in through the
throat, of all days" is a story, and a story is what a season should generate.

Rolled off the run's own seeded generator with the state written back, exactly as `scheduleDormancy`
does, so a run is reproducible from its seed and the harness measures a season rather than a shuffle.

### 2. At the wall, it is days — and never a roll

Held ground is a wall. Breaking it costs the sickness **`response + 1` days**, during which the
region is under attack and visibly so, and the step it spends there is the step it does not spend
somewhere else. Shoring up with bank adds days to the same counter.

Deterministic on purpose, and this is the one place the design deliberately departs from biology.
**Luck should decide what happens to you; it should never undo work you did well.** A wall you built
and reinforced evaporating to a bad roll is the kind of loss a player blames the game for.

### 3. In the fight, it is help arriving

During a case, each strain in the wave sends **free, weak, expiring, strain-specific antibodies**,
scaled by the response for that strain — roughly one per wave at a single clear, a steady trickle at
three. They take no build spot and cost nothing.

This is `2026-07-26-immune-response-design.md` unchanged, including its reasoning: build spots are
the game's central scarcity, and immunity is the one thing that should let a player *bypass* that
scarcity rather than merely improve within it. Its stated blocker also stands unchanged — see
"What has to be measured".

---

## The heart, and the end of a run

**The heart falls when every road to it is taken**: throat, lungL, lungR, stomach, shoulder,
shoulderR. Not a countdown and not a single breach — the sickness has to hold every approach at
once, which is why it has to sprawl, and why "keep one road open" is a defensive priority a player
can hold in their head without a tutorial.

When the last road falls the heart turns hot, and the next day is **the heart case**: an eleventh
case, and the first time the thing the game is named for is the thing on the board. Win it and the
sickness is pushed off the core and has to come again. Lose it and the run is over.

That answers the case-rules design's own open question — *"does the heart ever get attacked
directly, or is it only ever the thing being protected?"* — with yes, once, at the end.

**A run is won by holding all ten regions at once.** The sickness has nowhere left to be.

---

## What this cashes, and what it deletes

**MMR and Chickenpox stop being purchases.** The season screen's rule is **EARNED, NEVER BOUGHT**,
and *"costs a day you don't fight"* was quietly breaking it — a vaccine is not a thing you shop for
with time, and once days cost something, spending one on a jab is a game-design fiction wearing a
medical hat. Both become what the strain vaccines already are: earned at a gate, applied
automatically, with copy that says what they do rather than what they cost.

- **MMR** — earned at its gate, blocks the amnesia wipe. `vaccines.ts` loses its `cost` line.
- **Chickenpox** — earned at its gate: a region you hold can never be reopened. That is the rule
  this whole design gives it something to say.

**The bank gets its sink: shore up.** Spend it to add days to a wall. It is the only thing that
competes with fighting for your one action a day, and it is a defensive spend of a resource earned
by winning — which is a better shape for it than a shop.

---

## One change underneath: the dock unlocks on days, not clears

`DefenderStats.unlock` and `MaturedForm.unlock` currently count *cases cleared*. With a dynamic
front a player can arrive at day-six content having lost twice, and a three-cell dock against that
content is unwinnable — a loss compounding into a worse loss, which is the failure mode this design
is most likely to produce.

So both become **days elapsed**. The body learns whether or not you won. It also keeps the existing
tuning honest: day and case index still track each other, so the sweep goes on measuring case *i* at
tier *i*, and every rate in `cases.ts` survives.

---

## What has to be measured

**The harness measures boards; this design is about runs.** Every number here — seed rate, step
rate, the wall's `response + 1`, the door's chance, how many antibodies a response sends — is a
pacing number, and pacing is a property of a whole season rather than of one case. Choosing them by
feel would be the exact mistake `balance.sweep.ts` exists to prevent.

Two instruments are needed, and neither exists:

1. **A run-level sweep.** Play whole seasons headlessly — the map layer is pure and seeded, so this
   is cheap — over a spread of seeds and a policy for what the player does with each day. What it
   reports is the shape of a run: how often the heart is reached, how many regions are held at the
   end, how long a run lasts. The band and the curve stay what they are for individual cases; this
   is a second gate over the layer above them.
2. **A sweep that can see units nobody bought.** `playBoard` assigns a kind to each of five spots
   and the economy fills it in; free arriving antibodies are not on the board and are invisible to
   it. Until that is fixed, every clear rate in the project is a number about a game nobody plays.
   This is the immune-response proposal's own stated blocker and it has not moved.

**The free-antibody half of the memory response must not ship before instrument 2.** The rest of
this design can, because none of it changes what happens inside a fight.

---

## Open questions

- **Does a lost run end, or roll over?** "Start a new body" already exists. A run that ends at the
  heart with a body full of earned immunity going in the bin is a harsh read; carrying immunity into
  the next body is a roguelike meta-layer this design has not asked for.
- **How much does a player see of the sickness's plan?** It steps at the front closest to the heart,
  which is knowable — should the map say so outright, or should the player work it out?
- **What does a second clear of the same region do?** Retaking ground you lost is the common case,
  and if it credits the strain again a player could farm one region for immunity.
- **Is one action a day the right budget** once shoring up competes with fighting? Two actions with
  a harder sickness is a different game with the same parts, and only a run-level sweep can say
  which is better.
