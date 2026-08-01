# Pathogen research and the immune response

**Date:** 2026-07-26. **Revised 2026-08-01**, substantially — see "What changed on 2026-08-01".
**Status:** Proposal, not approved
**Depends on:** the front line shipped in `src/game/front.ts`, and a sweep that can see units nobody bought
**Superseded in part by:** `2026-07-31-between-cases-design.md`, which built two of this document's
three effects and deleted its "immunisation costs a day" section outright

---

## What changed on 2026-08-01

This document originally proposed one thing: free strain-specific units arriving mid-fight. Since
then the between-case layer shipped, and it took **two thirds of this idea with it** — the memory
response is already a chance an outbreak never takes hold, and already the days of wall a held
region stands for. Both are measured and in the game.

What is left is the half a player can *see*: help arriving on the board. The revision below is not a
restatement of the original shape. Four things are different, and each of them came from asking what
antibodies actually do rather than what a tower-defence reinforcement usually does:

1. **Help is ammunition, not troops.** It arrives with a fixed number of uses and leaves when spent,
   rather than standing on the board for a duration.
2. **It lands where the player already committed** — at mount points clustered around the build
   spots — rather than at the vessel entry or wherever it is needed.
3. **The player calls it, by tagging.** It is not a drip.
4. **It is a pair that needs each other:** antibodies that mark, and killers that can only kill what
   is marked.

The original open question — *"does a response spawn at the vessel entry and walk, or appear where it
is needed?"* — is answered by 2, and the answer is neither.

---

## The problem it solves

Exposure already earns something permanent. Clearing a strain three times earns its vaccine, and
since the front line shipped that vaccine is real in two places: an outbreak of that strain is less
likely to take hold at a door, and ground credited to it stands longer under siege.

Both of those happen on the map, between fights, in numbers. **Neither happens while the player is
looking at a board.** The one screen where the player is actually paying attention is the one screen
where their earned immunity does nothing they can see.

This puts it on the board.

---

## The core idea, still: specificity

An antibody response is strain-specific. A tetanus response does nothing to flu.

That is true to the biology and it is the most interesting thing here mechanically, because it stops
immunity being a flat power curve and makes it a **matchup**. A wave of Staph in a region you have
fought Staph in three times is genuinely easier. The same wave with Biofilm mixed in is not. Breadth
beats depth, and the player feels which strains they have neglected.

It also gives the Amnesia rule its teeth. Measles wiping an earned immunity is a line of text today;
it is a visible loss once immunity is something you can watch working.

---

## Help is ammunition, not troops

**Antibodies do not kill anything.** Their effector functions are neutralisation, opsonisation and
antibody-dependent cellular cytotoxicity — they mark a pathogen so that phagocytes and killer cells
deal with it. Opsonisation is, in plain terms, tagging something so the eaters bite. That is already
what this game's antibody cell does, which is the strongest sign the fiction and the mechanic are
pointing the same way.

**And against a particulate target, an antibody is consumed.** Bound to membrane antigen — a
bacterium, a virion, anything with a surface — it is internalised with what it bound and degraded
alongside it. Only soluble antigen gets the recycling route. Every pathogen in this game has a
surface, so *limited uses* is the biologically true answer rather than a balance compromise.

**Decay is real but on the wrong timescale to model.** IgG half-life is roughly three weeks, longer
later in a biphasic curve. A case lasts minutes. Within a fight, decay rounds to nothing.

So an arrival carries a number of uses and leaves when it is out. No timer, and in particular no
timer the player cannot see. A thing that vanishes on a hidden clock is a thing the player learns to
distrust; a thing that leaves when it has been spent is a thing they can count.

---

## Where it lands: mount points, clustered on the build spots

Each case authors a set of **mount points** — positions help can arrive at, drawn from content the
same way build spots are, and never buildable by the player.

They cluster around the build spots on purpose. **The body reinforces where the player committed.**
Help that arrived wherever it was most needed would be the game quietly correcting a bad board, which
takes the decision away; help that arrives beside the cells you chose to place makes your placement
matter *more*, because it is what the help is standing next to.

Mount points answer to the same discipline as build spots. A mount point covering no vessel is dead
content, and `coverage.ts` can already say so — the dwell floor in `content.invariants.test.ts` is
the shape of that check, and it applies here unchanged.

They are hidden until they fire. What the player sees is the arrival, on a beat they caused.

---

## What calls it: tagging

Presenting antigen is what recruits a response, so the antibody cell earns a second job. It is the
only cell in the dock whose blurb has to open with an apology — *"Kills little"* — and this is what
it is compensated with.

```
each enemy tagged, of a strain the profile has memory for   →  recognition += 1

recognition reaches RECOGNITION_PER_CALL                    →  spend it, and roll
    chance = response(strain) × RESPONSE_PER_CLEAR

on success                                                  →  one arrival at a free mount point,
                                                               carrying its uses
```

