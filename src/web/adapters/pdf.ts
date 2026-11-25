import type { PdfAdapter, PdfDocument } from '@core/adapters';
import { brand } from '@core/theme/tokens';
import { ENTITY } from '@core/config';
import { saveViaHost } from './hostDownloads';

const B = import.meta.env.BASE_URL;
const FONT_FILES = { normal: `${B}fonts/Inter-Regular.ttf`, semibold: `${B}fonts/Inter-SemiBold.ttf`, bold: `${B}fonts/Inter-Bold.ttf` } as const;
const fontCache = new Map<string, string>();

async function loadFont(url: string): Promise<string> {
  const hit = fontCache.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font not found: ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const b64 = btoa(binary);
  fontCache.set(url, b64);
  return b64;
}

/** The embedded Inter subset covers Latin-1 and common punctuation; swap anything else. */
function safe(text: string): string {
  return text.replace(/→/g, 'to').replace(/[Ā-ſ]/g, (ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, ''));
}

async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:image/png;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

/** Natural size of public/logo.png, to keep its aspect ratio in the PDF. */
const LOGO_RATIO = 1083 / 398;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Client-side PDF confirmation: Cobanq wordmark, Inter, payment details and the entity footer. */
export const jsPdfAdapter: PdfAdapter = {
  async save(docSpec: PdfDocument) {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    let family = 'helvetica';
    try {
      const [regular, semibold, bold] = await Promise.all([loadFont(FONT_FILES.normal), loadFont(FONT_FILES.semibold), loadFont(FONT_FILES.bold)]);
      doc.addFileToVFS('Inter-Regular.ttf', regular);
      doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
      doc.addFileToVFS('Inter-SemiBold.ttf', semibold);
      doc.addFont('Inter-SemiBold.ttf', 'InterSemi', 'normal');
      doc.addFileToVFS('Inter-Bold.ttf', bold);
      doc.addFont('Inter-Bold.ttf', 'InterBold', 'normal');
      family = 'Inter';
    } catch {
      // Fonts unavailable (offline): fall back to the built-in face rather than fail the download.
    }
    const font = (weight: 'normal' | 'semibold' | 'bold'): void => {
      if (family === 'Inter') doc.setFont(weight === 'bold' ? 'InterBold' : weight === 'semibold' ? 'InterSemi' : 'Inter', 'normal');
      else doc.setFont('helvetica', weight === 'normal' ? 'normal' : 'bold');
    };

    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 48;
    const navy = hexToRgb(brand.primary);
    const teal = hexToRgb(brand.accent);
    const footerLines = docSpec.footer.flatMap((line) => { doc.setFontSize(7.5); font('normal'); return doc.splitTextToSize(safe(line), W - 2 * M) as string[]; });
    const footerHeight = footerLines.length * 10 + 22;
    let y = 0;

    const drawFooter = (): void => {
      doc.setDrawColor(221, 227, 236);
      doc.setLineWidth(0.5);
      doc.line(M, H - footerHeight - 8, W - M, H - footerHeight - 8);
      font('normal');
      doc.setFontSize(7.5);
      doc.setTextColor(85, 98, 117);
      footerLines.forEach((line, i) => doc.text(line, M, H - footerHeight + 6 + i * 10));
    };

    const logo = await loadImage(`${B}logo.png`);

    const drawHeader = (): void => {
      if (logo) {
        // The logo at its own aspect ratio and colours, with clear space around it.
        const h = 34;
        doc.addImage(logo, 'PNG', M, 36, h * LOGO_RATIO, h, 'cobanq-logo', 'FAST');
      } else {
        font('bold');
        doc.setFontSize(18);
        doc.setTextColor(...navy);
        doc.text(ENTITY.tradingName, M, 59);
      }
      y = 100;
    };

    const ensure = (space: number): void => {
      if (y + space > H - footerHeight - 20) {
        drawFooter();
        doc.addPage();
        drawHeader();
      }
    };

    drawHeader();
    font('bold');
    doc.setFontSize(20);
    doc.setTextColor(15, 27, 45);
    doc.text(safe(docSpec.title), M, y + 8);
    font('normal');
    doc.setFontSize(9.5);
    doc.setTextColor(85, 98, 117);
    doc.text(safe(docSpec.subtitle), M, y + 26);
    y += 46;

    // Headline amount panel
    doc.setFillColor(238, 242, 247);
    doc.roundedRect(M, y, W - 2 * M, 64, 10, 10, 'F');
    font('normal');
    doc.setFontSize(10);
    doc.setTextColor(85, 98, 117);
    doc.text(safe(docSpec.headline.label), M + 18, y + 25);
    font('bold');
    doc.setFontSize(22);
    doc.setTextColor(...navy);
    doc.text(safe(docSpec.headline.value), M + 18, y + 50);
    y += 88;

    for (const section of docSpec.sections) {
      ensure(48);
      font('semibold');
      doc.setFontSize(11);
      doc.setTextColor(...navy);
      doc.text(safe(section.title), M, y);
      y += 8;
      doc.setDrawColor(...teal);
      doc.setLineWidth(1.2);
      doc.line(M, y, M + 28, y);
      y += 16;
      for (const row of section.rows) {
        doc.setFontSize(9.5);
        font('semibold');
        const valueLines = doc.splitTextToSize(safe(row.value), W - 2 * M - 190) as string[];
        ensure(valueLines.length * 13 + 6);
        font('normal');
        doc.setTextColor(85, 98, 117);
        doc.text(safe(row.label), M, y);
        font('semibold');
        doc.setTextColor(15, 27, 45);
        doc.text(valueLines, M + 190, y);
        y += valueLines.length * 13 + 5;
      }
      y += 14;
    }

    drawFooter();
    if (!(await saveViaHost(docSpec.fileName, doc.output('blob')))) doc.save(docSpec.fileName);
  },
};
