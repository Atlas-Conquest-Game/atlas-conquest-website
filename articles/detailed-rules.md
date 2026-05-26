---
title: "Detailed Rules"
slug: detailed-rules
author: "Atlas Conquest Team"
date: 2026-05-24
summary: "The full rulebook for Atlas Conquest — the map, characters, movement and battle, abilities, card keywords, unclaiming, and commanders."
hero_image: map.png
tags: [rules, reference]
---

## The Map

The map is a hexagonal grid. Commanders start in the same two positions each game, at opposite sides of the map. Initially only each commander's starting tile is claimed.

![The Atlas Conquest hex-grid map](map.png)

Tiles fall into a few categories:

- **Normal tiles** — can be occupied by characters, grant 1 mana each turn if claimed.
- **Villages** — can be occupied, grant 2 mana each turn if claimed.
- **Mountains** — normal tile that can't be occupied by characters without Flying.

There is no functional difference between the different normal tiles on the map such as the deserts, rocks, cacti, or oasis. Claiming a tile does not immediately grant its mana — you will receive the increased mana at the start of subsequent turns.

Cards may also create special tiles with unique abilities not present on the starting map.

There is only one map at the moment, but in the future there will be multiple maps to play on.

## Characters

Commanders and minions are both **characters**. Characters occupy tiles and can move and battle each turn. Characters have three stats:

- **Power**: how much damage they deal.
- **Speed**: the number of tiles they may move each turn.
- **Health**: how much damage they can take before they are permanently destroyed.

## Movement and Battle

You can move each character you control up to their speed each turn. Dragging a minion onto a tile controlled by an enemy character will initiate a **battle**: both characters will deal damage equal to their power to each other.[^1] If a minion's health is reduced to zero or below, that minion dies. Damage persists between turns.

Each character gets one **attack** every turn. Battling an enemy uses the character's attack, meaning you typically can't battle multiple times a turn with the same minion. Battling also uses one movement, and if the defender is destroyed in battle, the attacker will take their place.

[^1]: Commanders typically have zero power and thus won't deal damage when defending in combat.

## Abilities

Some characters have special abilities. These can be passive (**triggered** or **static**) abilities that continuously affect the game, or an **activated** ability which must be used manually by clicking or dragging the ability to a target.

Abilities are represented by circles on the top of each character, with activated abilities in the top-left and top-right corners and passive abilities in the top-center. Mouse over an ability to see the details.

## Card Text

![Example card showing the text box and keyword callouts](card-text.png)

Cards can have a variety of text. Sometimes text is abbreviated, in which case hovering over the card will show the definition of any keywords present in the text box.

Some common keywords:

- **Arrival** — An effect that happens when the card is played.
- **Trample** — On battling and killing an enemy, regains an attack (can battle again).
- **Haste** — When played, has full movement and an attack.
- **Deploy** — Can be played outside your territory.
    - **X-Deploy** — can be played outside your territory adjacent to X (e.g. *Commander-Deploy* means can be played outside your territory if next to your commander).
- **Legendary** — Cannot play another copy while you already own one on the board.
- **Range N** — A distance, *N*, in tiles from the *source* that an effect reaches.
- **Splash N** — A distance, *N*, in tiles from the *target* that an effect reaches.
- **Cooldown N** — The ability can only be used again after waiting *N* turns.

## Unclaiming

When you reach your maximum number of tiles claimed, a gray flag will be displayed by your mana counter. You can drag that to a tile you own to unclaim it. Your commander determines how many tiles you may have claimed at once.

## Commanders

Your commander is a special card chosen to lead your deck in each game. You start with your commander on the board and defeat the enemy commander to win the game.

Commanders have 4 attributes:

- **Dominion** — The maximum number of tiles you can have claimed at once.
- **Intellect** — Your maximum hand size, and the number of cards you choose from for your starting hand.
- **Speed** — Number of tiles they can move each turn.
- **Health** — Amount of damage they can take before losing the game.

Commanders also have a text box which can have static bonuses and/or activated abilities that will influence the game. All commanders also have access to a special **claim** ability that lets them claim a tile they are occupying once per turn.

Finally, commanders have a **patron god** which is represented by the color of the card. You can only play cards in your deck which match your commander's patron, or neutral (beige) cards.

The current main patrons and their themes are:

- **Skaal (Red)** — *Goddess of War*. Strong, aggressive minions, destructive magic.
- **Grenalia (Green)** — *Goddess of Nature*. Mana growth, poisons, big minions.
- **Lucia (White)** — *Goddess of Light*. Unified armies, healing, villages.
- Support for more patrons is coming soon!

![The three current patron gods](patron-gods.png)
