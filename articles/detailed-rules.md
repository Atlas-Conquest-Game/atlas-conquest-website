---
title: "Detailed Rules"
slug: detailed-rules
author: "Atlas Conquest Team"
date: 2026-05-24
summary: "The full rulebook for Atlas Conquest, from the basics of a turn to territory, battle, abilities, keywords, commanders, and setting up a game."
hero_image: map.png
tags: [rules, reference]
---

Atlas Conquest is a two-player competitive card battler played on a hex-grid board. This page starts with the basics and adds detail as it goes, so you can stop reading whenever you're ready to play.

## Overview

Each player leads an army with a **commander**. Your goal is to reduce the enemy commander's {health} Health to 0 before they do the same to you.

Players take turns. On your turn you can:

- **Play cards** from your hand, paying for them with mana.
- **Move** your characters around the map.
- **Battle** enemy characters.
- **Claim** tiles with your commander to grow your territory, and with it your mana.

The rest of this page explains each of these.

## The Map

Each player's **territory** is the tiles they own: yours is outlined in green, your opponent's in red. A game starts with each commander on its starting tile, which is the only tile its player owns.

![The Dunes map at the start of a game: your commander's starting tile at the bottom left (green outline), your opponent's at the top right (red outline), and two villages in the middle](map-dunes.jpg){: .wide }

The map has three kinds of tile. Everything else, like desert, snow, or jungle, is just scenery.

- **Normal tiles** give {mana_1} each turn while you own them.
- **Villages** give {mana_2} each turn while you own them.
- **Mountains** can only be entered by characters with Flying.

Each game is played on one of three maps: Dunes (above), Snowmelt, and Tropics.

![The Snowmelt map at the start of a game: starting tiles on the left (green outline) and right (red outline), around a center of villages and a lake ringed by snowy mountains](map-snowmelt.jpg){: .pair }
![The Tropics map at the start of a game: starting tiles on the left (green outline) and right (red outline), three central villages between two mountains, and volcanoes in the corners](map-tropics.jpg){: .pair }

## Mana and Cards

At the start of each of your turns, you draw a card and your mana refills to what your territory gives. Mana you don't spend is lost when your turn ends. You begin the game owning a single tile, so claiming more land is how you afford bigger cards.

Every card costs mana to play. There are two kinds:

- **Minions** join the board as characters. Play one onto an empty tile in your territory. A minion can't move or battle on the turn you play it.
- **Spells** have a one-time effect.

