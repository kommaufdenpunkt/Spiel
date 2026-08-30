'use strict';
// Kompakter QR-Code-Generator (Byte-Modus, ECC-Level M), ohne externe Bibliothek.
// Basiert auf dem gemeinfreien Algorithmus von Project Nayuki (neu implementiert).
// window.qrEncode(text) -> { size, get(x,y) } ; wirft, wenn Text zu lang.
(function () {
  const ECC_CODEWORDS_PER_BLOCK = [ // [L,M,Q,H][version]
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const NUM_EC_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];
  const ECC = 1; // Level M

  function getAlignmentPatternPositions(ver) {
    if (ver === 1) return [];
    const numAlign = Math.floor(ver / 7) + 2;
    const step = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const size = ver * 4 + 17;
    const result = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }
  function getNumRawDataModules(ver) {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }
  function getNumDataCodewords(ver, ecc) {
    return Math.floor(getNumRawDataModules(ver) / 8)
      - ECC_CODEWORDS_PER_BLOCK[ecc][ver] * NUM_EC_BLOCKS[ecc][ver];
  }

  // --- Galois-Feld GF(2^8) für Reed-Solomon ---
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z & 0xff;
  }
  function reedSolomonDivisor(degree) {
    const result = new Array(degree).fill(0); result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }
  function reedSolomonRemainder(data, divisor) {
    const result = new Array(divisor.length).fill(0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      for (let i = 0; i < result.length; i++) result[i] ^= gfMul(divisor[i], factor);
    }
    return result;
  }

  function addEccAndInterleave(data, ver, ecc) {
    const numBlocks = NUM_EC_BLOCKS[ecc][ver];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc][ver];
    const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    const numShort = numBlocks - rawCodewords % numBlocks;
    const shortLen = Math.floor(rawCodewords / numBlocks);
    const blocks = [];
    const rsDiv = reedSolomonDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const datLen = shortLen - blockEccLen + (i < numShort ? 0 : 1);
      const dat = data.slice(k, k + datLen); k += datLen;
      const ecCodewords = reedSolomonRemainder(dat, rsDiv);
      const blk = dat.slice();
      if (i < numShort) blk.push(0); // Platzhalter für gleichmäßige Länge
      blocks.push(blk.concat(ecCodewords));
      blocks[i]._dataLen = datLen;
    }
    const result = [];
    const maxLen = Math.max(...blocks.map((b) => b.length));
    for (let i = 0; i < maxLen; i++) {
      for (let j = 0; j < blocks.length; j++) {
        // Kurzblock-Platzhalter (Position shortLen-blockEccLen) überspringen
        if (i === shortLen - blockEccLen && j < numShort) continue;
        result.push(blocks[j][i]);
      }
    }
    return result;
  }

  function QR(ver, dataCodewords) {
    const size = ver * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
    const setF = (x, y, v) => { modules[y][x] = v; isFunction[y][x] = true; };

    function drawFinder(x, y) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, dist !== 2 && dist !== 4);
      }
    }
    function drawAlign(x, y) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        setF(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    // Timing
    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    drawFinder(3, 3); drawFinder(size - 4, 3); drawFinder(3, size - 4);
    // Separators sind bei drawFinder (dist 4 -> false) mit abgedeckt
    const align = getAlignmentPatternPositions(ver);
    for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      drawAlign(align[i], align[j]);
    }
    // Reservierte Bereiche für Format-/Versionsinfo als Funktion markieren
    for (let i = 0; i < 9; i++) { if (!isFunction[i][8]) setF(8, i, false); if (!isFunction[8][i]) setF(i, 8, false); }
    for (let i = 0; i < 8; i++) { setF(size - 1 - i, 8, false); setF(8, size - 1 - i, false); }
    setF(8, size - 8, true); // dark module
    if (ver >= 7) {
      for (let i = 0; i < 18; i++) { const a = size - 11 + i % 3, b = Math.floor(i / 3); setF(a, b, false); setF(b, a, false); }
    }

    // Datenbits platzieren (Zickzack)
    let bitIndex = 0;
    const allBits = [];
    for (const cw of dataCodewords) for (let i = 7; i >= 0; i--) allBits.push((cw >>> i) & 1);
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let k = 0; k < 2; k++) {
          const x = right - k;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!isFunction[y][x] && bitIndex < allBits.length) { modules[y][x] = allBits[bitIndex] === 1; bitIndex++; }
        }
      }
    }

    function applyMask(mask) {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (isFunction[y][x]) continue;
        let invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
        }
        if (invert) modules[y][x] = !modules[y][x];
      }
    }
    function drawFormat(mask) {
      const data = (ECC === 1 ? 0 : ECC === 0 ? 1 : ECC === 3 ? 2 : 3) << 3 | mask; // L=01,M=00,Q=11,H=10
      const eccBits = { 0: 1, 1: 0, 2: 3, 3: 2 }[ECC]; // Format-Bits: M=00,L=01,H=10,Q=11
      const d = (eccBits << 3) | mask;
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((d << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setF(8, i, ((bits >>> i) & 1) !== 0);
      setF(8, 7, ((bits >>> 6) & 1) !== 0); setF(8, 8, ((bits >>> 7) & 1) !== 0); setF(7, 8, ((bits >>> 8) & 1) !== 0);
      for (let i = 9; i < 15; i++) setF(14 - i, 8, ((bits >>> i) & 1) !== 0);
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, ((bits >>> i) & 1) !== 0);
      setF(8, size - 8, true);
    }
    function drawVersion() {
      if (ver < 7) return;
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >>> i) & 1) !== 0; const a = size - 11 + i % 3, b = Math.floor(i / 3);
        setF(a, b, bit); setF(b, a, bit);
      }
    }
    function penalty() {
      let p = 0;
      for (let y = 0; y < size; y++) {
        let run = 1;
        for (let x = 1; x < size; x++) {
          if (modules[y][x] === modules[y][x - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
          else run = 1;
        }
      }
      for (let x = 0; x < size; x++) {
        let run = 1;
        for (let y = 1; y < size; y++) {
          if (modules[y][x] === modules[y - 1][x]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
          else run = 1;
        }
      }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++)
        if (modules[y][x] === modules[y][x + 1] && modules[y][x] === modules[y + 1][x] && modules[y][x] === modules[y + 1][x + 1]) p += 3;
      let dark = 0; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) dark++;
      const total = size * size;
      const k = Math.floor(Math.abs(dark * 20 - total * 10) / total);
      p += k * 10;
      return p;
    }

    drawVersion();
    // Beste Maske wählen
    let bestMask = 0, bestPenalty = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      const pen = penalty();
      if (pen < bestPenalty) { bestPenalty = pen; bestMask = m; }
      applyMask(m); // rückgängig (XOR erneut)
    }
    applyMask(bestMask); drawFormat(bestMask);

    return { size, get: (x, y) => modules[y][x] };
  }

  window.qrEncode = function (text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    // Kleinste Version 1..40 (ECC M) finden, die passt
    for (let ver = 1; ver <= 40; ver++) {
      const capacityBits = getNumDataCodewords(ver, ECC) * 8;
      const ccBits = ver <= 9 ? 8 : 16;
      const usedBits = 4 + ccBits + bytes.length * 8;
      if (usedBits <= capacityBits) {
        // Bitstrom bauen
        const bits = [];
        const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
        push(0b0100, 4);            // Byte-Modus
        push(bytes.length, ccBits); // Zeichenzahl
        for (const b of bytes) push(b, 8);
        // Terminator + Byte-Auffüllung
        const dataCap = getNumDataCodewords(ver, ECC) * 8;
        push(0, Math.min(4, dataCap - bits.length));
        while (bits.length % 8 !== 0) bits.push(0);
        const dataCodewords = [];
        for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; dataCodewords.push(b); }
        for (let pad = 0xEC; dataCodewords.length < getNumDataCodewords(ver, ECC); pad ^= 0xEC ^ 0x11) dataCodewords.push(pad);
        const allCodewords = addEccAndInterleave(dataCodewords, ver, ECC);
        return QR(ver, allCodewords);
      }
    }
    throw new Error('QR: Text zu lang');
  };
})();
