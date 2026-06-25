---
type: Campaign
title: Journey to the West
id: campaign.jttw
description: An ensemble pilgrimage west to fetch sacred scriptures — a gentle monk and his unruly, powerful disciples against a road of demons. Episodic, node-based, and as often comic as perilous.
tags: [seed, public-domain, chinese-classic, ensemble, episodic]
timestamp: 2026-06-25T00:00:00Z
calendar: Tang dynasty pilgrimage (mythic-historical)
party_size:
  min: 3
  ideal: 4
  max: 5
---

## Premise

A devout monk is charged by the bodhisattva Guanyin to travel west and retrieve sacred
scriptures. He cannot survive the road alone, so he gathers disciples — each a powerful,
flawed spirit working off an old sin: a sky-defying adept of immense strength, a
gluttonous shape-shifter, a steady penitent. Together they escort the monk through a
long succession of demons, temptations, and tricks, each of which would devour him if it
could.

## Tone

Comic, picaresque, and supernatural, with real stakes and real moral weight. The monk is
gentle to a fault; the disciples are mighty but quarrelsome. The running tension is **the
party against itself** as much as against the demon of the week — the monk's mercy
repeatedly endangering them. Failure is usually a setback (capture, separation, a
disciple banished in anger); death is the rare hard constraint (`docs/story-engine.md §4`).

## The quest spine

Two arcs (see [Quest](./quest/index.md)):

1. **The Gathering** — a short *plotted* prologue: the monk frees and binds his
   disciples. Establishes who each player-disciple is.
2. **The Tribulations** — a *node-based* pilgrimage (Alexandrian; `docs/canon-compiler.md §5`):
   a pool of largely self-contained demon-encounters the DM selects among, each a chapter.
   Three representative episodes are seeded (one combat, one trick, one resolved only by
   petitioning heaven) to exercise the resolution vocabulary.

## The party are the disciples

As Gawain models a player-knight, the disciples model **player-fillable slots** (see
[Cast](./cast/index.md)). The monk is an NPC the party escorts and protects — the stake,
not a player. Players bring their own characters into the disciple roles.

## Type vocabulary

`Campaign`, `Location`, `NPC`, `Item`, `Faction`, `CharacterSlot`, `Arc`, `QuestBeat`.
**`CharacterSlot` and `Arc` are new vs. the Gawain bundle** — surfaced by authoring this
second case; see the schema-delta note in `docs/canon-compiler.md`. Each concept carries
a stable `id` (e.g. `npc.tripitaka`) that bridges to the protocol record layer.
