/**
 * Atlas Conquest Deck Code Encoder/Decoder
 *
 * Deck code format: <base64_prefix>:<base64_cards>
 *   Prefix: UTF-8 encoded string where first character's code point = commander ID,
 *           remaining characters = deck name
 *   Cards:  Binary data, 20 bits per card (14-bit card ID + 6-bit count), LSB-first
 *
 * Ported from the C# implementation in friend deck conversion/message.txt.
 */

// ─── Card List (loaded externally) ─────────────────────────

let _cardList = null;       // {id, name}[]
let _nameToId = {};         // name → id
let _idToName = {};         // id → name
let _legacyNames = {};      // old name → new name

function initDeckCodec(cardlistData) {
  _cardList = cardlistData.cards;
  _legacyNames = cardlistData.legacy_names || {};
  _nameToId = {};
  _idToName = {};
  for (const card of _cardList) {
    _idToName[card.id] = card.name;
    _nameToId[card.name] = card.id;
  }
  // Also map legacy names to their IDs
  for (const [oldName, newName] of Object.entries(_legacyNames)) {
    if (_nameToId[oldName] !== undefined) {
      _nameToId[newName] = _nameToId[newName] ?? _nameToId[oldName];
    }
  }
}

function applyLegacy(name) {
  return _legacyNames[name] || name;
}

// ─── Base64 / byte helpers ─────────────────────────────────

function base64ToBytes(b64) {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let raw = '';
  for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
  return btoa(raw);
}

/**
 * Encode a JavaScript string to UTF-8 bytes.
 * Uses TextEncoder when available, falls back to manual encoding.
 */
function stringToUtf8Bytes(str) {
  return new TextEncoder().encode(str);
}

/**
 * Decode UTF-8 bytes to a JavaScript string.
 */
function utf8BytesToString(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

// ─── Bit packing (LSB-first, matching C#'s BitArray) ───────

function getBits(bytes, bitPos, numBits) {
  let value = 0;
  for (let i = 0; i < numBits; i++) {
    const byteIndex = Math.floor((bitPos + i) / 8);
    const bitIndex = (bitPos + i) % 8;
    if (byteIndex < bytes.length && (bytes[byteIndex] & (1 << bitIndex))) {
      value |= (1 << i);
    }
  }
  return value;
}

function setBits(bytes, bitPos, value, numBits) {
  for (let i = 0; i < numBits; i++) {
    const byteIndex = Math.floor((bitPos + i) / 8);
    const bitIndex = (bitPos + i) % 8;
    if (value & (1 << i)) {
      bytes[byteIndex] |= (1 << bitIndex);
    }
  }
}

// ─── Decode ────────────────────────────────────────────────

/**
 * Decode a deck code string into a deck object.
 * @param {string} code - e.g. "wrNWQ29udHJvbHYz:DMHgDgzrwAAODLjA..."
 * @returns {{ commander: string, deckName: string, cards: {name: string, count: number}[] }}
 */
function decodeDeckCode(code) {
  if (!_cardList) throw new Error('Deck codec not initialized. Call initDeckCodec() first.');

  const parts = code.split(':');
  if (parts.length < 2) throw new Error('Invalid deck code: missing ":" separator');

  // Part 1: Commander + deck name (UTF-8 encoded string, base64'd)
  const prefixBytes = base64ToBytes(parts[0]);
  const prefixStr = utf8BytesToString(prefixBytes);
  const commanderId = prefixStr.codePointAt(0);
  // Handle surrogate pairs: characters above U+FFFF take 2 JS chars
  const charLen = commanderId > 0xFFFF ? 2 : 1;
  const deckName = prefixStr.substring(charLen);
  let commander = _idToName[commanderId] || `Unknown (${commanderId})`;
  commander = applyLegacy(commander);

  // Part 2: Cards (20 bits each: 14-bit ID + 6-bit count)
  const cardBytes = base64ToBytes(parts[1]);
  const cards = [];
  let bitPos = 0;
  const totalBits = cardBytes.length * 8;

  while (bitPos + 20 <= totalBits) {
    const cardId = getBits(cardBytes, bitPos, 14);
    const count = getBits(cardBytes, bitPos + 14, 6);
    bitPos += 20;

    if (count > 0) {
      let name = _idToName[cardId] || `Unknown (${cardId})`;
      name = applyLegacy(name);
      cards.push({ name, count });
    }
  }

  return { commander, deckName, cards };
}

// ─── Encode ────────────────────────────────────────────────

/**
 * Encode a deck object into a deck code string.
 * @param {{ commander: string, deckName: string, cards: {name: string, count: number}[] }} deck
 * @returns {string} - The encoded deck code
 */
function encodeDeckCode(deck) {
  if (!_cardList) throw new Error('Deck codec not initialized. Call initDeckCodec() first.');

  // Part 1: Commander + deck name
  const commanderId = _nameToId[deck.commander];
  if (commanderId === undefined) throw new Error(`Unknown commander: ${deck.commander}`);
  const prefixStr = String.fromCodePoint(commanderId) + deck.deckName;
  const prefixBytes = stringToUtf8Bytes(prefixStr);
  const b64Prefix = bytesToBase64(prefixBytes);

  // Part 2: Cards (20 bits each)
  const totalBits = deck.cards.length * 20;
  const numBytes = Math.floor(totalBits / 8) + 1; // matches C#'s integer division + 1
  const cardBytes = new Uint8Array(numBytes);

  let bitPos = 0;
  for (const card of deck.cards) {
    const cardId = _nameToId[card.name];
    if (cardId === undefined) throw new Error(`Unknown card: ${card.name}`);
    setBits(cardBytes, bitPos, cardId, 14);
    setBits(cardBytes, bitPos + 14, card.count, 6);
    bitPos += 20;
  }

  const b64Cards = bytesToBase64(cardBytes);

  return b64Prefix + ':' + b64Cards;
}
