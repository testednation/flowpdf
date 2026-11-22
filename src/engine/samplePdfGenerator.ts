import { PDFDocument } from 'pdf-lib';

interface SamplePageSpec {
  header: string;
  pageNum: string;
  skewDeg: number;
  title?: string;
  leftParagraphs: string[];
  rightParagraphs: string[];
  includeDiagram?: boolean;
}

const SAMPLE_PAGES: SamplePageSpec[] = [
  {
    header: 'TRANSACTIONS OF THE ROYAL GEOGRAPHICAL SOCIETY — VOL. XIV',
    pageNum: '142',
    skewDeg: 1.55,
    title: 'ON OPTICAL SURVEYING & BAROMETRIC ALTITUDES',
    leftParagraphs: [
      'In the course of alpine triangulation carried out during the autumn of 1893, considerable discrepancies were observed between mercurial barometers and aneroid dials exposed to rapid thermal shifts.',
      'When traversing high ridges above three thousand meters, the surveyor rarely enjoys the luxury of waiting two hours for brass casings to reach ambient equilibrium. Consequently, systematic drift enters every elevation log unless corrected by paired sighting.',
      'To test this hypothesis under reproducible field conditions, our expedition established four benchmark stations along the eastern ridge, taking simultaneous angular readings at dawn, noon, and twilight.',
      'Each observer recorded dry-bulb air temperature, wind azimuth, and barometric vernier height to within two hundredths of a millimeter. Even modest gusts produced transient pressure drops inside open tents.',
    ],
    rightParagraphs: [
      'Figure 1 illustrates the double-chambered sighting tube devised to shield the aneroid diaphragm from wind gusts while maintaining rapid thermal exchange through perforated copper ribs.',
      'Across forty-two paired observations, the shielded housing lowered residual altitude variance from nineteen meters down to four meters, closely rivaling the far heavier Fortin cistern instrument.',
      'We therefore recommend that small mobile survey parties carry dual compensated diaphragms calibrated against boiling-point hypsometers at every base camp prior to ascent.',
    ],
    includeDiagram: true,
  },
  {
    header: 'TRANSACTIONS OF THE ROYAL GEOGRAPHICAL SOCIETY — VOL. XIV',
    pageNum: '143',
    skewDeg: -1.25,
    leftParagraphs: [
      'Thermal refraction presents an equally subtle hazard in long-baseline optical leveling. Morning rays grazing sunlit limestone slopes bend downward, causing distant cairns to appear elevated above their true geometric horizon.',
      'By scheduling reciprocal sightings within fifteen minutes of one another, opposite refraction arcs cancel to first order. Remaining curvature errors follow a predictable quadratic law proportional to the square of station distance.',
      'In valleys floored with glacial silt, afternoon convection currents shimmer violently across the crosshairs, making precise stadia rod readings virtually impossible past four hundred paces.',
      'Field notebooks from earlier campaigns frequently omitted atmospheric humidity, assuming dry-air refraction constants held everywhere. Our hygrometer logs demonstrate that moist alpine mist alters optical density noticeably.',
    ],
    rightParagraphs: [
      'The reduction tables printed in Appendix B allow an engineer to apply barometric, thermal, and vapor-pressure corrections directly in camp using only four-figure logarithms.',
      'Where telegraph lines or heliograph mirrors permit synchronized noon flashes between summit and valley stations, absolute height differences can be resolved to better than one part in two thousand.',
      'Such precision proved decisive when mapping watershed divides along disputed mountain passes, eliminating the cumulative closure drift that plagued earlier single-barometer traverses.',
      'Future trials will evaluate lightweight aluminum tripods fitted with damped spirit levels capable of withstanding gale-force winds on exposed granite cols.',
    ],
  },
  {
    header: 'TRANSACTIONS OF THE ROYAL GEOGRAPHICAL SOCIETY — VOL. XIV',
    pageNum: '144',
    skewDeg: 0.95,
    leftParagraphs: [
      'A brief word is warranted regarding the preservation of archival field notebooks and printed lithographic plates. Damp saddlebags and coal-stove smoke rapidly yellow rag paper and soften iron-gall ink.',
      'When plates are later photographed or copied onto dense two-column quarto sheets, narrow gutters and small eight-point serif type strain the eye under lamplight or portable magnifiers.',
      'Careful optical restoration must first straighten skewed columns, lift faded gray lettering away from darkened paper fibers, and separate diagrams cleanly from surrounding prose.',
    ],
    rightParagraphs: [
      'Once individual word blocks are isolated from the original two-column plate, they may be rearranged into a generous single reading column suited to compact pocket folios without sacrificing mathematical notation.',
      'In closing, the authors extend sincere gratitude to the instrument makers of Zurich and London whose patient craftsmanship rendered these high-altitude measurements reliable.',
    ],
  },
];

