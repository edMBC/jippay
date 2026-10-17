/**
 * Generador de archivos reales de prueba para la demo de Jippay.
 * Pobla public/sample-files/ con PDFs válidos, imágenes PNG, correos .eml,
 * plantillas CSV de ERP y JSON de maestro de proveedores.
 *
 * Ejecutar: pnpm tsx scripts/generate-sample-files.ts
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const OUT_DIR = path.join(process.cwd(), "public", "sample-files");

// ---------------------------------------------------------------------------
// Utilidades PNG (grayscale válido)
// ---------------------------------------------------------------------------

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

function makePng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type grayscale
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Scanlines con filtro 0 + gradiente horizontal.
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      raw[rowStart + 1 + x] = Math.floor((x / width) * 255);
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

// ---------------------------------------------------------------------------
// Utilidades PDF (con xref correcto)
// ---------------------------------------------------------------------------

interface PdfObject {
  content: string;
}

function makePdf(textLines: string[]): Buffer {
  const objects: PdfObject[] = [];
  const addObject = (content: string): number => {
    objects.push({ content });
    return objects.length;
  };

  const catalog = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  addObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  );

  const textOps = textLines
    .map((line, index) =>
      index === 0
        ? `(${line}) Tj`
        : `0 -20 Td (${line}) Tj`,
    )
    .join("\n");
  const stream = `BT /F1 12 Tf 72 720 Td\n${textOps}\nET`;
  addObject(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const header = "%PDF-1.4\n";
  const bodyParts: Buffer[] = [Buffer.from(header, "latin1")];
  const offsets: number[] = [];

  objects.forEach((obj, index) => {
    offsets.push(bodyParts.reduce((acc, b) => acc + b.length, 0));
    bodyParts.push(Buffer.from(`${index + 1} 0 obj\n${obj.content}\nendobj\n`, "latin1"));
  });

  const xrefOffset = bodyParts.reduce((acc, b) => acc + b.length, 0);
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join("\n")}\n`;
  const trailer = `trailer\n<< /Root ${catalog} 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.concat([...bodyParts, Buffer.from(xref, "latin1"), Buffer.from(trailer, "latin1")]);
}

// ---------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------

async function write(name: string, data: Buffer | string): Promise<void> {
  const filePath = path.join(OUT_DIR, name);
  await fs.writeFile(filePath, data);
  console.log(`✓ ${name} (${Buffer.byteLength(Buffer.isBuffer(data) ? data : Buffer.from(data))} bytes)`);
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // 1. PDF válido - factura aprobable DevCorp
  await write(
    "INV-204_DevCorp_450_USD.pdf",
    makePdf([
      "Factura INV-204",
      "Emisor: DevCorp",
      "Monto: 450 USD",
      "Vencimiento: 2026-11-15",
      "Concepto: Desarrollo de modulo de pagos",
    ]),
  );

  // 2. PNG válido - recibo LatamDesign que supera limite
  await write("INV-301_LatamDesign_1850_USD.png", makePng(240, 120));

  // 3. Correo .eml - proveedor no autorizado
  await write(
    "INV-999_HackerLabs_300_USD.eml",
    [
      "From: facturacion@hackerlabs.io",
      "To: ap@acme.com",
      "Subject: Factura INV-999 - HackerLabs",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Les enviamos la factura INV-999 de HackerLabs por consultoria de seguridad.",
      "Monto: $300 USD",
      "Vencimiento: 2026-11-20",
      "Concepto: Auditoria de penetracion",
      "",
    ].join("\r\n"),
  );

  // 4. TXT - excede presupuesto
  await write(
    "INV-405_CloudHost_6200_USD.txt",
    "Factura electronica\nID: INV-405\nEmisor: CloudHost Inc.\nMonto: 6200.00 USD\nFecha de vencimiento: 2026-11-30\nConcepto: Infraestructura cloud anual",
  );

  // 5. CSV Odoo (plantilla de proveedores)
  await write(
    "odoo_proveedores.csv",
    "proveedor,acuerdo,monto_acordado\nDevCorp,800,800\nLatamDesign,2000,2000\nCloudHost,1500,1500\nAndesConsulting,1200,1200",
  );

  // 6. CSV QuickBooks (plantilla)
  await write(
    "quickbooks_proveedores.csv",
    "name,acuerdo_monto\nDevCorp,800\nLatamDesign,2000\nCloudHost,1500\nAndesConsulting,1200",
  );

  // 7. PDF válido - no cuadra con acuerdo (DevCorp $950)
  await write(
    "INV-208_DevCorp_950_USD.pdf",
    makePdf([
      "Factura INV-208",
      "Emisor: DevCorp",
      "Monto: 950 USD",
      "Vencimiento: 2026-11-10",
      "Concepto: Soporte extendido y despliegue",
    ]),
  );

  // 8. PNG válido - moneda COP
  await write("INV-710_AndesConsulting_1200000_COP.png", makePng(240, 120));

  // 9. JSON maestro SAP
  await write(
    "sap_master.json",
    JSON.stringify(
      {
        proveedores_permitidos: ["DevCorp", "LatamDesign", "CloudHost", "AndesConsulting"],
        acuerdos_por_proveedor: { DevCorp: 800, LatamDesign: 2000, CloudHost: 1500 },
        presupuesto_mensual_restante: 5000,
      },
      null,
      2,
    ),
  );

  // 10. TXT - moneda MXN
  await write(
    "INV-512_AndesConsulting_8500_MXN.txt",
    "Estimados,\nLes compartimos la factura INV-512 de AndesConsulting.\nMonto: 8500 MXN\nFecha de vencimiento: 2026-11-25\nConcepto: Taller de transformacion digital",
  );

  console.log(`\n10 archivos generados en ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
