'use strict';
const crypto = require('node:crypto');

/** Room codes: 6 characters from an alphabet without look-alikes (no 0/O, 1/I/L). 31^6 ≈ 887 million codes. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_ID_LEN = 6;
const ROOM_ID_RE = new RegExp(`^[${ALPHABET}]{${ROOM_ID_LEN}}$`);

function generateRoomId() {
  let id = '';
  for (let i = 0; i < ROOM_ID_LEN; i++) id += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return id;
}

/** Accepts user input like " abc-123 " and returns "ABC123", or null if it can't be a room code. */
function normalizeRoomId(input) {
  if (typeof input !== 'string' || input.length > 20) return null;
  const id = input.toUpperCase().replace(/[\s-]/g, '');
  return ROOM_ID_RE.test(id) ? id : null;
}

/** Display names: 1-20 visible characters, no control characters or angle brackets. */
function cleanName(input) {
  if (typeof input !== 'string') return null;
  const n = input.normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  if (!n || [...n].length > 20) return null;
  return n;
}

/** Optional room password: empty = none; otherwise 4-32 characters. */
function checkPassword(input) {
  if (input === undefined || input === null || input === '') return { ok: true, password: null };
  if (typeof input !== 'string' || input.length < 4 || input.length > 32) return { ok: false };
  return { ok: true, password: input };
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return { salt, hash: crypto.scryptSync(pw, salt, 32) };
}
function verifyPassword(pw, rec) {
  if (!rec) return true;
  if (typeof pw !== 'string' || pw.length > 64) return false;
  const h = crypto.scryptSync(pw, rec.salt, 32);
  return crypto.timingSafeEqual(h, rec.hash);
}

/** Reconnect tokens are random, 128-bit, and only ever sent to the player they belong to. */
function newToken() { return crypto.randomBytes(16).toString('hex'); }
function isToken(t) { return typeof t === 'string' && /^[0-9a-f]{32}$/.test(t); }

module.exports = { ALPHABET, ROOM_ID_LEN, generateRoomId, normalizeRoomId, cleanName, checkPassword, hashPassword, verifyPassword, newToken, isToken };
