"""Python port of site/js/deckcode.js — decodes Atlas Conquest deck codes.

Used by scripts/build_articles.py to pre-render [[deck:CODE]] embeds at build
time. The wire format must stay byte-for-byte identical with the JS encoder
that produced the code; if you change one side, change the other and update
scripts/tests/fixtures/deck_codes.json.

Format recap (see site/js/deckcode.js for the authoritative comment):
  <base64_prefix>:<base64_cards>
    prefix : UTF-8 string. First Unicode code point = commander ID,
             remaining characters = deck name.
    cards  : binary blob. 20 bits per card (14-bit card id + 6-bit count),
             LSB-first packing to match C#'s BitArray.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Iterable


class DeckCodecError(ValueError):
    """Raised for any malformed deck code or unknown id."""


class DeckCodec:
    def __init__(self, cards: Iterable[dict], legacy_names: dict[str, str] | None = None):
        # cards: iterable of {"id": int, "name": str}
        self._id_to_name: dict[int, str] = {}
        self._name_to_id: dict[str, int] = {}
        for c in cards:
            self._id_to_name[c["id"]] = c["name"]
            self._name_to_id[c["name"]] = c["id"]
        self._legacy = dict(legacy_names or {})

    @classmethod
    def from_cardlist_json(cls, path: str | Path) -> "DeckCodec":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(data["cards"], data.get("legacy_names"))

    def _apply_legacy(self, name: str) -> str:
        return self._legacy.get(name, name)

    def decode(self, code: str) -> dict:
        """Decode `code` into {commander, deck_name, cards: [{name, count}, ...]}.

        Raises DeckCodecError on malformed input or unknown ids.
        """
        if ":" not in code:
            raise DeckCodecError("Invalid deck code: missing ':' separator")
        prefix_b64, cards_b64 = code.split(":", 1)

        try:
            prefix_bytes = _b64decode_lenient(prefix_b64)
        except (ValueError, base64.binascii.Error) as exc:
            raise DeckCodecError(f"Invalid base64 in prefix: {exc}") from exc
        try:
            card_bytes = _b64decode_lenient(cards_b64)
        except (ValueError, base64.binascii.Error) as exc:
            raise DeckCodecError(f"Invalid base64 in card payload: {exc}") from exc

        try:
            prefix_str = prefix_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise DeckCodecError(f"Prefix is not valid UTF-8: {exc}") from exc
        if not prefix_str:
            raise DeckCodecError("Prefix is empty — no commander id")

        commander_id = ord(prefix_str[0])
        deck_name = prefix_str[1:]
        commander = self._apply_legacy(
            self._id_to_name.get(commander_id, f"Unknown ({commander_id})")
        )

        cards: list[dict] = []
        bit_pos = 0
        total_bits = len(card_bytes) * 8
        while bit_pos + 20 <= total_bits:
            card_id = _get_bits(card_bytes, bit_pos, 14)
            count = _get_bits(card_bytes, bit_pos + 14, 6)
            bit_pos += 20
            if count > 0:
                name = self._apply_legacy(
                    self._id_to_name.get(card_id, f"Unknown ({card_id})")
                )
                cards.append({"name": name, "count": count})

        return {"commander": commander, "deck_name": deck_name, "cards": cards}


def _b64decode_lenient(s: str) -> bytes:
    """Match JS atob() behavior: accept unpadded base64 by re-padding before decode."""
    pad = (-len(s)) % 4
    return base64.b64decode(s + "=" * pad, validate=False)


def _set_bits(data: bytearray, bit_pos: int, value: int, num_bits: int) -> None:
    for i in range(num_bits):
        byte_index = (bit_pos + i) // 8
        bit_index = (bit_pos + i) % 8
        if value & (1 << i):
            data[byte_index] |= 1 << bit_index


def _encode_deck(codec: "DeckCodec", deck: dict) -> str:
    """Mirror of encodeDeckCode() in site/js/deckcode.js.

    Kept private — only used by the fixture/round-trip tests. Production code
    never encodes from Python (encoding happens in the JS Build tab on the
    Decks page); but a Python encoder lets us write self-contained tests
    without depending on Node.
    """
    cmd_id = codec._name_to_id.get(deck["commander"])
    if cmd_id is None:
        raise DeckCodecError(f"Unknown commander: {deck['commander']}")
    prefix_str = chr(cmd_id) + deck.get("deck_name", "")
    prefix_b64 = base64.b64encode(prefix_str.encode("utf-8")).decode("ascii")

    total_bits = len(deck["cards"]) * 20
    num_bytes = total_bits // 8 + 1
    buf = bytearray(num_bytes)
    bit_pos = 0
    for card in deck["cards"]:
        card_id = codec._name_to_id.get(card["name"])
        if card_id is None:
            raise DeckCodecError(f"Unknown card: {card['name']}")
        _set_bits(buf, bit_pos, card_id, 14)
        _set_bits(buf, bit_pos + 14, card["count"], 6)
        bit_pos += 20
    cards_b64 = base64.b64encode(bytes(buf)).decode("ascii")
    return f"{prefix_b64}:{cards_b64}"


def _get_bits(data: bytes, bit_pos: int, num_bits: int) -> int:
    """LSB-first bit read, matching the JS getBits() in deckcode.js."""
    value = 0
    for i in range(num_bits):
        byte_index = (bit_pos + i) // 8
        bit_index = (bit_pos + i) % 8
        if byte_index < len(data) and (data[byte_index] & (1 << bit_index)):
            value |= 1 << i
    return value
