# Design System

> Inspired by clean editorial design (OpenAI blog aesthetic). Minimal, spacious, typographically driven.

## Principles
1. **Content-first**: Data and insights are the hero. UI gets out of the way.
2. **Generous whitespace**: Let elements breathe. Dense data, spacious layout.
3. **Typographic hierarchy**: Size, weight, and color do the heavy lifting — not decoration.
4. **Faction identity**: Skaal orange-red, Grenalia teal, Lucia gold as accent colors. Used sparingly.
5. **Colorblind-safe**: All colors chosen from Okabe-Ito / Wong palette to be distinguishable under all forms of color blindness.
6. **Progressive disclosure**: Show summary first, let users drill into detail.

## Color Palette

### Base
| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#FFFFFF` | Page background |
| `--bg-subtle` | `#F7F7F8` | Card/section backgrounds |
| `--bg-inset` | `#EDEDF0` | Inset panels, code blocks |
| `--text` | `#0D0D0D` | Primary text |
| `--text-secondary` | `#6E6E80` | Captions, labels, muted text |
| `--border` | `#E5E5E5` | Dividers, card borders |

### Faction Accents
| Token | Value | Faction |
|-------|-------|---------|
| `--skaal` | `#D55E00` | Skaal (Orange-Red) |
| `--grenalia` | `#009E73` | Grenalia (Teal) |
| `--lucia` | `#E8B630` | Lucia (Gold) |
| `--neutral` | `#A89078` | Neutral (Beige) |
| `--shadis` | `#4A4A5A` | Shadis (Slate) |
| `--archaeon` | `#0072B2` | Archaeon (Blue) |

### Semantic
| Token | Value | Usage |
|-------|-------|-------|
| `--positive` | `#3A7D44` | Win rates, positive trends |
| `--negative` | `#C44536` | Loss rates, negative trends |

## Typography
- **Font stack**: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Load Inter from Google Fonts (400, 500, 600, 700).

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Page title | 2.5rem | 700 | `--text` |
| Section heading | 1.5rem | 600 | `--text` |
| Card heading | 1.125rem | 600 | `--text` |
| Body text | 1rem | 400 | `--text` |
| Caption/label | 0.875rem | 500 | `--text-secondary` |
| Small/stat label | 0.75rem | 500 | `--text-secondary` |

## Layout
- Max content width: `1200px`, centered.
- Section padding: `4rem 0`.
- Card grid: CSS Grid, `repeat(auto-fill, minmax(320px, 1fr))`, gap `1.5rem`.
- Responsive: single column below `768px`.

## Components

### Stat Card
- Background: `--bg-subtle`. Border: `1px solid --border`. Border-radius: `12px`.
- Padding: `1.5rem`. Subtle box-shadow on hover.

### Data Table
- Clean, minimal borders. Header row: `--bg-subtle` background, `--text-secondary` text, uppercase, small.
- Alternating row colors: white / `--bg-subtle`.

### Charts
- Use Chart.js (loaded via CDN). Keep defaults minimal.
- Faction colors for series. Grid lines: `--border`. Labels: `--text-secondary`.

### Navigation
- Sticky top bar: white background, subtle bottom border.
- Logo/title left, nav links right. Simple text links, no heavy styling.

## Motion
- Keep it subtle. `transition: 0.2s ease` on interactive elements.
- No scroll-jacking, no parallax. Fade-in on data load if anything.
