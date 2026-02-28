# Atlas Conquest — Videogame Repository Guide

> Reference for navigating Matan's Unity game repo. Located at `../Atlas Conquest Videogame/atlas-conquest/atlas-conquest/`.

## What It Is

A **multiplayer turn-based strategy card game** built in **Unity 6** (version 6000.0.62f1) using **Unity Netcode for GameObjects** for networking. Written in **C#** with a server-authoritative architecture.

## Top-Level Structure

```
atlas-conquest/
├── Assets/                    # Everything lives here
│   ├── Code/Scripts/          # 333 C# files across 14 subsystems
│   ├── Resources/             # Loadable data: cards, commanders, images, sounds, maps
│   ├── Sprites/               # UI sprite sheets, particles, backgrounds
│   ├── Scenes/                # Unity scenes (MainMenu, Board, DeckEditor, etc.)
│   ├── Prefabs/               # Reusable game objects
│   ├── Plugins/               # 32 third-party asset packs
│   ├── Fonts/                 # Font files
│   └── Shaders/               # Shader graphs
├── ProjectSettings/           # Unity config
└── project_overview.md        # Comprehensive architecture doc (1,482 lines)
```

## Where the Code Lives

All game logic is in `Assets/Code/Scripts/`, organized by subsystem:

| System | Path | What It Does |
|--------|------|--------------|
| Board | `Scripts/Board/` | Hex grid, tile management, map operations |
| Game | `Scripts/Game/` | Actions, events, effects, animation steps |
| Network | `Scripts/Network/` | Connections, lobbies, RPCs, state sync |
| Card | `Scripts/Card/` | Card definitions, abilities, effects |
| Character | `Scripts/Character/` | Stats, movement, combat, display |
| Player | `Scripts/Player/` | Player UI and stats |
| Deck | `Scripts/Deck/` | Deck management, drawing, building |
| UI | `Scripts/UI/` | Menus, inputs, HUD components |
| FX | `Scripts/FX/` | Visual effects and animations |

Key files: `GridManager.cs` (board state), `GameNetworkManager.cs` (game flow/turns), `Character.cs` (core unit model), `Card.cs` (base card type).

## Where the Assets Live

### Images — `Assets/Resources/Images/`

| Folder | Contents | Count | Sizes |
|--------|----------|-------|-------|
| `Artwork/` | Card & character artwork (PNG) | 289 files | 500KB–7.4MB each |
| `LoadingPortraits/` | High-res character splash art | 16 files | 6–16MB each |
| `Logo/` | Game icon + faction emblems | ~10 files | 300KB–600KB |
| `Logo/Patron Icons/` | Colored faction circle badges | 9 files | 300–610KB |
| `Background/` | Background photos/art | — | — |
| `Texture/` | UI textures, gradients, masks | 20+ subdirs | — |
| `Character/` | In-game character sprites | 24 subdirs | — |
| `Player/` | Player UI elements | 16 subdirs | — |

### Other Resources

| Folder | Contents |
|--------|----------|
| `Resources/Commanders/` | 17 commander ScriptableObjects (stats, abilities) |
| `Resources/Cards/` | Card data + ability system (effects, targets, conditions) |
| `Resources/Maps/` | Map definitions: Dunes, Snowmelt, Tropics (.asset files) |
| `Resources/Tiles/` | 78+ hex tile types (terrain scriptable objects) |
| `Resources/Sounds/Music/` | Background music (WAV) |
| `Resources/FXAnimations/` | Spell/ability animation configs |

### Sprites — `Assets/Sprites/`

Sprite sheets for in-game UI: `cards.png`, `BG2.png`, `BG3.png`, `clouds.png`, `particles.png`, etc.

## Assets We've Already Copied

These have been resized for web and live in our `site/assets/` folder:

| Source | Destination | Notes |
|--------|-------------|-------|
| `Artwork/*.png` (17 commanders) | `site/assets/commanders/` | Resized to 400px |
| `Logo/Patron Icons/*-C.png` (6 factions) | `site/assets/factions/` | Resized to 200px |
| `Logo/atlas-conquest-icon.png` | `site/assets/logo/` | Resized to 256px |

## Assets Worth Grabbing in the Future

- **Card artwork** (`Artwork/` — 289 PNGs): For a card gallery or card detail pages on the analytics site. Would need to resize from full-res to ~300-400px for web.
- **Loading portraits** (`LoadingPortraits/` — 16 PNGs at 6-16MB): Higher-quality alternate commander art. Could use for hero backgrounds or featured commander spotlights. Would need aggressive resizing/compression.
- **Hex tile sprites**: The actual terrain artwork lives inside Unity's tile system (not standalone PNGs). Extracting these would require Unity or manual screenshot work.
- **Map layouts**: `Maps/*.asset` files define tile positions but aren't images. Screenshots of actual maps would need to come from the game itself.

## Architecture Notes

- **Server-authoritative**: Server runs all game logic, clients send RPCs for actions, NetworkVariables sync state.
- **Singleton pattern**: GridManager, GameNetworkManager are global singletons.
- **Event-driven**: Extensive UnityEvents for cross-system communication (ServerTurnBeginEvent, etc.).
- **Modular ability system**: Effects, Targets, Conditions, Quantities, Abilities as ScriptableObjects — very composable.
- **6 scenes**: MainMenu, Lobby, OnlineBoardScene, DeckEditor, LoadingScreenScene, MapMakerScene.
- **Full docs**: `project_overview.md` at repo root has 1,482 lines of architecture documentation.
