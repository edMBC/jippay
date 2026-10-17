/**
 * Genera iconos PWA monocromáticos válidos (grises/grafito) en public/icons/.
 * Ejecutar: pnpm tsx scripts/generate-icons.ts
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const OUT_DIR = path.join(process.cwd(), "public", "icons");

function crc32(buffer: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcData = Buffer.concat([typeBytes, Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(new Uint8Array(crcData)), 0);
  return Buffer.concat([length, typeBytes, Buffer.from(data), crc]);
}

// Grayscale PNG con un "J" estilizado (monograma monocromático simple).
function makeIcon(size: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      // Fondo grafito (#18181b ≈ 24) y trazo plata (#a1a1aa ≈ 161).
      let px = 24;
      if (ny > 0.15 && ny < 0.85) {
        if (nx > 0.62 && nx < 0.78 && ny > 0.62) px = 161; // gancho inferior
        if (nx > 0.6 && nx < 0.78 && ny < 0.42) px = 161; // asta vertical
        if (nx > 0.55 && nx < 0.78 && ny > 0.38 && ny < 0.48) px = 161; // techo
      }
      raw[rowStart + 1 + x] = px;
    }
  }

  const idat = deflateSync(raw);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", new Uint8Array(ihdr)),
    pngChunk("IDAT", new Uint8Array(idat)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, "icon-192.png"), makeIcon(192));
  await fs.writeFile(path.join(OUT_DIR, "icon-512.png"), makeIcon(512));
  console.log("Iconos generados en public/icons/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
