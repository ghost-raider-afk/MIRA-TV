import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeCsvBuffer } from '../src/web/admin-ui/public/js/catalog/csv-decoder.js';

const SAMPLE = 'Название;Цена 1 л\r\nТест;100\r\n';

function utf16be(text) {
  const le = Buffer.from(text, 'utf16le');
  const be = Buffer.alloc(le.length + 2);
  be[0] = 0xFE;
  be[1] = 0xFF;
  for (let index = 0; index < le.length; index += 2) {
    be[index + 2] = le[index + 1];
    be[index + 3] = le[index];
  }
  return be;
}

function windows1251Sample() {
  return Uint8Array.from([
    0xCD,0xE0,0xE7,0xE2,0xE0,0xED,0xE8,0xE5,0x3B,
    0xD6,0xE5,0xED,0xE0,0x20,0x31,0x20,0xEB,0x0D,0x0A,
    0xD2,0xE5,0xF1,0xF2,0x3B,0x31,0x30,0x30,0x0D,0x0A
  ]);
}

test('CSV decoder accepts UTF-8 with and without BOM', () => {
  assert.equal(decodeCsvBuffer(Buffer.from(SAMPLE, 'utf8')), SAMPLE);
  assert.equal(decodeCsvBuffer(Buffer.concat([Buffer.from([0xEF,0xBB,0xBF]), Buffer.from(SAMPLE, 'utf8')])), SAMPLE);
});

test('CSV decoder accepts UTF-16 LE and BE with BOM', () => {
  assert.equal(decodeCsvBuffer(Buffer.concat([Buffer.from([0xFF,0xFE]), Buffer.from(SAMPLE, 'utf16le')])), SAMPLE);
  assert.equal(decodeCsvBuffer(utf16be(SAMPLE)), SAMPLE);
});

test('CSV decoder falls back to Windows-1251 for Russian Excel CSV', () => {
  assert.equal(decodeCsvBuffer(windows1251Sample()), SAMPLE);
  assert.doesNotMatch(decodeCsvBuffer(windows1251Sample()), /�/);
});
