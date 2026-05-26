---
title: "Feature Tour"
slug: test-feature-tour
author: "Build Pipeline"
date: 2026-05-24
summary: "A synthetic article exercising every supported Markdown feature: prose, headings, lists, blockquotes, tables, card links, card images, and deck embeds. Used to verify the build pipeline."
hero_image: hero.jpg
tags: [test, reference]
draft: true
---

This article exists to exercise every feature of the article build pipeline.
It is marked `draft: true` so it never reaches production. Build it locally
with `python scripts/build_articles.py --include-drafts`.

## Inline card references

A plain card link looks like this: [[card:Acid Rain]]. Hovering it should
show the card image popup. Names are case-insensitive — [[card:acid rain]]
resolves the same way and renders with the canonical name.

Multiple cards can sit alongside each other: [[card:Action Surge]] and
[[card:Alchemist]] both render as links.

## Inline card images

[[card-img:Acid Rain]]

The image above is rendered via the `[[card-img:Name]]` shortcode and lives at
`/assets/cards/acid-rain.jpg`.

## Embedded deck

A `[[deck:...]]` on its own line expands to a full deck card with commander
portrait, scrollable card list, and a link to open it in the Deck Tools page.
Every row carries `data-card` so the hover preview works automatically.

[[deck:wo1HcmVlbmJlYXJkIEFnZ3Jv:AMAQAAwCwDAADATAUAAMBsBwAAwIwJAADAA=]]

## Standard Markdown features

Headings, paragraphs, lists, blockquotes, bold, and italics all work.

- Unordered list item one
- Unordered list item two with **bold** and *italic*
- A nested list:
    - Sub-item alpha
    - Sub-item beta

1. Ordered list
2. Second item
3. Third item

> A blockquote stands out from the surrounding prose. It uses the lucia
> faction color for its left border by default.

| Column A | Column B | Column C |
|----------|----------|----------|
| value 1  | value 2  | value 3  |
| foo      | bar      | baz      |

A horizontal rule:

---

That's the full tour.
