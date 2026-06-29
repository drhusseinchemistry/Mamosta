export interface EquationItem {
  id: string;
  freeFormEq: string;
  type: 'linear' | 'quadratic';
  linearEq: { m: number; c: number };
  quadEq: { a: number; b: number; c: number };
  lineColor: string;
  lineThickness: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

export interface GraphData {
  questionText: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xStep: number;
  yStep: number;
  graphType: 'linear' | 'quadratic' | 'points';
  linearEq: { m: number; c: number };
  quadEq: { a: number; b: number; c: number };
  points: { x: number; y: number }[];
  lineColor: string;
  axisColor: string;
  gridColor: string;
  bgColor: string;
  showGrid: boolean;
  textColor: string;
  freeFormEq?: string;
  lineThickness?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  equations?: EquationItem[];
}

export const DEFAULT_GRAPH_DATA: GraphData = {
  questionText: 'نەخشەیێ بیرکاری (Math Graph)',
  xMin: -6,
  xMax: 6,
  yMin: -6,
  yMax: 6,
  xStep: 1,
  yStep: 1,
  graphType: 'linear',
  linearEq: { m: 1, c: 0 },
  quadEq: { a: 0.5, b: 0, c: -2 },
  points: [
    { x: -3, y: -2 },
    { x: -1, y: 2 },
    { x: 2, y: 1 },
    { x: 4, y: 5 }
  ],
  lineColor: '#06b6d4', // Teal/Cyan line
  axisColor: '#cbd5e1', // Slate 300
  gridColor: '#f1f5f9', // Slate 100
  bgColor: '#ffffff',   // Pure White
  showGrid: true,
  textColor: '#334155', // Slate 700
  freeFormEq: 'y = x',
  lineThickness: 3,
  lineStyle: 'solid',
  equations: [
    {
      id: 'eq-1',
      freeFormEq: 'y = x',
      type: 'linear',
      linearEq: { m: 1, c: 0 },
      quadEq: { a: 0.5, b: 0, c: -2 },
      lineColor: '#06b6d4',
      lineThickness: 3,
      lineStyle: 'solid'
    }
  ]
};

export interface ParsedEquation {
  type: 'linear' | 'quadratic' | null;
  linearEq?: { m: number; c: number };
  quadEq?: { a: number; b: number; c: number };
}

export function parseEquation(eq: string): ParsedEquation {
  // Normalize string: lowercase, remove spaces, handle minus signs
  let s = eq.toLowerCase().replace(/\s+/g, '');
  s = s.replace(/−/g, '-');
  
  // If no "=", assume it is y = ...
  if (!s.includes('=')) {
    s = 'y=' + s;
  }
  
  const sides = s.split('=');
  if (sides.length !== 2) return { type: null };
  
  const left = sides[0];
  const right = sides[1];
  
  const parseSide = (sideStr: string, multiplier: number) => {
    let coeffY = 0;
    let coeffX2 = 0;
    let coeffX = 0;
    let constant = 0;
    
    // Replace x^2 or x² with w for easier matching
    let normalized = sideStr.replace(/x\^2|x²/g, 'w');
    // Insert spaces before plus or minus to split cleanly
    normalized = normalized.replace(/([+-])/g, ' $1').trim();
    
    const terms = normalized.split(/\s+/);
    for (let term of terms) {
      if (!term) continue;
      
      let sign = 1;
      if (term.startsWith('-')) {
        sign = -1;
        term = term.slice(1);
      } else if (term.startsWith('+')) {
        term = term.slice(1);
      }
      
      if (term.endsWith('w')) {
        const coefStr = term.slice(0, -1);
        const coef = coefStr === '' ? 1 : Number(coefStr);
        if (!isNaN(coef)) coeffX2 += sign * coef * multiplier;
      } else if (term.endsWith('y')) {
        const coefStr = term.slice(0, -1);
        const coef = coefStr === '' ? 1 : Number(coefStr);
        if (!isNaN(coef)) coeffY += sign * coef * multiplier;
      } else if (term.endsWith('x')) {
        const coefStr = term.slice(0, -1);
        const coef = coefStr === '' ? 1 : Number(coefStr);
        if (!isNaN(coef)) coeffX += sign * coef * multiplier;
      } else {
        const coef = Number(term);
        if (!isNaN(coef)) constant += sign * coef * multiplier;
      }
    }
    
    return { coeffY, coeffX2, coeffX, constant };
  };
  
  // Move right side to left side by using -1 multiplier
  const lTerms = parseSide(left, 1);
  const rTerms = parseSide(right, -1);
  
  const totalY = lTerms.coeffY + rTerms.coeffY;
  const totalX2 = lTerms.coeffX2 + rTerms.coeffX2;
  const totalX = lTerms.coeffX + rTerms.coeffX;
  const totalC = lTerms.constant + rTerms.constant;
  
  // Solve for y: totalY*y + totalX2*x^2 + totalX*x + totalC = 0 => y = ax^2 + bx + c
  if (Math.abs(totalY) < 0.0001) {
    return { type: null };
  }
  
  const a = -totalX2 / totalY;
  const b = -totalX / totalY;
  const c = -totalC / totalY;
  
  if (Math.abs(a) > 0.0001) {
    return {
      type: 'quadratic',
      quadEq: { a, b, c }
    };
  } else {
    return {
      type: 'linear',
      linearEq: { m: b, c }
    };
  }
}

export const createGraphFabricGroup = (
  left: number,
  top: number,
  data: Partial<GraphData> = {}
): any => {
  if (typeof window === 'undefined' || !window.fabric) return null;
  const fabric = window.fabric;

  // Merge with default values
  const graphData: GraphData = { ...DEFAULT_GRAPH_DATA, ...data };

  const plotWidth = 260;
  const plotHeight = 260;
  const padding = 35;
  const totalWidth = plotWidth + padding * 2;
  const totalHeight = plotHeight + padding * 2 + 55;

  // Coordinate mapper helpers
  const mapX = (xVal: number) => {
    const range = graphData.xMax - graphData.xMin;
    if (range === 0) return padding;
    const ratio = (xVal - graphData.xMin) / range;
    return padding + ratio * plotWidth;
  };

  const mapY = (yVal: number) => {
    const range = graphData.yMax - graphData.yMin;
    if (range === 0) return padding + plotHeight;
    const ratio = (yVal - graphData.yMin) / range;
    return padding + 40 + (1 - ratio) * plotHeight;
  };

  const elements: any[] = [];

  // Determine optimal light/dark aesthetic colors
  const isDarkBg = graphData.bgColor === '#0f172a';
  const isTransparent = graphData.bgColor === 'transparent';
  
  const computedBg = isTransparent ? 'transparent' : graphData.bgColor;
  const computedStroke = isTransparent ? 'transparent' : (isDarkBg ? '#1e293b' : '#e2e8f0');
  const computedText = isDarkBg ? '#f8fafc' : '#334155';
  const computedAxis = isDarkBg ? '#475569' : '#cbd5e1';
  const computedGrid = isDarkBg ? '#1e293b' : '#f1f5f9';

  // 1. Flat Background Card (No Drop Shadows, thin clean border)
  const bgCard = new fabric.Rect({
    left: 0,
    top: 0,
    width: totalWidth,
    height: totalHeight,
    fill: computedBg,
    stroke: computedStroke,
    strokeWidth: isTransparent ? 0 : 1,
    rx: 12,
    ry: 12,
    selectable: false
  });
  elements.push(bgCard);

  // 2. Question/Title Text
  const titleText = new fabric.Text(graphData.questionText, {
    left: totalWidth / 2,
    top: 25,
    fontSize: 13,
    fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
    fontWeight: 'bold',
    fill: computedText,
    originX: 'center',
    originY: 'center',
    textAlign: 'center',
    selectable: false
  });
  elements.push(titleText);

  // 3. Grid Lines (Thin, sharp, minimalist)
  if (graphData.showGrid) {
    // Vertical
    const startX = Math.ceil(graphData.xMin / graphData.xStep) * graphData.xStep;
    for (let x = startX; x <= graphData.xMax; x += graphData.xStep) {
      if (Math.abs(x) < 0.0001) continue;
      const px = mapX(x);
      elements.push(
        new fabric.Line([px, padding + 40, px, padding + 40 + plotHeight], {
          stroke: computedGrid,
          strokeWidth: 0.8,
          selectable: false
        })
      );
    }

    // Horizontal
    const startY = Math.ceil(graphData.yMin / graphData.yStep) * graphData.yStep;
    for (let y = startY; y <= graphData.yMax; y += graphData.yStep) {
      if (Math.abs(y) < 0.0001) continue;
      const py = mapY(y);
      elements.push(
        new fabric.Line([padding, py, padding + plotWidth, py], {
          stroke: computedGrid,
          strokeWidth: 0.8,
          selectable: false
        })
      );
    }
  }

  // 4. Axis Lines
  const xAxisY = (graphData.yMin <= 0 && graphData.yMax >= 0) 
    ? mapY(0) 
    : (graphData.yMin > 0 ? mapY(graphData.yMin) : mapY(graphData.yMax));

  const xAxis = new fabric.Line([padding - 10, xAxisY, padding + plotWidth + 10, xAxisY], {
    stroke: computedAxis,
    strokeWidth: 1.2,
    selectable: false
  });
  elements.push(xAxis);

  const yAxisX = (graphData.xMin <= 0 && graphData.xMax >= 0) 
    ? mapX(0) 
    : (graphData.xMin > 0 ? mapX(graphData.xMin) : mapX(graphData.xMax));

  const yAxis = new fabric.Line([yAxisX, padding + 40 - 10, yAxisX, padding + 40 + plotHeight + 10], {
    stroke: computedAxis,
    strokeWidth: 1.2,
    selectable: false
  });
  elements.push(yAxis);

  // 5. Minimalist Tick Marks and Numeric Labels
  const startTickX = Math.ceil(graphData.xMin / graphData.xStep) * graphData.xStep;
  for (let x = startTickX; x <= graphData.xMax; x += graphData.xStep) {
    const px = mapX(x);
    elements.push(
      new fabric.Line([px, xAxisY - 3, px, xAxisY + 3], {
        stroke: computedAxis,
        strokeWidth: 1,
        selectable: false
      })
    );
    if (Math.abs(x) > 0.0001) {
      elements.push(
        new fabric.Text(x.toString(), {
          left: px,
          top: xAxisY + 6,
          fontSize: 8.5,
          fontFamily: 'monospace',
          fill: computedAxis,
          originX: 'center',
          originY: 'top',
          selectable: false
        })
      );
    }
  }

  const startTickY = Math.ceil(graphData.yMin / graphData.yStep) * graphData.yStep;
  for (let y = startTickY; y <= graphData.yMax; y += graphData.yStep) {
    const py = mapY(y);
    elements.push(
      new fabric.Line([yAxisX - 3, py, yAxisX + 3, py], {
        stroke: computedAxis,
        strokeWidth: 1,
        selectable: false
      })
    );
    if (Math.abs(y) > 0.0001) {
      elements.push(
        new fabric.Text(y.toString(), {
          left: yAxisX - 6,
          top: py,
          fontSize: 8.5,
          fontFamily: 'monospace',
          fill: computedAxis,
          originX: 'right',
          originY: 'center',
          selectable: false
        })
      );
    }
  }

  // 6. Axis Labels
  elements.push(
    new fabric.Text('X', {
      left: padding + plotWidth + 12,
      top: xAxisY,
      fontSize: 11,
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'bold',
      fill: computedAxis,
      originX: 'left',
      originY: 'center',
      selectable: false
    })
  );

  elements.push(
    new fabric.Text('Y', {
      left: yAxisX,
      top: padding + 40 - 12,
      fontSize: 11,
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'bold',
      fill: computedAxis,
      originX: 'center',
      originY: 'bottom',
      selectable: false
    })
  );

  // 7. Render Plotted Curves / Points
  if (graphData.graphType === 'linear' || graphData.graphType === 'quadratic') {
    const eqsToDraw: EquationItem[] = graphData.equations && graphData.equations.length > 0
      ? graphData.equations
      : [
          {
            id: 'default',
            freeFormEq: graphData.freeFormEq || 'y = x',
            type: graphData.graphType,
            linearEq: graphData.linearEq,
            quadEq: graphData.quadEq,
            lineColor: graphData.lineColor,
            lineThickness: graphData.lineThickness !== undefined ? graphData.lineThickness : 3,
            lineStyle: graphData.lineStyle || 'solid'
          }
        ];

    eqsToDraw.forEach((eq) => {
      const curvePoints: { x: number; y: number }[] = [];
      const segments = 120;
      
      for (let i = 0; i <= segments; i++) {
        const xVal = graphData.xMin + (i / segments) * (graphData.xMax - graphData.xMin);
        let yVal = 0;
        
        if (eq.type === 'linear') {
          yVal = eq.linearEq.m * xVal + eq.linearEq.c;
        } else {
          yVal = eq.quadEq.a * xVal * xVal + eq.quadEq.b * xVal + eq.quadEq.c;
        }

        const yBuffer = Math.abs(graphData.yMax - graphData.yMin) * 0.1;
        if (yVal >= graphData.yMin - yBuffer && yVal <= graphData.yMax + yBuffer) {
          curvePoints.push({ x: mapX(xVal), y: mapY(yVal) });
        }
      }

      if (curvePoints.length > 1) {
        let strokeDashArray: number[] | null = null;
        if (eq.lineStyle === 'dashed') {
          strokeDashArray = [8, 6];
        } else if (eq.lineStyle === 'dotted') {
          strokeDashArray = [2, 4];
        }

        const polyline = new fabric.Polyline(curvePoints, {
          stroke: eq.lineColor,
          strokeWidth: eq.lineThickness,
          strokeDashArray: strokeDashArray,
          fill: 'transparent',
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          strokeUniform: false,
          selectable: false
        });
        elements.push(polyline);
      }
    });
  } else if (graphData.graphType === 'points') {
    const baseThickness = graphData.lineThickness !== undefined ? graphData.lineThickness : 3;
    let strokeDashArray: number[] | null = null;
    if (graphData.lineStyle === 'dashed') {
      strokeDashArray = [8, 6];
    } else if (graphData.lineStyle === 'dotted') {
      strokeDashArray = [2, 4];
    }

    const pts = graphData.points || [];
    
    if (pts.length > 1) {
      for (let i = 0; i < pts.length - 1; i++) {
        const pt1 = pts[i];
        const pt2 = pts[i + 1];
        
        if (
          pt1.x >= graphData.xMin && pt1.x <= graphData.xMax &&
          pt1.y >= graphData.yMin && pt1.y <= graphData.yMax &&
          pt2.x >= graphData.xMin && pt2.x <= graphData.xMax &&
          pt2.y >= graphData.yMin && pt2.y <= graphData.yMax
        ) {
          elements.push(
            new fabric.Line([mapX(pt1.x), mapY(pt1.y), mapX(pt2.x), mapY(pt2.y)], {
              stroke: graphData.lineColor,
              strokeWidth: baseThickness * 0.6,
              strokeDashArray: strokeDashArray ? [strokeDashArray[0] * 0.8, strokeDashArray[1] * 0.8] : null,
              opacity: 0.6,
              strokeUniform: false,
              selectable: false
            })
          );
        }
      }
    }

    pts.forEach((pt) => {
      if (
        pt.x >= graphData.xMin && pt.x <= graphData.xMax &&
        pt.y >= graphData.yMin && pt.y <= graphData.yMax
      ) {
        const px = mapX(pt.x);
        const py = mapY(pt.y);
        
        elements.push(
          new fabric.Circle({
            left: px,
            top: py,
            radius: 4.5,
            fill: graphData.lineColor,
            stroke: '#ffffff',
            strokeWidth: 1.2,
            originX: 'center',
            originY: 'center',
            strokeUniform: false,
            selectable: false
          })
        );
      }
    });
  }

  const group = new fabric.Group(elements, {
    left: left,
    top: top,
    selectable: true,
    hasControls: true,
    hasBorders: true,
    originX: 'center',
    originY: 'center'
  });

  group.isGraphGroup = true;
  group.graphData = graphData;

  return group;
};
