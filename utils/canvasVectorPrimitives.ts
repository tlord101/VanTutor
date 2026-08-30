/**
 * Ultra-Lightweight Educational Vector Primitives & Stroke Engine
 * Provides:
 * - Pressure-sensitive Bézier polygon stroke smoothing (perfect-freehand math)
 * - Hand-drawn organic academic lines, coordinate axes, and geometry
 * - Smooth step-by-step curve plotting with progressive interpolation
 * - Tutor laser pointer & glowing focus rings
 */

export interface Point2D {
  x: number;
  y: number;
  pressure?: number;
}

export interface StrokeOptions {
  size?: number;
  thinning?: number;
  smoothing?: number;
  streamline?: number;
  color?: string;
  simulatePressure?: boolean;
}

/**
 * Computes pressure-sensitive smooth vector polygon outlines for stylus/finger strokes.
 */
export const getSmoothStrokeOutline = (
  points: Point2D[],
  options: StrokeOptions = {}
): Point2D[] => {
  if (points.length === 0) return [];
  if (points.length === 1) {
    const p = points[0];
    const r = (options.size || 8) / 2;
    return [
      { x: p.x - r, y: p.y - r },
      { x: p.x + r, y: p.y - r },
      { x: p.x + r, y: p.y + r },
      { x: p.x - r, y: p.y + r },
    ];
  }

  const size = options.size || 6;
  const thinning = options.thinning ?? 0.5;
  const leftPts: Point2D[] = [];
  const rightPts: Point2D[] = [];

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];

    // Vector direction
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const pressure = curr.pressure ?? (1 - (i / points.length) * 0.2);
    const radius = Math.max(1.5, (size / 2) * (1 - thinning + thinning * pressure));

    leftPts.push({ x: curr.x + nx * radius, y: curr.y + ny * radius });
    rightPts.push({ x: curr.x - nx * radius, y: curr.y - ny * radius });
  }

  return [...leftPts, ...rightPts.reverse()];
};

/**
 * Renders smooth pressure-sensitive stroke onto an HTML5 Canvas context
 */