![Anatomy of a card — a minion and a spell side by side, labelling mana cost, patron color, name, text, subtype, and the minion's power, speed and health](card-anatomy.png){: .wide }

## Characters

Commanders and minions are both **characters**. Characters stand on tiles, and each has three stats:

- {power} **Power**: the damage it deals in battle.
- {speed} **Speed**: how many tiles it can move each turn.
- {health} **Health**: the damage it can take before it's destroyed.

## Movement and Battle

Each turn, each of your characters can move up to its {speed} Speed in tiles. Drag it to where you want it to go.

[[video:movement.mp4|A minion with 3 Speed is dragged along a three-tile route and walks it, its Speed badge counting down from 3 to 0]]
A minion with {speed_3} is dragged along a three-tile route. The tiles it can reach are outlined, and its Speed badge counts down to {speed_0} as it moves.

Characters can pass through tiles held by your other characters, but not through enemies, and must end their move on an empty tile.

To **battle**, drag a character onto an enemy next to it. Both deal damage equal to their {power} Power to each other at the same time. A character whose {health} Health reaches 0 is destroyed. If the defender is destroyed, the attacker moves into its tile.

[[video:battle.mp4|Heavy Cavalry attacks Guerilla Gorilla. Both take damage at once, the Gorilla dies, and the Cavalry moves into its tile with 5 Health left]]
[[card:Heavy Cavalry]] ({power_5}{health_8}) attacks a [[card:Guerilla Gorilla]] ({power_3}{health_4}). Both deal damage at the same time: the Gorilla is destroyed, and the Cavalry, down to {health_5}, moves into its tile.

A few more details:

- Each character can battle once per turn.
- Battling uses 1 movement, so a character needs at least 1 movement left to attack.
- Damage stays between turns. Characters don't heal unless a card heals them.
- Commanders have no Power. They can't start a battle and deal no damage when attacked, unless a card gives them Power.

## Claiming Territory

Once per turn, your commander can **claim** the tile it's standing on, if that tile is unclaimed and next to your territory. Claiming is free: it doesn't use the commander's movement or attack. A newly claimed tile starts giving mana at the start of your next turn.

Your territory can only grow as large as your commander's {dominion} Dominion. When you reach that limit, you have to **unclaim** a tile before you can claim another: right-click a tile you own and choose to unclaim it. Right-clicking any tile also shows its details.

You can't claim tiles your opponent owns, though some cards can.

## Abilities

Some characters have abilities, shown as circles along the top of their token. Hover over one to read it. There are three kinds:

- **Static** abilities are always on, like Flying.
- **Triggered** abilities happen by themselves when something occurs. For example, an **Arrival** ability happens when its minion is played.
- **Activated** abilities are ones you choose to use: click the ability, or drag it onto a target.

Activated abilities sit in the top-left and top-right circles; static and triggered abilities sit in the top-center.

[[video:ability-activated.mp4|Blinkshot's activated ability lights up its range, targets an enemy Runic Knight two tiles away, and the shot destroys it]]
An **activated** ability: [[card:Blinkshot]] uses *[Cooldown 2, Range 2]: Deal 4 damage to target character.* Its range lights up, it targets an enemy [[card:Runic Knight]] two tiles away, and the shot destroys it.

[[video:ability-arrival.mp4|Darkwing is played next to its commander. A blast hits the board: the enemy Owl Familiar dies, the enemy Gorilla and the player's commander take 2 damage, and Darkwing is unharmed]]
A **triggered** ability: [[card:Darkwing]] is played next to its commander (Commander-Deploy), and its Arrival fires: *Deal 2 damage to ALL non-Daemon characters.* The enemy [[card:Owl Familiar]] is destroyed, the enemy [[card:Guerilla Gorilla]] and your own commander take 2 damage, and Darkwing, a Daemon, is unharmed.

## Reading Card Text

Hover over a card to see what each keyword in its text means.

Card text uses the stat icons in place of numbers. A number inside an icon is an amount of that stat: "Gain {mana_2} this turn" gives you 2 extra mana, and "Target minion gains +{power_1}{speed_1}{health_1}" gives it +1 Power, +1 Speed, and +1 Health.

Common keywords:

- **Arrival**: happens when the card is played.
- **Flying**: can enter mountains.
- **Haste**: can move and battle on the turn it's played.
- **Trample**: after destroying an enemy in battle, can battle again that turn.
- **Deploy**: can be played outside your territory.
    - ***X*-Deploy**: can be played outside your territory, next to *X*. For example, *Commander-Deploy* means next to your commander.
- **Legendary**: you can't play it while you control a copy of it.
- **Range *N***: the effect reaches up to *N* tiles from its source. For spells, the source is your commander.
- **Radius *N***: the effect hits everything within *N* tiles of its target.
- **Cooldown *N***: after use, the ability can't be used again for *N* of your turns.

## Commanders

Your commander is on the board from the start, and when it falls, you lose.

![Anatomy of a commander — patron color, activated ability, text, subtype, and the dominion, intellect, speed and health stats](commander-anatomy.png){: .wide }

Like other characters, commanders have {speed} Speed and {health} Health. They also have two stats of their own:

- {dominion} **Dominion**: the most tiles you can own at once.
- {intellect} **Intellect**: your maximum hand size. If you have more cards than this when your turn ends, you choose which to discard.

Each commander also has its own text, with bonuses and abilities such as Claim.

### Patrons

Every commander serves a **patron god**, shown by the color of the card. Your deck can only contain cards of your commander's patron, plus neutral (beige) cards.

- **Skaal** (red): war. Strong, aggressive minions and destructive magic.
- **Grenalia** (green): nature. Mana growth, poisons, and big minions.
- **Lucia** (white): light. Unified armies, healing, and villages.
- **Shadis** (black): death. Relentless minions, powerful removal, and death synergies.
- **Archaeon** (blue): knowledge. Efficient card draw, spellcasters, and tempo plays.

![The current patron gods](patron-gods.png)

## Setting Up a Game

- **Your deck** has 40 to 60 cards, with no more than 3 copies of any card.
- **The first player** is chosen at random.
- **Your opening hand**: you look at as many cards as your commander's {intellect} Intellect and keep 3 if you're going first, or 4 if you're going second. The rest are shuffled back into your deck.
- **Going second**, you also get a [[card:War Chest]]: a free spell that gives you {mana_1} that turn and again at the start of your next turn.

## How a Game Ends

You win when the enemy commander's {health} Health reaches 0. You also lose if you have to draw a card from an empty deck, or if you concede.
