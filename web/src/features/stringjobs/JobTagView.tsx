import { code128Bars } from '../../lib/code128';
import type { JobTag } from './jobTag';

/** A Code 128 barcode as an SVG, scaled to fill its box. */
export function Barcode({ text, height = 48 }: { text: string; height?: number }) {
  const { bars, width } = code128Bars(text);
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

// A string job's tag, sized for the 80 mm printer (Phase 3A).
export function JobTagView({ tag }: { tag: JobTag }) {
  return (
    <article className="mx-auto w-[72mm] space-y-1.5 font-sans text-[11pt] leading-snug text-black">
      <div className="flex items-center justify-between">
        <span className="text-[20pt] font-bold tracking-wide">{tag.code}</span>
        <span className="flex gap-1">
          {tag.rush && <span className="border-2 border-black px-1.5 text-[12pt] font-bold">RUSH</span>}
          <span className={`px-1.5 text-[12pt] font-bold ${tag.paid ? 'bg-black text-white' : 'border border-black'}`}>
            {tag.paid ? 'PAID' : 'UNPAID'}
          </span>
        </span>
      </div>
      <Barcode text={tag.code} />
      <p className="text-[13pt] font-semibold">{tag.customer}</p>
      {tag.phone && <p>{tag.phone}</p>}
      <p>
        {tag.racket}
        {tag.racketTag ? ` · ${tag.racketTag}` : ''}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 border-y border-black py-1">
        <dt className="font-semibold">Mains</dt>
        <dd>{tag.mains}</dd>
        <dt className="font-semibold">Crosses</dt>
        <dd>{tag.crosses}</dd>
      </dl>
      {tag.promised && (
        <p>
          <span className="font-semibold">Ready by </span>
          {tag.promised}
        </p>
      )}
      {tag.assignedTo && (
        <p>
          <span className="font-semibold">Stringer </span>
          {tag.assignedTo}
        </p>
      )}
      {tag.notes && <p className="whitespace-pre-line">{tag.notes}</p>}
    </article>
  );
}