export const renderStrokeToContext = (
  ctx: CanvasRenderingContext2D,
  points: Point2D[],
  color = '#0066FF',
  size = 4
) => {
  if (points.length < 2) return;
  const outline = getSmoothStrokeOutline(points, { size, color });
  if (outline.length < 3) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(outline[0].x, outline[0].y);
  for (let i = 1; i < outline.length; i++) {
    ctx.lineTo(outline[i].x, outline[i].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

/**
 * Draws a hand-drawn academic line with slight organic curvature
 */
export const drawHandDrawnLine = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: { color?: string; width?: number; roughness?: number } = {}
) => {
  const { color = '#0F172A', width = 2, roughness = 1.2 } = options;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const segments = Math.max(3, Math.floor(dist / 30));

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const px = x1 + dx * t + (Math.random() - 0.5) * roughness;
    const py = y1 + dy * t + (Math.random() - 0.5) * roughness;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
};

/**
 * Draws Cartesian Coordinate Axes with step labels and arrowheads
 */
export const drawCoordinateAxes = (
  ctx: CanvasRenderingContext2D,
  config: {
    originX: number;
    originY: number;
    width: number;
    height: number;
    xLabel?: string;
    yLabel?: string;
    gridStep?: number;
    color?: string;
    progress?: number;
  }
) => {
  const {
    originX,
    originY,
    width,
    height,
    xLabel = 'x',
    yLabel = 'y',
    gridStep = 40,
    color = '#64748B',
    progress = 1.0,
  } = config;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.font = '12px Inter, sans-serif';

  // Draw X Axis (left to right)
  const currentXWidth = width * Math.min(1.0, progress * 1.5);
  ctx.beginPath();
  ctx.moveTo(originX - 20, originY);
  ctx.lineTo(originX + currentXWidth, originY);
  ctx.stroke();

  // X Arrowhead
  if (progress >= 0.7) {
    ctx.beginPath();
    ctx.moveTo(originX + currentXWidth, originY);
    ctx.lineTo(originX + currentXWidth - 8, originY - 5);
    ctx.lineTo(originX + currentXWidth - 8, originY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillText(xLabel, originX + currentXWidth + 6, originY + 4);
  }

  // Draw Y Axis (bottom to top)
  const currentYHeight = height * Math.min(1.0, progress * 1.5);
  ctx.beginPath();
  ctx.moveTo(originX, originY + 20);
  ctx.lineTo(originX, originY - currentYHeight);
  ctx.stroke();

  // Y Arrowhead
  if (progress >= 0.7) {
    ctx.beginPath();
    ctx.moveTo(originX, originY - currentYHeight);
    ctx.lineTo(originX - 5, originY - currentYHeight + 8);
    ctx.lineTo(originX + 5, originY - currentYHeight + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillText(yLabel, originX - 4, originY - currentYHeight - 10);
  }

  // Ticks along axes
  if (progress >= 0.9) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = `${color}66`;
    for (let x = originX + gridStep; x < originX + width - 20; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, originY - 3);
      ctx.lineTo(x, originY + 3);
      ctx.stroke();
    }
    for (let y = originY - gridStep; y > originY - height + 20; y -= gridStep) {
      ctx.beginPath();
      ctx.moveTo(originX - 3, y);
      ctx.lineTo(originX + 3, y);
      ctx.stroke();
    }
  }

  ctx.restore();
};

/**
 * Draws an animated function curve (e.g. parabola, sine wave, exponential)
 */
export const drawAnimatedCurve = (
  ctx: CanvasRenderingContext2D,
  points: Point2D[],
  progress = 1.0,
  options: { color?: string; width?: number; glowColor?: string } = {}
) => {
  if (points.length < 2) return;
  const { color = '#0066FF', width = 3, glowColor = 'rgba(0, 102, 255, 0.25)' } = options;

  const totalPointsToRender = Math.max(2, Math.floor(points.length * Math.min(1.0, Math.max(0, progress))));
  const renderedPoints = points.slice(0, totalPointsToRender);

  ctx.save();
  // Soft outer glow
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = width + 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(renderedPoints[0].x, renderedPoints[0].y);
  for (let i = 1; i < renderedPoints.length; i++) {
    ctx.lineTo(renderedPoints[i].x, renderedPoints[i].y);
  }
  ctx.stroke();

  // Crisp inner curve
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(renderedPoints[0].x, renderedPoints[0].y);
  for (let i = 1; i < renderedPoints.length; i++) {
    ctx.lineTo(renderedPoints[i].x, renderedPoints[i].y);
  }
  ctx.stroke();

  // Active pen head leading the drawing
  if (progress < 1.0 && renderedPoints.length > 0) {
    const tip = renderedPoints[renderedPoints.length - 1];
    drawLaserPointerGlow(ctx, tip.x, tip.y, color);
  }

  ctx.restore();
};

/**
 * Draws an educational arrow pointer with text callout
 */
export const drawAnnotatedArrow = (
  ctx: CanvasRenderingContext2D,
  from: Point2D,
  to: Point2D,
  label = '',
  color = '#002D62'
) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dy, dx);
  const headLen = 10;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.font = 'bold 12px Inter, sans-serif';

  // Shaft
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  // Label
  if (label) {
    ctx.fillText(label, from.x - 4, from.y - 6);
  }

  ctx.restore();
};

/**
 * Glowing laser pointer / stylus tip representing the tutor's pen on the board
 */
export const drawLaserPointerGlow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color = '#0066FF'
) => {
  ctx.save();
  // Ambient glow
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, 16);
  gradient.addColorStop(0, `${color}CC`);
  gradient.addColorStop(0.5, `${color}44`);
  gradient.addColorStop(1, 'transparent');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fill();

  // Bright center core
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/**
 * Breathing focus ring that highlights an equation or diagram area when the tutor discusses it
 */
