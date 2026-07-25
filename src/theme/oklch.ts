const OKLCH = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.]+\s*)?\)$/i;

function gamma(channel: number): number {
  const c = Math.min(1, Math.max(0, channel));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function oklchToSrgbHex(value: string): number {
  const match = OKLCH.exec(value.trim());
  if (!match) throw new Error(`Not an oklch colour: ${value}`);
  const [, rawL = '0', rawC = '0', rawH = '0'] = match;

  const lightness = rawL.endsWith('%') ? Number.parseFloat(rawL) / 100 : Number.parseFloat(rawL);
  const chroma = Number.parseFloat(rawC);
  const hue = (Number.parseFloat(rawH) * Math.PI) / 180;

  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const red = gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);

  return (Math.round(red * 255) << 16) | (Math.round(green * 255) << 8) | Math.round(blue * 255);
}
