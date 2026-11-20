import { code128Bars } from '../lib/code128';

/** A Code 128 barcode as an SVG, scaled to fill its box. */
export function Barcode({ text, height = 48 }: { text: string; height?: number }) {
  let layout: ReturnType<typeof code128Bars>;
  try {
    layout = code128Bars(text);
  } catch {
    // A code Code 128 can't print (e.g. an accented letter typed in): show it as text.
    return <p className="font-mono text-[14pt]">{text}</p>;
  }
  const { bars, width } = layout;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Barcode ${text}`}
      className="block h-14 w-full"
    >
      <rect width={width} height={height} fill="#fff" />
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} width={bar.width} height={height} fill="#000" />
      ))}
    </svg>
  );
}
