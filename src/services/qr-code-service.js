const VERSION = 2;
const SIZE = 25;
const DATA_CODEWORDS = 34;
const ECC_CODEWORDS = 10;
const QUIET_ZONE = 4;
const MAX_BYTE_LENGTH = 32;

function gfMultiply(left, right) {
  let product = 0;
  for (let bit = 7; bit >= 0; bit -= 1) {
    product = (product << 1) ^ ((product >>> 7) * 0x11D);
    if (((right >>> bit) & 1) !== 0) product ^= left;
  }
  return product;
}

function reedSolomonDivisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let item = 0; item < degree; item += 1) {
      result[item] = gfMultiply(result[item], root);
      if (item + 1 < degree) result[item] ^= result[item + 1];
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

function reedSolomonRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let index = 0; index < result.length; index += 1) {
      result[index] ^= gfMultiply(divisor[index], factor);
    }
  }
  return result;
}

function dataCodewords(text) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_BYTE_LENGTH) throw new RangeError('QR payload is too large for the activation code.');

  const bits = [];
  const appendBits = (value, count) => {
    for (let bit = count - 1; bit >= 0; bit -= 1) bits.push((value >>> bit) & 1);
  };

  appendBits(0x4, 4);
  appendBits(bytes.length, 8);
  for (const byte of bytes) appendBits(byte, 8);

  const capacity = DATA_CODEWORDS * 8;
  for (let index = 0; index < Math.min(4, capacity - bits.length); index += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let offset = 0; offset < bits.length; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[offset + bit];
    codewords.push(byte);
  }
  let padding = 0;
  while (codewords.length < DATA_CODEWORDS) {
    codewords.push(padding % 2 === 0 ? 0xEC : 0x11);
    padding += 1;
  }
  return Uint8Array.from(codewords);
}

function qrMatrix(text) {
  const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  const functions = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));

  const setFunction = (x, y, dark) => {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
    modules[y][x] = Boolean(dark);
    functions[y][x] = true;
  };

  const drawFinder = (centerX, centerY) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(centerX + dx, centerY + dy, distance !== 2 && distance !== 4);
      }
    }
  };

  drawFinder(3, 3);
  drawFinder(SIZE - 4, 3);
  drawFinder(3, SIZE - 4);

  for (let index = 0; index < SIZE; index += 1) {
    if (!functions[6][index]) setFunction(index, 6, index % 2 === 0);
    if (!functions[index][6]) setFunction(6, index, index % 2 === 0);
  }

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunction(18 + dx, 18 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  const drawFormatBits = (mask) => {
    const data = (1 << 3) | mask;
    let remainder = data;
    for (let index = 0; index < 10; index += 1) {
      remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
    }
    const bits = ((data << 10) | remainder) ^ 0x5412;
    const bit = (index) => ((bits >>> index) & 1) !== 0;

    for (let index = 0; index <= 5; index += 1) setFunction(8, index, bit(index));
    setFunction(8, 7, bit(6));
    setFunction(8, 8, bit(7));
    setFunction(7, 8, bit(8));
    for (let index = 9; index < 15; index += 1) setFunction(14 - index, 8, bit(index));

    for (let index = 0; index < 8; index += 1) setFunction(SIZE - 1 - index, 8, bit(index));
    for (let index = 8; index < 15; index += 1) setFunction(8, SIZE - 15 + index, bit(index));
    setFunction(8, SIZE - 8, true);
  };

  drawFormatBits(0);

  const data = dataCodewords(text);
  const ecc = reedSolomonRemainder(data, reedSolomonDivisor(ECC_CODEWORDS));
  const codewords = Uint8Array.from([...data, ...ecc]);
  let bitIndex = 0;

  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < SIZE; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? SIZE - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (functions[y][x]) continue;
        const value = bitIndex < codewords.length * 8
          ? ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0
          : false;
        modules[y][x] = value;
        bitIndex += 1;
      }
    }
  }

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!functions[y][x] && (x + y) % 2 === 0) modules[y][x] = !modules[y][x];
    }
  }

  return modules;
}

export function activationQrPayload(scanToken) {
  return `TV2:${scanToken}`;
}

export function createActivationQrSvg(scanToken) {
  const matrix = qrMatrix(activationQrPayload(scanToken));
  const dimension = SIZE + QUIET_ZONE * 2;
  const path = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (matrix[y][x]) path.push(`M${x + QUIET_ZONE},${y + QUIET_ZONE}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" role="img" aria-label="QR-код подключения телевизора" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path.join('')}" fill="#000"/></svg>`;
}

export const QR_ACTIVATION_VERSION = VERSION;