export const drawPulsingFocusRing = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pulseTime: number,
  color = '#0066FF'
) => {
  const scale = 1 + 0.05 * Math.sin(pulseTime * 4);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const scaledW = w * scale;
  const scaledH = h * scale;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.fillStyle = `${color}12`;
  ctx.beginPath();
  ctx.roundRect(cx - scaledW / 2, cy - scaledH / 2, scaledW, scaledH, 12);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

/**
 * Draws a clean, structured Academic Table with rows, columns, and animated active row highlighting
 * Perfect for Law, Medicine, Economics, Engineering, Biology, etc.
 */
export const drawAcademicTable = (
  ctx: CanvasRenderingContext2D,
  config: {
    x: number;
    y: number;
    width: number;
    headers: string[];
    rows: string[][];
    progress?: number;
    activeRowIndex?: number;
    color?: string;
  }
) => {
  const { x, y, width, headers, rows, progress = 1.0, activeRowIndex, color = '#002D62' } = config;
  const colWidth = width / headers.length;
  const rowHeight = 36;
  const totalRowsToRender = Math.max(0, Math.min(rows.length, Math.floor(rows.length * progress)));

  ctx.save();
  ctx.font = 'bold 13px Inter, sans-serif';

  // 1. Table Header Bar
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, width, rowHeight, [10, 10, 0, 0]);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  headers.forEach((header, idx) => {
    ctx.fillText(header, x + idx * colWidth + 12, y + 23);
  });

  // 2. Table Rows
  ctx.font = '12px Inter, sans-serif';
  for (let r = 0; r < totalRowsToRender; r++) {
    const rowY = y + (r + 1) * rowHeight;
    const isRowActive = activeRowIndex === r;

    // Row Background (Alternating / Active highlight)
    if (isRowActive) {
      ctx.fillStyle = 'rgba(0, 102, 255, 0.12)';
    } else {
      ctx.fillStyle = r % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    }
    ctx.fillRect(x, rowY, width, rowHeight);

    // Row Borders
    ctx.strokeStyle = isRowActive ? '#0066FF' : '#E2E8F0';
    ctx.lineWidth = isRowActive ? 1.5 : 1;
    ctx.strokeRect(x, rowY, width, rowHeight);

    // Cell Texts
    ctx.fillStyle = isRowActive ? '#002D62' : '#1E293B';
    rows[r]?.forEach((cell, cIdx) => {
      ctx.fillText(cell, x + cIdx * colWidth + 12, rowY + 22);
    });
  }

  ctx.restore();
};

/**
 * Draws a Key Takeaway / Highlighted Keyword Card on the board
 */
export const drawKeyTakeawayCard = (
  ctx: CanvasRenderingContext2D,
  config: {
    x: number;
    y: number;
    width: number;
    title: string;
    keywords: string[];
    summary: string;
    progress?: number;
    color?: string;
  }
) => {
  const { x, y, width, title, keywords, summary, color = '#0066FF' } = config;
  const height = 110;

  ctx.save();
  // Card Container with soft shadow
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 16);
  ctx.fill();
  ctx.stroke();

  // Left accent bar
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, 6, height, [16, 0, 0, 16]);
  ctx.fill();

  // Title
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(title, x + 18, y + 26);

  // Keyword badges
  let badgeX = x + 18;
  const badgeY = y + 40;
  ctx.font = 'bold 10px Inter, sans-serif';
  keywords.forEach((kw) => {
    const textWidth = ctx.measureText(kw).width;
    ctx.fillStyle = `${color}18`;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, textWidth + 14, 20, 10);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.fillText(kw, badgeX + 7, badgeY + 14);
    badgeX += textWidth + 20;
  });

  // Summary Text
  ctx.font = '12px Inter, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText(summary, x + 18, y + 84);

  ctx.restore();
};

/**
 * Draws a Step-by-Step Flowchart / Conceptual Pipeline
 */
