export const createMathSymbolGroup = (
  type: string,
  left: number,
  top: number,
  textColor: string = '#1f2937',
  options?: {
    numerator?: string;
    denominator?: string;
    topText?: string;
    bottomText?: string;
    mainText?: string;
  }
): any => {
  if (typeof window === 'undefined' || !window.fabric) return null;
  const fabric = window.fabric;

  switch (type) {
    case 'fraction': {
      // Fraction: a / b
      const numText = new fabric.IText(options?.numerator || 'a', {
        fontSize: 20,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        textAlign: 'center',
        originX: 'center',
        originY: 'bottom',
        left: 0,
        top: -6,
        hasControls: false,
        lockRotation: true,
        fractionRole: 'numerator',
      });
      const denText = new fabric.IText(options?.denominator || 'b', {
        fontSize: 20,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        textAlign: 'center',
        originX: 'center',
        originY: 'top',
        left: 0,
        top: 6,
        hasControls: false,
        lockRotation: true,
        fractionRole: 'denominator',
      });
      const lineLength = Math.max(numText.width || 40, denText.width || 40) + 12;
      const line = new fabric.Line([-lineLength / 2, 0, lineLength / 2, 0], {
        stroke: textColor,
        strokeWidth: 2,
        originX: 'center',
        originY: 'center',
        left: 0,
        top: 0,
        fractionRole: 'line',
      });
      const group = new fabric.Group([numText, denText, line], {
        left: left,
        top: top,
        selectable: true,
        isFractionGroup: true,
        fractionId: 'fraction_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
        fractionColor: textColor,
      });
      return group;
    }

    case 'percentage': {
      return new fabric.Text('%', {
        left: left,
        top: top,
        fontSize: 24,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'ratio': {
      return new fabric.Text('a : b', {
        left: left,
        top: top,
        fontSize: 22,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'function': {
      return new fabric.Text('f(x)', {
        left: left,
        top: top,
        fontSize: 22,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'absolute': {
      return new fabric.Text('|x|', {
        left: left,
        top: top,
        fontSize: 22,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'sigma_sum': {
      // Sigma Summation with top 'n' and bottom 'i=1'
      const sigmaChar = new fabric.Text('∑', {
        fontSize: 42,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        originX: 'center',
        originY: 'center',
        left: 0,
        top: 0,
        mathRole: 'main'
      });
      const topLimit = new fabric.Text(options?.topText || 'n', {
        fontSize: 12,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        originX: 'center',
        originY: 'bottom',
        left: 0,
        top: -20,
        mathRole: 'top'
      });
      const bottomLimit = new fabric.Text(options?.bottomText || 'i=1', {
        fontSize: 12,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        originX: 'center',
        originY: 'top',
        left: 0,
        top: 20,
        mathRole: 'bottom'
      });
      const group = new fabric.Group([sigmaChar, topLimit, bottomLimit], {
        left: left,
        top: top,
        selectable: true,
        isMathSymbolGroup: true,
        mathSymbolType: 'sigma_sum',
        mathId: 'math_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
      });
      return group;
    }

    case 'product': {
      // Product Pi with top 'n' and bottom 'i=1'
      const prodChar = new fabric.Text('∏', {
        fontSize: 40,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        originX: 'center',
        originY: 'center',
        left: 0,
        top: 0,
        mathRole: 'main'
      });
      const topLimit = new fabric.Text(options?.topText || 'n', {
        fontSize: 12,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        originX: 'center',
        originY: 'bottom',
        left: 0,
        top: -20,
        mathRole: 'top'
      });
      const bottomLimit = new fabric.Text(options?.bottomText || 'i=1', {
        fontSize: 12,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        originX: 'center',
        originY: 'top',
        left: 0,
        top: 20,
        mathRole: 'bottom'
      });
      const group = new fabric.Group([prodChar, topLimit, bottomLimit], {
        left: left,
        top: top,
        selectable: true,
        isMathSymbolGroup: true,
        mathSymbolType: 'product',
        mathId: 'math_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
      });
      return group;
    }

    case 'log': {
      return new fabric.Text('log(x)', {
        left: left,
        top: top,
        fontSize: 22,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'ln': {
      return new fabric.Text('ln(x)', {
        left: left,
        top: top,
        fontSize: 22,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'derivative': {
      // dy / dx
      const dyText = new fabric.IText('dy', {
        fontSize: 18,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        textAlign: 'center',
        originX: 'center',
        originY: 'bottom',
        left: 0,
        top: -4,
        hasControls: false,
        lockRotation: true,
        fractionRole: 'numerator',
      });
      const dxText = new fabric.IText('dx', {
        fontSize: 18,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        textAlign: 'center',
        originX: 'center',
        originY: 'top',
        left: 0,
        top: 4,
        hasControls: false,
        lockRotation: true,
        fractionRole: 'denominator',
      });
      const lineLength = Math.max(dyText.width || 20, dxText.width || 20) + 10;
      const line = new fabric.Line([-lineLength / 2, 0, lineLength / 2, 0], {
        stroke: textColor,
        strokeWidth: 2,
        originX: 'center',
        originY: 'center',
        left: 0,
        top: 0,
        fractionRole: 'line',
      });
      const group = new fabric.Group([dyText, dxText, line], {
        left: left,
        top: top,
        selectable: true,
        isFractionGroup: true,
        fractionId: 'fraction_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
        fractionColor: textColor,
      });
      return group;
    }

    case 'integral': {
      return new fabric.Text('∫', {
        left: left,
        top: top,
        fontSize: 36,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'definite_integral': {
      // Definite integral with upper 'b' and lower 'a' limits
      const intChar = new fabric.Text('∫', {
        fontSize: 42,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        originX: 'center',
        originY: 'center',
        left: 0,
        top: 0,
        mathRole: 'main'
      });
      const topLimit = new fabric.Text(options?.topText || 'b', {
        fontSize: 12,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        originX: 'left',
        originY: 'bottom',
        left: 8,
        top: -14,
        mathRole: 'top'
      });
      const bottomLimit = new fabric.Text(options?.bottomText || 'a', {
        fontSize: 12,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        originX: 'left',
        originY: 'top',
        left: 4,
        top: 14,
        mathRole: 'bottom'
      });
      const group = new fabric.Group([intChar, topLimit, bottomLimit], {
        left: left,
        top: top,
        selectable: true,
        isMathSymbolGroup: true,
        mathSymbolType: 'definite_integral',
        mathId: 'math_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
      });
      return group;
    }

    case 'limit': {
      // lim with x -> a under it
      const limText = new fabric.Text('lim', {
        fontSize: 22,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        originX: 'center',
        originY: 'bottom',
        left: 0,
        top: 0,
        mathRole: 'main'
      });
      const subText = new fabric.Text(options?.bottomText || 'x → a', {
        fontSize: 11,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        originX: 'center',
        originY: 'top',
        left: 0,
        top: 2,
        mathRole: 'bottom'
      });
      const group = new fabric.Group([limText, subText], {
        left: left,
        top: top,
        selectable: true,
        isMathSymbolGroup: true,
        mathSymbolType: 'limit',
        mathId: 'math_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
      });
      return group;
    }

    case 'delta_x': {
      return new fabric.Text('Δx', {
        left: left,
        top: top,
        fontSize: 22,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'partial_deriv': {
      return new fabric.Text('∂', {
        left: left,
        top: top,
        fontSize: 24,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'micro': {
      return new fabric.Text('μ', {
        left: left,
        top: top,
        fontSize: 22,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'rho': {
      return new fabric.Text('ρ', {
        left: left,
        top: top,
        fontSize: 22,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'lambda': {
      return new fabric.Text('λ', {
        left: left,
        top: top,
        fontSize: 22,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'alpha_beta_gamma': {
      return new fabric.Text('α, β, γ', {
        left: left,
        top: top,
        fontSize: 22,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    case 'yields': {
      return new fabric.Text('➔', {
        left: left,
        top: top,
        fontSize: 22,
        fill: textColor,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        selectable: true
      });
    }

    default:
      return null;
  }
};
