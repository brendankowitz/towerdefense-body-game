import { BODY_LINKS, BODY_MAP_VIEWBOX, BODY_NODES } from '@game/content/body';
import { CASES } from '@game/content/cases';
import { NEUTRALS, palette } from '@theme/tokens';
import type { BodyNodeId, CaseId } from '@game/types';
import { ORBIT_KEYFRAMES } from './orbit';

type NodeState = 'held' | 'hot' | 'core' | 'cold';

interface BodyMapProps {
  readonly cleared: readonly CaseId[];
  readonly activeNode: BodyNodeId | null;
  readonly onSelectCase: () => void;
}

const STATE_TOKEN: Record<NodeState, string> = {
  held: palette.frontline.css,
  hot: palette.threat.css,
  core: palette.core.css,
  cold: palette.notReached.css,
};

/** The body graph: fifteen regions, fourteen links, the core, the case under attack circling. */
export function BodyMap({ cleared, activeNode, onSelectCase }: BodyMapProps) {
  const clearedNodes = new Set(
    CASES.filter((c) => cleared.includes(c.id)).map((c) => c.node),
  );

  const stateOf = (id: BodyNodeId): NodeState => {
    if (clearedNodes.has(id)) return 'held';
    if (id === 'heart') return 'core';
    if (id === activeNode) return 'hot';
    return 'cold';
  };

  return (
    <svg
      className="body-map"
      viewBox={`0 0 ${String(BODY_MAP_VIEWBOX.width)} ${String(BODY_MAP_VIEWBOX.height)}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="The body"
    >
      {/* Generated from the ellipse, so the shape is stated once. `.orbit` and the reduced
          motion rule that switches it off both live in typography.css. */}
      <style>{ORBIT_KEYFRAMES}</style>

      {BODY_LINKS.map(([from, to]) => {
        const a = BODY_NODES.find((n) => n.id === from);
        const b = BODY_NODES.find((n) => n.id === to);
        if (a === undefined || b === undefined) return null;
        const hot = stateOf(from) === 'hot' || stateOf(to) === 'hot';
        const held = stateOf(from) === 'held' || stateOf(to) === 'held';
        return (
          <line
            key={`${from}-${to}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={hot ? STATE_TOKEN.hot : held ? STATE_TOKEN.held : 'var(--not-reached)'}
            strokeWidth={6}
            strokeLinecap="round"
          />
        );
      })}

      {BODY_NODES.map((node) => {
        const state = stateOf(node.id);
        const interactive = state === 'hot';
        return (
          <g key={node.id}>
            {/* The sickness itself, circling the region it has taken. Still the only thing
                on this screen that moves, and still only ever on a threat. */}
            {state === 'hot' && (
              <circle
                className="orbit"
                cx={node.x}
                cy={node.y}
                r={node.r + 16}
                fill={STATE_TOKEN.hot}
                opacity={0.14}
              />
            )}
            <circle
              data-testid={`map-node-${node.id}`}
              data-state={state}
              cx={node.x}
              cy={node.y}
              r={node.r}
              fill={STATE_TOKEN[state]}
              stroke={NEUTRALS.screenPaper}
              strokeWidth={state === 'core' ? 5 : 4}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
              onClick={interactive ? onSelectCase : undefined}
            />
            {state !== 'cold' && (
              <circle
                cx={node.x}
                cy={node.y}
                r={Math.max(6, node.r * 0.33)}
                fill={NEUTRALS.screenPaper}
                pointerEvents="none"
              />
            )}
            {node.label !== undefined && (
              <text
                className="mono map-label"
                x={node.x + node.r + 10}
                y={node.y + 4}
                style={{ fill: state === 'cold' ? 'var(--muted)' : 'var(--ink)' }}
              >
                {node.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