export const drawConceptFlowchart = (
  ctx: CanvasRenderingContext2D,
  config: {
    x: number;
    y: number;
    nodes: Array<{ title: string; subtitle?: string }>;
    activeNodeIndex?: number;
    color?: string;
  }
) => {
  const { x, y, nodes, activeNodeIndex = 0, color = '#0066FF' } = config;
  const nodeWidth = 140;
  const nodeHeight = 56;
  const gap = 36;

  ctx.save();
  nodes.forEach((node, idx) => {
    const nodeX = x + idx * (nodeWidth + gap);
    const isActive = activeNodeIndex === idx;

    // Node Box
    ctx.fillStyle = isActive ? `${color}15` : '#FFFFFF';
    ctx.strokeStyle = isActive ? color : '#CBD5E1';
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(nodeX, y, nodeWidth, nodeHeight, 12);
    ctx.fill();
    ctx.stroke();

    // Node Title
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = isActive ? color : '#0F172A';
    ctx.fillText(node.title, nodeX + 12, y + 24);

    // Node Subtitle
    if (node.subtitle) {
      ctx.font = '10px Inter, sans-serif';
      ctx.fillStyle = '#64748B';
      ctx.fillText(node.subtitle, nodeX + 12, y + 42);
    }

    // Connector Arrow to next node
    if (idx < nodes.length - 1) {
      const arrowStartX = nodeX + nodeWidth + 4;
      const arrowEndX = arrowStartX + gap - 8;
      const arrowY = y + nodeHeight / 2;

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(arrowStartX, arrowY);
      ctx.lineTo(arrowEndX, arrowY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(arrowEndX, arrowY);
      ctx.lineTo(arrowEndX - 6, arrowY - 4);
      ctx.lineTo(arrowEndX - 6, arrowY + 4);
      ctx.closePath();
      ctx.fill();
    }
  });

  ctx.restore();
};

/**
 * Renders universal, expressive educational illustrations for any course
 * (Biology Anatomy, Circuit Schematics, Economic Market Shifts, Optics, Law Hierarchies)
 */
export const drawRichIllustration = (
  ctx: CanvasRenderingContext2D,
  config: {
    type: 'market_equilibrium' | 'cell_anatomy' | 'circuit_schematic' | 'optics_lens' | 'hierarchy_tree' | 'photosynthesis_plant';
    x: number;
    y: number;
    width: number;
    height: number;
    progress?: number;
    labels?: string[];
    color?: string;
  }
) => {
  const { type, x, y, width, height, progress = 1.0, labels = [], color = '#0066FF' } = config;

  ctx.save();
  if (type === 'market_equilibrium') {
    // 1. Demand & Supply Equilibrium with shaded surplus
    const originX = x + 40;
    const originY = y + height - 30;
    const axisW = width - 60;
    const axisH = height - 50;

    // Axes
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(originX, originY - axisH);
    ctx.lineTo(originX, originY);
    ctx.lineTo(originX + axisW, originY);
    ctx.stroke();

    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#64748B';
    ctx.fillText('Price P', originX - 35, originY - axisH + 10);
    ctx.fillText('Quantity Q', originX + axisW - 20, originY + 18);

    const prog = Math.min(1.0, progress);

    // Demand Curve (Downward sloping)
    ctx.strokeStyle = '#DC2626'; // Red
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(originX + 20, originY - axisH + 20);
    ctx.lineTo(originX + 20 + (axisW - 40) * prog, originY - axisH + 20 + (axisH - 40) * prog);
    ctx.stroke();
    ctx.fillStyle = '#DC2626';
    ctx.fillText('Demand (D)', originX + axisW - 30, originY - 10);

    // Supply Curve (Upward sloping)
    ctx.strokeStyle = '#0066FF'; // Blue
    ctx.beginPath();
    ctx.moveTo(originX + 20, originY - 20);
    ctx.lineTo(originX + 20 + (axisW - 40) * prog, originY - 20 - (axisH - 40) * prog);
    ctx.stroke();
    ctx.fillStyle = '#0066FF';
    ctx.fillText('Supply (S)', originX + axisW - 30, originY - axisH + 30);

    // Equilibrium Point (E*)
    if (progress >= 0.8) {
      const eqX = originX + axisW / 2;
      const eqY = originY - axisH / 2;
      ctx.fillStyle = '#002D62';
      ctx.beginPath();
      ctx.arc(eqX, eqY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Dashed Equilibrium Lines
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(eqX, eqY);
      ctx.lineTo(originX, eqY);
      ctx.moveTo(eqX, eqY);
      ctx.lineTo(eqX, originY);
      ctx.stroke();

      ctx.fillStyle = '#002D62';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText('Equilibrium E* (P*, Q*)', eqX + 10, eqY - 8);
    }
  } else if (type === 'cell_anatomy') {
    // 2. Biological Cell Anatomy (Membrane, Cytoplasm, Nucleus, Organelles)
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width * 0.42;
    const ry = height * 0.38;

    // Outer Membrane
    ctx.strokeStyle = '#059669'; // Emerald
    ctx.lineWidth = 3.5;
    ctx.fillStyle = 'rgba(5, 150, 105, 0.06)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * Math.min(1.0, progress), ry * Math.min(1.0, progress), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Nucleus
    if (progress >= 0.5) {
      ctx.fillStyle = '#0066FF';
      ctx.strokeStyle = '#002D62';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx - 30, cy - 10, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Nucleolus core
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(cx - 30, cy - 10, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillStyle = '#0F172A';
      ctx.fillText('Nucleus (DNA)', cx - 75, cy - 50);
    }

    // Mitochondria / Organelles
    if (progress >= 0.8) {
      ctx.fillStyle = '#D97706'; // Amber
      ctx.beginPath();
      ctx.ellipse(cx + 60, cy + 20, 20, 10, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText('Mitochondria (ATP)', cx + 70, cy + 38);
    }
  } else if (type === 'circuit_schematic') {
    // 3. Electrical Circuit Schematic (Battery, Resistor, Switch, Current Loop)
    const left = x + 40;
    const right = x + width - 40;
    const top = y + 30;
    const bottom = y + height - 30;

    ctx.strokeStyle = '#002D62';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, bottom);
    ctx.lineTo(left, bottom);
    ctx.lineTo(left, top);
    ctx.stroke();

    // Battery on left
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(left - 10, top + (bottom - top) / 2 - 25, 20, 50);
    ctx.strokeStyle = '#002D62';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left - 14, top + (bottom - top) / 2 - 12);
    ctx.lineTo(left + 14, top + (bottom - top) / 2 - 12);
    ctx.moveTo(left - 8, top + (bottom - top) / 2 + 12);
    ctx.lineTo(left + 8, top + (bottom - top) / 2 + 12);
    ctx.stroke();

    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#0066FF';
    ctx.fillText('Voltage Source (V)', left - 35, top + (bottom - top) / 2 + 38);

    // Resistor zigzag on top
    const midTop = (left + right) / 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(midTop - 25, top - 8, 50, 16);
    ctx.strokeStyle = '#002D62';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(midTop - 20, top);
    ctx.lineTo(midTop - 12, top - 8);
    ctx.lineTo(midTop - 4, top + 8);
    ctx.lineTo(midTop + 4, top - 8);
    ctx.lineTo(midTop + 12, top + 8);
    ctx.lineTo(midTop + 20, top);
    ctx.stroke();

    ctx.fillText('Load Resistance (R)', midTop - 50, top - 14);
  } else if (type === 'optics_lens' || (type as string) === 'photosynthesis_plant') {
    // Photosynthesis / Plant Energy Flow Illustration
    const cx = x + width / 2;
    const cy = y + height / 2;

    // 1. Sun & Light Energy
    ctx.fillStyle = '#FFA500';
    ctx.beginPath();
    ctx.arc(cx - 100, cy - 60, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FF8C00';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sun rays
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const rx1 = (cx - 100) + Math.cos(angle) * 26;
      const ry1 = (cy - 60) + Math.sin(angle) * 26;
      const rx2 = (cx - 100) + Math.cos(angle) * 34;
      const ry2 = (cy - 60) + Math.sin(angle) * 34;
      ctx.beginPath();
      ctx.moveTo(rx1, ry1);
      ctx.lineTo(rx2, ry2);
      ctx.stroke();
    }

    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#002D62';
    ctx.fillText('Light Energy (Photons)', cx - 140, cy - 90);

    // 2. Leaf Structure
    ctx.fillStyle = 'rgba(0, 102, 255, 0.08)';
    ctx.strokeStyle = '#002D62';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx + 40, cy, 75, 45, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Leaf main vein
    ctx.strokeStyle = '#0066FF';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy - 25);
    ctx.quadraticCurveTo(cx + 40, cy, cx + 105, cy + 25);
    ctx.stroke();

    // Chloroplast / Chlorophyll label
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText('Chloroplast (Chlorophyll)', cx + 10, cy + 60);

    // Energy Arrow (Sun -> Leaf)
    ctx.strokeStyle = '#0066FF';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - 75, cy - 45);
    ctx.quadraticCurveTo(cx - 20, cy - 35, cx + 15, cy - 15);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
};

/**
 * Draws formula breakdown with token boxes and semantic labels
 */
export const drawFormulaBreakdown = (
  ctx: CanvasRenderingContext2D,
  config: {
    x: number;
    y: number;
    formula: string;
    tokens: Array<{ symbol: string; label: string; highlighted?: boolean; color?: string }>;
  }
) => {
  const { x, y, formula, tokens } = config;
  ctx.save();

  // Draw main formula header
  ctx.font = 'bold 22px "KaTeX_Main", "Times New Roman", serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(formula, x, y);

  // Draw breakdown tokens beneath
  let curX = x;
  const tokenY = y + 45;

  ctx.font = '12px Inter, sans-serif';
  tokens.forEach((t) => {
    const isHigh = Boolean(t.highlighted);
    const boxW = Math.max(70, ctx.measureText(t.label).width + 24);

    // Token Card
    ctx.fillStyle = isHigh ? '#F1F5F9' : '#FFFFFF';
    ctx.strokeStyle = isHigh ? '#0066FF' : '#E3E9F1';
    ctx.lineWidth = isHigh ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(curX, tokenY, boxW, 44, 8);
    ctx.fill();
    ctx.stroke();

    // Symbol
    ctx.font = 'bold 14px "KaTeX_Main", serif';
    ctx.fillStyle = isHigh ? '#0066FF' : '#002D62';
    ctx.fillText(t.symbol, curX + 12, tokenY + 20);

    // Label
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = '#64748B';
    ctx.fillText(t.label, curX + 12, tokenY + 36);

    curX += boxW + 12;
  });

  ctx.restore();
};

/**
 * Draws organic hand-drawn callout circle around a target area
 */
export const drawOrganicCallout = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color = '#0066FF'
) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const rx = width / 2 + 8;
  const ry = height / 2 + 8;
  const cx = x + width / 2;
  const cy = y + height / 2;

  // Slight organic overlap
  ctx.ellipse(cx, cy, rx, ry, -0.05, 0, Math.PI * 2.15);
  ctx.stroke();
  ctx.restore();
};