/**
 * Generates an authentic rasterized 3-page vintage 2-column scanned PDF in memory
 * (aged paper tone, gutter shadow, slight scan skew, running headers, and a technical diagram)
 * so users can immediately test the real offline PDF -> k2pdfopt Reflow / EPUB pipeline.
 */
export async function generateSampleScannedPdf(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('On Optical Surveying & Barometric Altitudes (1894 Scan)');
  pdfDoc.setAuthor('H. V. Lindholm');

  // Letter quarto dimensions (612 x 792 pt), rendered at 170 DPI -> 1445 x 1870 px
  const pageW = 1275;
  const pageH = 1650;

  for (const spec of SAMPLE_PAGES) {
    const canvas = document.createElement('canvas');
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext('2d')!;

    // Aged warm rag paper base
    ctx.fillStyle = '#EAE2CE';
    ctx.fillRect(0, 0, pageW, pageH);

    // Subtle uneven book-spine gutter shadow on left edge & darkened outer scanner edge
    const spineGrad = ctx.createLinearGradient(0, 0, 140, 0);
    spineGrad.addColorStop(0, 'rgba(54, 44, 30, 0.34)');
    spineGrad.addColorStop(0.3, 'rgba(66, 54, 38, 0.12)');
    spineGrad.addColorStop(1, 'rgba(66, 54, 38, 0)');
    ctx.fillStyle = spineGrad;
    ctx.fillRect(0, 0, 140, pageH);

    // Slight dark scanner frame strips on top/right edges (tests Auto-Crop!)
    ctx.fillStyle = '#2B2620';
    ctx.fillRect(0, 0, pageW, 12);
    ctx.fillRect(pageW - 14, 0, 14, pageH);

    // Apply realistic scan skew around page center
    ctx.save();
    ctx.translate(pageW / 2, pageH / 2);
    ctx.rotate((spec.skewDeg * Math.PI) / 180);
    ctx.translate(-pageW / 2, -pageH / 2);

    // Subtle archival ink tone (slightly faded charcoal brown, not pure black)
    ctx.fillStyle = '#292521';
    ctx.strokeStyle = '#292521';

    // Running header (inside top 5% margin)
    ctx.font = '600 17px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.fillText(spec.header, pageW / 2, 82);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(125, 96);
    ctx.lineTo(pageW - 125, 96);
    ctx.stroke();

    // Footer page number
    ctx.font = '500 18px Georgia, "Times New Roman", serif';
    ctx.fillText(`— ${spec.pageNum} —`, pageW / 2, pageH - 68);

    ctx.textAlign = 'left';
    const marginX = 128;
    const gutterW = 58;
    const colW = (pageW - marginX * 2 - gutterW) / 2;
    const leftX = marginX;
    const rightX = marginX + colW + gutterW;
    let leftY = 158;
    let rightY = 158;

    // Optional full-width chapter title on Page 1
    if (spec.title) {
      ctx.font = '700 28px Georgia, "Times New Roman", serif';
      ctx.textAlign = 'center';
      ctx.fillText(spec.title, pageW / 2, 162);
      ctx.font = 'italic 20px Georgia, "Times New Roman", serif';
      ctx.fillText('By H. V. Lindholm, Fellow of the Survey Institute', pageW / 2, 200);
      ctx.textAlign = 'left';
      leftY = 264;
      rightY = 264;
    }

    // Draw Left Column
    ctx.font = '400 23px Georgia, "Times New Roman", serif';
    for (const para of spec.leftParagraphs) {
      leftY = drawWrappedParagraph(ctx, para, leftX, leftY, colW, 34, 34);
      leftY += 16;
    }

    // Draw Right Column (with optional inline technical diagram)
    if (spec.includeDiagram) {
      rightY = drawBarometricDiagram(ctx, rightX, rightY, colW, 250);
      rightY += 28;
    }

    ctx.font = '400 23px Georgia, "Times New Roman", serif';
    for (const para of spec.rightParagraphs) {
      rightY = drawWrappedParagraph(ctx, para, rightX, rightY, colW, 34, 34);
      rightY += 16;
    }

    ctx.restore();

    // Add light archival film grain so it behaves like a real paper scan
    addSubtlePaperGrain(ctx, pageW, pageH);

    // Embed rasterized JPEG scan page into PDF
    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.84);
    const jpegBytes = base64ToBytes(jpegDataUrl.split(',')[1]);
    const jpgImage = await pdfDoc.embedJpg(jpegBytes);
    const pdfPage = pdfDoc.addPage([612, 792]);
    pdfPage.drawImage(jpgImage, { x: 0, y: 0, width: 612, height: 792 });
  }

  return pdfDoc.save();
}

function drawWrappedParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  firstLineIndent: number
): number {
  const words = text.split(/\s+/);
  let y = startY;
  let line = '';
  let isFirstLine = true;

  for (let i = 0; i < words.length; i++) {
    const indent = isFirstLine ? firstLineIndent : 0;
    const candidate = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(candidate).width + indent > maxWidth && line) {
      ctx.fillText(line, x + indent, y);
      y += lineHeight;
      line = words[i];
      isFirstLine = false;
    } else {
      line = candidate;
    }
  }
  if (line) {
    const indent = isFirstLine ? firstLineIndent : 0;
    ctx.fillText(line, x + indent, y);
    y += lineHeight;
  }
  return y;
}

function drawBarometricDiagram(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): number {
  ctx.save();
  ctx.strokeStyle = '#2A2520';
  ctx.fillStyle = '#2A2520';
  ctx.lineWidth = 2.2;

  // Outer technical plate frame
  ctx.strokeRect(x + 12, y, w - 24, h - 30);

  // Double-chambered cylindrical tube schematic
  const cx = x + w / 2;
  const cy = y + (h - 30) / 2;
  ctx.strokeRect(cx - 140, cy - 42, 280, 84);
  ctx.strokeRect(cx - 105, cy - 26, 210, 52);

  // Copper baffle ribs
  for (let rx = -80; rx <= 80; rx += 32) {
    ctx.beginPath();
    ctx.moveTo(cx + rx, cy - 42);
    ctx.lineTo(cx + rx, cy - 26);
    ctx.moveTo(cx + rx, cy + 26);
    ctx.lineTo(cx + rx, cy + 42);
    ctx.stroke();
  }

  // Center aneroid capsule circle & needle
  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + 14, cy - 11);
  ctx.stroke();

  // Sighting crosshairs left & right
  ctx.beginPath();
  ctx.moveTo(cx - 175, cy);
  ctx.lineTo(cx - 140, cy);
  ctx.moveTo(cx + 140, cy);
  ctx.lineTo(cx + 175, cy);
  ctx.stroke();

  // Plate caption
  ctx.font = 'italic 17px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText('Fig. 1. Shielded Aneroid Sighting Housing (Scale 1:4)', cx, y + h - 6);
  ctx.restore();
  return y + h;
}

function addSubtlePaperGrain(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Lightweight deterministic speckles for authentic vintage scan feel
  ctx.fillStyle = 'rgba(72, 60, 44, 0.08)';
  let seed = 1894;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1600; i++) {
    const px = Math.floor(nextRand() * w);
    const py = Math.floor(nextRand() * h);
    const sz = nextRand() > 0.85 ? 2 : 1;
    ctx.fillRect(px, py, sz, sz);
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
