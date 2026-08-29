function hasPrefix(bytes, prefix) {
  return prefix.every((value, index) => bytes[index] === value);
}

function decode(bytes, encoding, options = {}) {
  return new TextDecoder(encoding, options).decode(bytes);
}

export function decodeCsvBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (hasPrefix(bytes, [0xEF, 0xBB, 0xBF])) return decode(bytes.subarray(3), 'utf-8');
  if (hasPrefix(bytes, [0xFF, 0xFE])) return decode(bytes.subarray(2), 'utf-16le');
  if (hasPrefix(bytes, [0xFE, 0xFF])) return decode(bytes.subarray(2), 'utf-16be');
  try {
    return decode(bytes, 'utf-8', { fatal: true });
  } catch {
    return decode(bytes, 'windows-1251');
  }
}

export async function decodeCsvFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new TypeError('CSV-файл не выбран.');
  return decodeCsvBuffer(await file.arrayBuffer());
}