/**
 * Smooth chalkboard eraser wipe transition
 */
export const drawEraseWipeEffect = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number
) => {
  if (progress <= 0 || progress >= 1.0) return;
  ctx.save();
  const wipeX = width * progress;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillRect(0, 0, wipeX, height);

  // Soft trailing eraser line
  ctx.strokeStyle = 'rgba(0, 102, 255, 0.3)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(wipeX, 0);
  ctx.lineTo(wipeX, height);
  ctx.stroke();
  ctx.restore();
};

export interface TargetBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  centerX: number;
  centerY: number;
  topAnchor: Point2D;
  bottomAnchor: Point2D;
  leftAnchor: Point2D;
  rightAnchor: Point2D;
}

/**
 * Resolves exact canvas bounding box and anchors for any named target ID
 * (handles illustration subcomponents like "resistor", "battery", "sun", "leaf", "mitochondrion", etc.)
 */
export const resolveTargetAnchorBounds = (
  target: string | Point2D,
  elements: any[],
  canvasWidth: number,
  canvasHeight: number
): TargetBounds => {
  // If direct Point2D coordinate
  if (typeof target !== 'string') {
    const pt = target;
    return {
      x: pt.x - 10,
      y: pt.y - 10,
      w: 20,
      h: 20,
      centerX: pt.x,
      centerY: pt.y,
      topAnchor: { x: pt.x, y: pt.y - 10 },
      bottomAnchor: { x: pt.x, y: pt.y + 10 },
      leftAnchor: { x: pt.x - 10, y: pt.y },
      rightAnchor: { x: pt.x + 10, y: pt.y },
    };
  }

  const targetKey = target.toLowerCase().trim();

  // 1. Search for matching element ID or LaTeX text
  for (const el of elements) {
    if (el.id && el.id.toLowerCase() === targetKey) {
      const x = el.x ?? (canvasWidth * 0.3);
      const y = el.y ?? (canvasHeight * 0.3);
      const w = el.width ?? 120;
      const h = el.height ?? 60;
      return {
        x,
        y,
        w,
        h,
        centerX: x + w / 2,
        centerY: y + h / 2,
        topAnchor: { x: x + w / 2, y },
        bottomAnchor: { x: x + w / 2, y: y + h },
        leftAnchor: { x, y: y + h / 2 },
        rightAnchor: { x: x + w, y: y + h / 2 },
      };
    }
  }

  // 2. Search inside illustration subcomponents
  for (const el of elements) {
    if (el.type === 'illustration') {
      const ix = el.x ?? (canvasWidth * 0.2);
      const iy = el.y ?? (canvasHeight * 0.2);
      const iw = el.width ?? 300;
      const ih = el.height ?? 200;
      const cx = ix + iw / 2;
      const cy = iy + ih / 2;

      // Circuit targets
      if (el.illustrationType === 'circuit_schematic') {
        const left = ix + 40;
        const right = ix + iw - 40;
        const top = iy + 30;
        const bottom = iy + ih - 30;
        const midTop = (left + right) / 2;

        if (targetKey.includes('resistor') || targetKey === 'r' || targetKey.includes('load')) {
          const bx = midTop - 30, by = top - 20, bw = 60, bh = 36;
          return createBounds(bx, by, bw, bh);
        }
        if (targetKey.includes('battery') || targetKey === 'v' || targetKey.includes('voltage') || targetKey.includes('source')) {
          const bx = left - 25, by = top + (bottom - top) / 2 - 25, bw = 40, bh = 50;
          return createBounds(bx, by, bw, bh);
        }
        if (targetKey.includes('current') || targetKey === 'i' || targetKey.includes('wire')) {
          const bx = right - 15, by = top + (bottom - top) / 2 - 20, bw = 30, bh = 40;
          return createBounds(bx, by, bw, bh);
        }
      }

      // Photosynthesis / Plant targets
      if (el.illustrationType === 'photosynthesis_plant' || el.illustrationType === 'optics_lens') {
        if (targetKey.includes('sun') || targetKey.includes('light') || targetKey.includes('photon')) {
          return createBounds(cx - 130, cy - 90, 60, 60);
        }
        if (targetKey.includes('leaf') || targetKey.includes('plant')) {
          return createBounds(cx - 20, cy - 40, 140, 80);
        }
        if (targetKey.includes('chloroplast') || targetKey.includes('chlorophyll') || targetKey.includes('stroma')) {
          return createBounds(cx + 20, cy - 25, 90, 50);
        }
      }

      // Cell Anatomy targets
      if (el.illustrationType === 'cell_anatomy') {
        if (targetKey.includes('mitochondri') || targetKey.includes('atp')) {
          return createBounds(cx + 45, cy + 10, 60, 40);
        }
        if (targetKey.includes('nucleus') || targetKey.includes('dna')) {
          return createBounds(cx - 65, cy - 45, 70, 70);
        }
        if (targetKey.includes('membrane')) {
          return createBounds(ix + 10, iy + 10, iw - 20, ih - 20);
        }
      }
    }
  }

  // 3. Fallback: Center canvas default bounds
  const fallbackX = canvasWidth * 0.4;
  const fallbackY = canvasHeight * 0.4;
  return createBounds(fallbackX, fallbackY, 120, 50);
};

