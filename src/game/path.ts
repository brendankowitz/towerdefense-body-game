import type { CompiledPath, Point, Segment } from './types';

function segmentOf(a: Point, b: Point, start: number): Segment {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return { ax: a[0], ay: a[1], bx: b[0], by: b[1], length: Math.sqrt(dx * dx + dy * dy), start };
}

export function compilePath(points: readonly Point[]): CompiledPath {
  const [first, second, ...rest] = points;
  if (first === undefined || second === undefined) {
    throw new Error('A vessel path needs at least two points');
  }

  const head = segmentOf(first, second, 0);
  const segments: [Segment, ...Segment[]] = [head];
  let previous = second;
  let total = head.length;

  for (const point of rest) {
    const segment = segmentOf(previous, point, total);
    segments.push(segment);
    total += segment.length;
    previous = point;
  }

  return { segments, total };
}

/**
 * The prototype's `posAt` has no negative guard because nothing ever passes one. Split children
 * are placed behind their parent, so the guard is what keeps the function total.
 */
export function positionAt(path: CompiledPath, travelled: number): Point {
  const [head] = path.segments;
  if (travelled <= 0) return [head.ax, head.ay];

  let last = head;
  for (const segment of path.segments) {
    if (travelled <= segment.start + segment.length) {
      const k = segment.length === 0 ? 0 : (travelled - segment.start) / segment.length;
      return [
        segment.ax + (segment.bx - segment.ax) * k,
        segment.ay + (segment.by - segment.ay) * k,
      ];
    }
    last = segment;
  }

  return [last.bx, last.by];
}
