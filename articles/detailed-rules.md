---
title: "Detailed Rules"
slug: detailed-rules
author: "Atlas Conquest Team"
date: 2026-05-24
summary: "The full rulebook for Atlas Conquest — the map, characters, movement and battle, abilities, card keywords, unclaiming, and commanders."
hero_image: map.png
tags: [rules, reference]
---

Welcome to Atlas Conquest: a grid-based strategy game that combines the very best of both board and card games!

## Overview

Each player builds and plays a deck of at least 40 cards. Each player also selects a commander to helm their strategy. The goal of the game is to reduce the opposing commander's health to 0 before they can do the same to you.

## The Map

The map is a hexagonal grid. Commanders start in the same two positions each game, at opposite sides of the map. Initially only each commander's starting tile is claimed.

![The Dunes map, one of Atlas Conquest's battle maps](map.png)

Tiles present on the map at the start of the game fall into a few types:

- **Normal tiles** — can be occupied by any character, and grant 1 mana each turn if claimed.
- **Villages** — can be occupied by any character, and grant 2 mana each turn if claimed.
- **Mountains** — normal tile that can't be occupied by characters without Flying.

There is no functional difference between the different normal tiles on the map such as the deserts, rocks, cacti, or oasis. Claiming a tile does not immediately grant its mana — you will receive the increased mana at the start of subsequent turns.

You can right-click on a tile to display details of the tile, including its type, as well as the option to unclaim the tile, for when you need to make shifts in your territory once your maximum dominion has been reached.

Cards may also create special tiles with unique abilities not present on the starting map.

There are currently three maps in the game. Each one brings with it its own gameplay dynamics, so be sure to check out them all!

![The Snowmelt map](map-snowmelt.png)

![The Tropics map](map-tropics.png)

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

- **Skaal (Red Card Border)** — *Goddess of War*. Strong, aggressive minions, destructive magic.
- **Grenalia (Green Card Border)** — *Goddess of Nature*. Mana growth, poisons, big minions.
- **Lucia (White Card Border)** — *Goddess of Light*. Unified armies, healing, villages.
- **Shadis (Black Card Border)** — *god of death.* Unrelenting, powerful removal, death synergies.
- **Archaeon (Blue Card Border)** — *knowledge and information.* Efficient card draw, spellcasters, tempo plays.

![The current patron gods](patron-gods.png)