const createBounds = (x: number, y: number, w: number, h: number): TargetBounds => ({
  x,
  y,
  w,
  h,
  centerX: x + w / 2,
  centerY: y + h / 2,
  topAnchor: { x: x + w / 2, y },
  bottomAnchor: { x: x + w / 2, y: y + h },
  leftAnchor: { x, y: y + h / 2 },
  rightAnchor: { x: x + w, y: y + h / 2 },
});

/**
 * Draws an organic arrow anchored between two targets
 */
export const drawTargetToTargetArrow = (
  ctx: CanvasRenderingContext2D,
  fromBounds: TargetBounds,
  toBounds: TargetBounds,
  label?: string,
  color = '#0066FF'
) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.5;

  const sx = fromBounds.rightAnchor.x;
  const sy = fromBounds.rightAnchor.y;
  const ex = toBounds.leftAnchor.x;
  const ey = toBounds.leftAnchor.y;

  const cp1x = sx + (ex - sx) * 0.5;
  const cp1y = sy - 20;

  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(cp1x, cp1y, ex, ey);
  ctx.stroke();

  // Arrowhead at destination
  const angle = Math.atan2(ey - cp1y, ex - cp1x);
  const headLen = 10;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - headLen * Math.cos(angle - Math.PI / 6), ey - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(ex - headLen * Math.cos(angle + Math.PI / 6), ey - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  if (label) {
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#002D62';
    ctx.fillText(label, cp1x - ctx.measureText(label).width / 2, cp1y - 6);
  }

  ctx.restore();
};

