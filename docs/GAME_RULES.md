# Atlas Conquest — Game Rules Reference

> Condensed from the official playtest guide. Used to inform data model and analytics design.

## Core Concept
Competitive 1v1 deck builder on a hex-grid board. Assemble a 40-60 card deck led by a commander. Win by defeating the enemy commander.

## Factions (Patrons)
| Patron | Color | Theme |
|--------|-------|-------|
| Skaal | Red | Goddess of War. Aggressive minions, destructive magic. |
| Grenalia | Green | Goddess of Nature. Mana growth, poisons, big minions. |
| Lucia | White/Gold | Goddess of Light. Unified armies, healing, villages. |

Decks may only contain cards matching the commander's patron, or neutral (beige) cards.

**Minor patrons.** Alongside the six main patrons and Neutral, three more exist with only a card or two each: **Adora** (Fae), **Mechanus** (Mech) and **Treasure**. They are *not* Neutral — no regular commander lists them, so those cards are unbuildable outside Lazim, whose patron list covers every god (Adora and Mechanus included, but not Treasure). Source of truth: the `Patron` enum and the commander `Patrons` lists in the game repo.

## Cards
- **Minion cards**: Played on a claimed tile. Become a board character.
- **Spell cards**: One-time effects, disappear after use.

### Card Stats (Minions)
- **Power**: Damage dealt in battle.
- **Speed**: Tiles moved per turn.
- **Health**: Damage taken before destroyed. Damage persists.

### Keywords
| Keyword | Meaning |
|---------|---------|
| Arrival | Effect triggers when card is played |
| Trample | On kill, regains attack |
| Haste | Full movement + attack on play |
| Deploy | Can play outside your territory |
| X-Deploy | Can play outside territory if adjacent to X |
| Legendary | Only one copy on board at a time |
| Range N | Effect reaches N tiles from source |
| Splash N | Effect reaches N tiles from target |
| Cooldown N | Ability reusable after N turns |

## Commanders
Special card leading each deck. Starts on the board.

### Commander Attributes
| Attribute | Meaning |
|-----------|---------|
| Dominion | Max tiles claimed at once |
| Intellect | Max hand size + starting hand choices |
| Speed | Tiles moved per turn |
| Health | Damage before losing the game |

All commanders have a **Claim** ability (claim occupied tile, once per turn).

## Decks
- **Minimum**: 40 cards. **Maximum**: 60 cards.
- **Max copies**: 3 per individual card.
- Cards must match commander's patron or be neutral.

### Starter Decks
| Deck | Commander | Patron | Strategy |
|------|-----------|--------|----------|
| Starter Goblins | Captain Greenbeard | Skaal | Fast aggro, goblin synergy, Deploy + Haste |
| Starter Growth | Lubela, Tender of the Wilds | Grenalia | Defensive ramp, big late-game minions |
| Starter Healing | Milo Sunstone | Lucia | Healing synergy, sustained board presence |

## Map
- Hex grid, commanders start at opposite sides.
- **Normal tiles**: 1 mana/turn when claimed.
- **Villages**: 2 mana/turn when claimed.
- **Mountains**: Impassable without Flying.
- Mana from claimed tiles arrives next turn.

## Combat
- Drag character onto enemy-occupied tile to battle.
- Both characters deal power damage to each other simultaneously.
- If defender dies, attacker takes their tile.
- One attack per character per turn. Attacking uses one movement.
