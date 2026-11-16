import fs from 'node:fs/promises';
import path from 'node:path';
import { replaceZipEntryBytes } from '@/app/zipPatch';

function sanitizeFilename(raw: string): string {
  const base = raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const ensured = base.toLowerCase().endsWith('.docx') ? base : `${base || 'UPHSD_Physics_Lab_Report'}.docx`;
  return ensured;
}

async function loadDocxTemplateBytes(requestUrl: string): Promise<Uint8Array> {
  try {
    const diskPath = path.join(
      process.cwd(),
      'public',
      'assets',
      'report',
      'physics_lab_manual_template.docx'
    );
    const buf = await fs.readFile(diskPath);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } catch {
    // Fallback for edge/worker environments where public files are served by asset URL
    const assetUrl = new URL('/assets/report/physics_lab_manual_template.docx', requestUrl);
    const res = await fetch(assetUrl.toString());
    if (!res.ok) {
      throw new Error(`Could not load docx template (${res.status})`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let xml = '';
    let filename = 'UPHSD_Physics_Lab_Report.docx';

    if (contentType.includes('application/json')) {
      const body = (await request.json()) as { xml?: string; filename?: string };
      xml = typeof body.xml === 'string' ? body.xml : '';
      filename = typeof body.filename === 'string' ? body.filename : filename;
    } else {
      const form = await request.formData();
      const xmlField = form.get('xml');
      const nameField = form.get('filename');
      xml = typeof xmlField === 'string' ? xmlField : '';
      filename = typeof nameField === 'string' ? nameField : filename;
    }

    if (!xml || !xml.includes('<w:document')) {
      return new Response(JSON.stringify({ error: 'Invalid laboratory document XML payload.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const safeName = sanitizeFilename(filename);
    const templateBytes = await loadDocxTemplateBytes(request.url);
    const xmlBytes = new TextEncoder().encode(xml);
    const finalDocxBytes = replaceZipEntryBytes(templateBytes, 'word/document.xml', xmlBytes);

    const responseBuffer = new ArrayBuffer(finalDocxBytes.byteLength);
    new Uint8Array(responseBuffer).set(finalDocxBytes);

    return new Response(responseBuffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Content-Length': String(finalDocxBytes.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Failed to export .docx report:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'DOCX export failed' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
