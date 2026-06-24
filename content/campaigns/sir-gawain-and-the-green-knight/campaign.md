---
type: Campaign
title: Sir Gawain and the Green Knight
id: campaign.gawain-green-knight
description: A chivalric test of one knight's honor, set against an Arthurian winter. A bargain, a journey, a temptation, and a reckoning.
tags: [seed, public-domain, arthurian, contained]
timestamp: 2026-06-24T00:00:00Z
calendar: Arthurian (Christmas to the following Christmas)
---

## Premise

On New Year's at Camelot, a towering green-skinned knight rides into King Arthur's
hall and proposes a game: any knight may strike him one blow with his own axe, if
that knight will seek him out in a year and a day to receive a blow in return. Sir
Gawain accepts and beheads the stranger — who calmly retrieves his head and rides
off, reminding Gawain of the appointment at the Green Chapel.

The campaign follows Gawain keeping that bargain: the long journey north, a
midwinter sojourn at a strange lord's castle where a second, quieter game is
played, and the final reckoning at the Green Chapel — where honor, fear, and a
small concealed failing are weighed.

## Tone

Chivalric, wintry, morally serious but not grim. Stakes feel mortal yet the heart
of the story is **a test of character, not a body count** — which fits Bardcast's
"failure is usually a setback, death is a rare hard constraint" rule
(`docs/story-engine.md §4`). The defining tension is internal: courage and courtesy
versus self-preservation.

## The quest spine

Four beats, each a [QuestBeat](./quest/index.md):

1. [The Beheading Game](./quest/beats/01-the-beheading-game.md) — the bargain is struck.
2. [The Journey North](./quest/beats/02-the-journey-north.md) — the perilous winter road.
3. [The Exchange of Winnings](./quest/beats/03-the-exchange-of-winnings.md) — the castle, the hunts, the temptation.
4. [The Green Chapel](./quest/beats/04-the-green-chapel.md) — the blow is repaid; the truth revealed.

## Type vocabulary

This bundle uses these OKF `type` values (small and documented, per the OKF plan):
`Campaign`, `Location`, `NPC`, `Item`, `Faction`, `QuestBeat`. Each concept carries
a stable `id` (e.g. `place.camelot`) that bridges to the protocol record layer.