Three properties fall out of that rather than needing to be written as rules:

- **A strain you have never cleared summons nothing.** No memory, no secondary response. The formula
  says it; no special case is required.
- **The player controls the rate.** A board with two antibodies calls help twice as often as a board
  with one. That is a real decision about a cell that was previously bought for utility alone.
- **It cannot be farmed off nothing.** Recognition comes from marks, marks come from bodies, and
  bodies are what the wave table sends.

`recognition` is per strain and carries across waves within a case, for the same reason the allergy
rule's inflammation counter does: a running total of the response, not of a wave.

---

## What arrives: a pair that needs each other

Two kinds, and the second is useless without the first.

**Antibody arrivals** lay marks in a radius. Each mark spends one use. They do no damage — a mark
strips armour, burns, and pays more on the kill, all of which the simulation already models on
`enemy.tag`.

**Killer arrivals** kill, but **only what is already marked**. That is ADCC, named and real: the
killer cell in a secondary response does not choose targets on its own, it destroys what antibody has
flagged.

The dependency is the whole design. A free killer that could hit anything would stack with every
board and make placement matter less — the failure mode this proposal has to avoid, because free
units that bypass the build-spot limit are the strongest thing the game could hand out. A free killer
that can only touch marked bodies is worth **exactly as much as the player's own tagging makes it
worth**, and nothing on a board that never marks anything.

### What memory buys

The biology hands over the progression. A first exposure produces IgM: slow, low affinity. Repeat
exposure produces IgG, which is the isotype ADCC actually runs on.

| Memory for the strain | What arrives |
|---|---|
| 0 clears | Nothing. No memory, no secondary response. |
| 1–2 clears | Antibodies. Marks, no teeth. |
| 3 clears — the vaccine held | Antibodies **and** killers. The marks now get exploited. |

That gives the immunity counter a third meaning and it needs no new copy to explain: **holding the
vaccine is what turns help into help that kills.**

---

## What this touches

| Area | Effect |
|---|---|
| `content/cases.ts` | Every case authors mount points, clustered on its build spots |
| `content/rules.ts` | `RECOGNITION_PER_CALL`, `RESPONSE_PER_CLEAR`, uses per arrival — all measured |
| The simulation | A recognition counter per strain, an arrival system, ADCC targeting |
| The renderer | Arrivals must read as help coming, and as spending themselves |
| `coverage.ts` | Mount points held to the same dwell floor as build spots |
| Every clear rate in the project | See below |

---

## The balance risk, stated plainly

**This makes every case easier, so every case has to be measured again.** Free marks make phagocytes
better and the antibody cell less mandatory; free kills move it further. All eleven rates in
`cases.ts` will shift, and the season will need re-tuning back inside the band and past both curve
checks. That is not a side effect of this feature, it *is* most of the work.

Do not tune this by feel. The rule this repository has held to since the balance sweep landed is that
a balance number is measured, and the measurement is written down beside the constant.

---

## What has to be measured, and the good news

The original version of this document called the harness the blocker: *"the sweep plays every
affordable board, and a memory response is not on the board."* That was too pessimistic, and the
mount-point design is why.

Arrivals are a deterministic function of the case, the profile's immunity, and the run's seed.
`playBoard` already takes an immunity record. So arrivals are part of the **environment**, not part
of the board, and the enumeration of boards never has to change — the sweep simply plays with them
present.

What remains is entanglement: a clear rate would no longer say whether the board is good or the help
is. The repository has already solved that exact shape once. `MaturationPolicy` crossed with
`GrowableSet` measures growth as an axis rather than baking it in, and reports the difference. Do the
same here: sweep with arrivals and without, and **the difference is what the memory response is
worth**, per case and per strain.

So this needs an axis on an instrument that exists, not a new instrument. That is a much smaller
piece of work than the original blocker implied, and it is the first task of any plan built from
this document.

---

## Open questions

- **How many mount points, and how tightly clustered?** Too close to a build spot and help is just a
  sixth cell; too far and it lands where nothing exploits it.
- **Does an arrival occupy its mount point while it lasts**, so two arrivals cannot stack on one
  position? Probably yes, or a lucky run concentrates everything on the best spot.
- **Does the mark an arrival lays differ from the one the player's antibody lays?** Same duration is
  simplest. A shorter one would make arrivals support rather than replace.
- **What happens on an amnesia case?** The wipe already masks a strain to zero at the boundary, so
  arrivals for it stop by construction — worth confirming that reads as intended rather than as a
  bug, since it is the most dramatic thing the amnesia rule could do.
- **Does a killer arrival that finds nothing marked wait, or leave?** Waiting is kinder and risks a
  cell loitering; leaving is honest and risks the player never seeing what they earned.
