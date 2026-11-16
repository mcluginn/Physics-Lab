// Shared pure-TypeScript PKZIP entry patcher for .docx OpenXML archives.
// Replaces a target entry (e.g. "word/document.xml") using STORE (method 0)
// while preserving all untouched binary entries (media, styles, headers, footers) byte-for-byte.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipEntryRecord = {
  nameBytes: Uint8Array;
  name: string;
  versionMadeBy: number;
  versionNeeded: number;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  diskNumberStart: number;
  internalAttrs: number;
  externalAttrs: number;
  extraBytes: Uint8Array;
  commentBytes: Uint8Array;
  payload: Uint8Array;
};

function readU16LE(buf: Uint8Array, off: number): number {
  return buf[off] | (buf[off + 1] << 8);
}

function readU32LE(buf: Uint8Array, off: number): number {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

function writeU16LE(buf: Uint8Array, off: number, val: number) {
  buf[off] = val & 0xff;
  buf[off + 1] = (val >>> 8) & 0xff;
}

function writeU32LE(buf: Uint8Array, off: number, val: number) {
  buf[off] = val & 0xff;
  buf[off + 1] = (val >>> 8) & 0xff;
  buf[off + 2] = (val >>> 16) & 0xff;
  buf[off + 3] = (val >>> 24) & 0xff;
}

export function replaceZipEntryBytes(
  zipBytes: Uint8Array,
  targetEntryName: string,
  replacementBytes: Uint8Array
): Uint8Array {
  const decoder = new TextDecoder('utf-8');

  let eocdOff = -1;
  const minOff = Math.max(0, zipBytes.length - 65557);
  for (let i = zipBytes.length - 22; i >= minOff; i--) {
    if (
      zipBytes[i] === 0x50 &&
      zipBytes[i + 1] === 0x4b &&
      zipBytes[i + 2] === 0x05 &&
      zipBytes[i + 3] === 0x06
    ) {
      eocdOff = i;
      break;
    }
  }
  if (eocdOff < 0) throw new Error('Invalid ZIP template: EOCD signature not found');

  const totalEntries = readU16LE(zipBytes, eocdOff + 10);
  const cdOffset = readU32LE(zipBytes, eocdOff + 16);

  const entries: ZipEntryRecord[] = [];
  let cursor = cdOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (
      zipBytes[cursor] !== 0x50 ||
      zipBytes[cursor + 1] !== 0x4b ||
      zipBytes[cursor + 2] !== 0x01 ||
      zipBytes[cursor + 3] !== 0x02
    ) {
      throw new Error(`Invalid ZIP central directory entry at offset ${cursor}`);
    }

    const versionMadeBy = readU16LE(zipBytes, cursor + 4);
    const versionNeeded = readU16LE(zipBytes, cursor + 6);
    const flags = readU16LE(zipBytes, cursor + 8);
    const method = readU16LE(zipBytes, cursor + 10);
    const dosTime = readU16LE(zipBytes, cursor + 12);
    const dosDate = readU16LE(zipBytes, cursor + 14);
    const crcVal = readU32LE(zipBytes, cursor + 16);
    const compSize = readU32LE(zipBytes, cursor + 20);
    const uncompSize = readU32LE(zipBytes, cursor + 24);
    const nameLen = readU16LE(zipBytes, cursor + 28);
    const extraLen = readU16LE(zipBytes, cursor + 30);
    const commentLen = readU16LE(zipBytes, cursor + 32);
    const diskNumberStart = readU16LE(zipBytes, cursor + 34);
    const internalAttrs = readU16LE(zipBytes, cursor + 36);
    const externalAttrs = readU32LE(zipBytes, cursor + 38);
    const localOff = readU32LE(zipBytes, cursor + 42);

    const nameBytes = zipBytes.slice(cursor + 46, cursor + 46 + nameLen);
    const name = decoder.decode(nameBytes);
    const extraBytes = zipBytes.slice(cursor + 46 + nameLen, cursor + 46 + nameLen + extraLen);
    const commentBytes = zipBytes.slice(
      cursor + 46 + nameLen + extraLen,
      cursor + 46 + nameLen + extraLen + commentLen
    );

    cursor += 46 + nameLen + extraLen + commentLen;

    const lfhNameLen = readU16LE(zipBytes, localOff + 26);
    const lfhExtraLen = readU16LE(zipBytes, localOff + 28);
    const payloadStart = localOff + 30 + lfhNameLen + lfhExtraLen;

    if (name === targetEntryName) {
      entries.push({
        nameBytes,
        name,
        versionMadeBy,
        versionNeeded: 20,
        flags: flags & ~0x0008,
        method: 0,
        dosTime,
        dosDate,
        crc32: crc32(replacementBytes),
        compressedSize: replacementBytes.length,
        uncompressedSize: replacementBytes.length,
        diskNumberStart,
        internalAttrs,
        externalAttrs,
        extraBytes: new Uint8Array(0),
        commentBytes,
        payload: replacementBytes,
      });
    } else {
      entries.push({
        nameBytes,
        name,
        versionMadeBy,
        versionNeeded,
        flags: flags & ~0x0008,
        method,
        dosTime,
        dosDate,
        crc32: crcVal,
        compressedSize: compSize,
        uncompressedSize: uncompSize,
        diskNumberStart,
        internalAttrs,
        externalAttrs,
        extraBytes,
        commentBytes,
        payload: zipBytes.slice(payloadStart, payloadStart + compSize),
      });
    }
  }

  let totalLocalSize = 0;
  let totalCdSize = 0;
  for (const e of entries) {
    totalLocalSize += 30 + e.nameBytes.length + e.extraBytes.length + e.payload.length;
    totalCdSize += 46 + e.nameBytes.length + e.extraBytes.length + e.commentBytes.length;
  }

  const out = new Uint8Array(totalLocalSize + totalCdSize + 22);
  const localOffsets: number[] = [];
  let writePos = 0;

  for (const e of entries) {
    localOffsets.push(writePos);
    writeU32LE(out, writePos, 0x04034b50);
    writeU16LE(out, writePos + 4, e.versionNeeded);
    writeU16LE(out, writePos + 6, e.flags);
    writeU16LE(out, writePos + 8, e.method);
    writeU16LE(out, writePos + 10, e.dosTime);
    writeU16LE(out, writePos + 12, e.dosDate);
    writeU32LE(out, writePos + 14, e.crc32);
    writeU32LE(out, writePos + 18, e.compressedSize);
    writeU32LE(out, writePos + 22, e.uncompressedSize);
    writeU16LE(out, writePos + 26, e.nameBytes.length);
    writeU16LE(out, writePos + 28, e.extraBytes.length);
    writePos += 30;
    out.set(e.nameBytes, writePos);
    writePos += e.nameBytes.length;
    out.set(e.extraBytes, writePos);
    writePos += e.extraBytes.length;
    out.set(e.payload, writePos);
    writePos += e.payload.length;
  }

  const newCdOffset = writePos;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    writeU32LE(out, writePos, 0x02014b50);
    writeU16LE(out, writePos + 4, e.versionMadeBy);
    writeU16LE(out, writePos + 6, e.versionNeeded);
    writeU16LE(out, writePos + 8, e.flags);
    writeU16LE(out, writePos + 10, e.method);
    writeU16LE(out, writePos + 12, e.dosTime);
    writeU16LE(out, writePos + 14, e.dosDate);
    writeU32LE(out, writePos + 16, e.crc32);
    writeU32LE(out, writePos + 20, e.compressedSize);
    writeU32LE(out, writePos + 24, e.uncompressedSize);
    writeU16LE(out, writePos + 28, e.nameBytes.length);
    writeU16LE(out, writePos + 30, e.extraBytes.length);
    writeU16LE(out, writePos + 32, e.commentBytes.length);
    writeU16LE(out, writePos + 34, e.diskNumberStart);
    writeU16LE(out, writePos + 36, e.internalAttrs);
    writeU32LE(out, writePos + 38, e.externalAttrs);
    writeU32LE(out, writePos + 42, localOffsets[i]);
    writePos += 46;
    out.set(e.nameBytes, writePos);
    writePos += e.nameBytes.length;
    out.set(e.extraBytes, writePos);
    writePos += e.extraBytes.length;
    out.set(e.commentBytes, writePos);
    writePos += e.commentBytes.length;
  }

  writeU32LE(out, writePos, 0x06054b50);
  writeU16LE(out, writePos + 4, 0);
  writeU16LE(out, writePos + 6, 0);
  writeU16LE(out, writePos + 8, entries.length);
  writeU16LE(out, writePos + 10, entries.length);
  writeU32LE(out, writePos + 12, totalCdSize);
  writeU32LE(out, writePos + 16, newCdOffset);
  writeU16LE(out, writePos + 20, 0);

  return out;
}
