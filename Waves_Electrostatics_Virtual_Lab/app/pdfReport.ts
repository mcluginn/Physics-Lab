function ascii(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/μ/g, 'u')
    .replace(/λ/g, 'lambda')
    .replace(/₁/g, '1')
    .replace(/₂/g, '2')
    .replace(/²/g, '^2')
    .replace(/°/g, ' deg')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '?');
}

function escapePdfText(value: string) {
  return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function createLaboratoryPdf(lines: string[]) {
  const encoder = new TextEncoder();
  const wrapped: string[] = [];
  lines.forEach((line) => {
    const clean = ascii(line || ' ');
    if (clean.length <= 88) {
      wrapped.push(clean);
      return;
    }
    let remaining = clean;
    while (remaining.length > 88) {
      let breakAt = remaining.lastIndexOf(' ', 88);
      if (breakAt < 35) breakAt = 88;
      wrapped.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    wrapped.push(remaining || ' ');
  });

  const linesPerPage = 46;
  const pages = Array.from({ length: Math.max(1, Math.ceil(wrapped.length / linesPerPage)) }, (_, index) => wrapped.slice(index * linesPerPage, (index + 1) * linesPerPage));
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const pageReferences = pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ');
  objects[2] = `<< /Type /Pages /Kids [${pageReferences}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  pages.forEach((pageLines, index) => {
    const pageObject = 4 + index * 2;
    const contentObject = pageObject + 1;
    const content = pageLines.map((line, lineIndex) => {
      const y = 744 - lineIndex * 15;
      const size = lineIndex === 0 && index === 0 ? 16 : line.startsWith('===') ? 12 : 9.5;
      return `BT /F1 ${size} Tf 54 ${y} Td (${escapePdfText(line.replace(/^===|===$/g, '').trim())}) Tj ET`;
    }).join('\n');
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = encoder.encode(pdf).length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}