/**
 * Draws a clean educational label anchored to a target
 */
export const drawTargetLeaderLabel = (
  ctx: CanvasRenderingContext2D,
  targetBounds: TargetBounds,
  labelText: string,
  color = '#0066FF'
) => {
  ctx.save();
  const lx = targetBounds.centerX - 10;
  const ly = targetBounds.y - 30;

  ctx.font = 'bold 11px Inter, sans-serif';
  const textW = ctx.measureText(labelText).width;
  const cardW = textW + 20;
  const cardH = 24;

  // Label card
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(lx - cardW / 2, ly - cardH, cardW, cardH, 6);
  ctx.fill();
  ctx.stroke();

  // Leader line to target
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(targetBounds.centerX, targetBounds.y);
  ctx.stroke();

  // Text
  ctx.fillStyle = '#002D62';
  ctx.fillText(labelText, lx - textW / 2, ly - 7);
  ctx.restore();
};

/**
 * Draws progressive worked calculation steps on the whiteboard
 */
export const drawWorkedEquationSteps = (
  ctx: CanvasRenderingContext2D,
  config: {
    x: number;
    y: number;
    width: number;
    steps: Array<{
      stepNumber: number;
      latex: string;
      explanation?: string;
      highlightTokens?: string[];
      isCalculated?: boolean;
    }>;
    activeStepIndex?: number;
  }
) => {
  const { x, y, width, steps, activeStepIndex = steps.length - 1 } = config;
  ctx.save();

  let curY = y;
  const stepHeight = 56;

  steps.forEach((step, idx) => {
    if (idx > activeStepIndex) return;

    const isActive = idx === activeStepIndex;

    // Step Card Container
    ctx.fillStyle = isActive ? 'rgba(0, 102, 255, 0.04)' : '#FFFFFF';
    ctx.strokeStyle = isActive ? '#0066FF' : '#E3E9F1';
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, curY, width, stepHeight, 10);
    ctx.fill();
    ctx.stroke();

    // Step Number Badge
    ctx.fillStyle = isActive ? '#0066FF' : '#002D62';
    ctx.beginPath();
    ctx.arc(x + 24, curY + stepHeight / 2, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${step.stepNumber || idx + 1}`, x + 24, curY + stepHeight / 2);

    // LaTeX Formula Display
    ctx.textAlign = 'left';
    ctx.font = 'bold 18px "KaTeX_Main", "Times New Roman", serif';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(step.latex, x + 50, curY + 28);

    // Optional Explanation subtitle
    if (step.explanation) {
      ctx.font = '11px Inter, sans-serif';
      ctx.fillStyle = '#64748B';
      ctx.fillText(step.explanation, x + 50, curY + 45);
    }

    curY += stepHeight + 10;
  });

  ctx.restore();
};

