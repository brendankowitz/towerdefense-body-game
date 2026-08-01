import { BODY_LINKS, BODY_MAP_VIEWBOX, BODY_NODES } from '@game/content/body';
import { stateOf as frontStateOf, type Front } from '@game/front';
import { NEUTRALS, palette } from '@theme/tokens';
import type { BodyNodeId } from '@game/types';
import { ORBIT_KEYFRAMES } from './orbit';

type NodeState = 'held' | 'hot' | 'besieged' | 'core' | 'link' | 'cold';

interface BodyMapProps {
  readonly front: Front;
  readonly onSelectCase: (node: BodyNodeId) => void;
  /**
   * Shoring up only ever makes sense on ground the page already knows is held and the bank
   * already knows it can afford — the map is just where that ground is drawn. Both are optional
   * and only ever supplied together: a map with neither draws itself with nothing to press,
   * which is what every render that only cares about the front line still expects.
   */
  readonly canShoreUp?: boolean;
  readonly onShoreUp?: (node: BodyNodeId) => void;
}

const STATE_TOKEN: Record<NodeState, string> = {
  held: palette.frontline.css,
  hot: palette.threat.css,
  // Besieged ground is still the player's, so it wears the held colour — the ring around it,
  // not the ground itself, is what says a wall is coming down.
  besieged: palette.frontline.css,
  core: palette.core.css,
  link: palette.notReached.css,
  cold: palette.notReached.css,
};

/**
 * The body graph: every node, every link, the core, and the case under attack circling.
 *
 * Most nodes are regions a case can be fought over; the rest are the heart and the joints the body
 * only routes through. A joint is drawn faintly and without the ring a region carries, because the
 * legend beside this reads NOT REACHED and a joint is never going to be reached — it is not
 * somewhere the season is failing to take you. Which nodes those are is content's to say.
 *
 * State is read straight off `Front` through `stateOf` rather than kept here, so the map and the
 * model it draws can never disagree about which ground is whose.
 */
export function BodyMap({ front, onSelectCase, canShoreUp, onShoreUp }: BodyMapProps) {
  const joints = new Set(BODY_NODES.filter((node) => node.connective === true).map((n) => n.id));

  const stateOf = (id: BodyNodeId): NodeState => {
    if (id === 'heart' && !front.infected.includes('heart')) return 'core';
    if (joints.has(id) && !front.infected.includes(id)) return 'link';
    return frontStateOf(front, id);
  };

  const isHeld = (state: NodeState): boolean => state === 'held' || state === 'besieged';
  const shoreUpOffered = canShoreUp === true && onShoreUp !== undefined;

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
        const held = isHeld(stateOf(from)) || isHeld(stateOf(to));
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
        const shoreable = isHeld(state) && shoreUpOffered;
        return (
          <g key={node.id}>
            {/* The sickness itself, circling the region it has taken. Still the only thing on
                this screen that moves, and still only ever on a threat.
                Besieged ground wears the same ring — the danger reads the same way at a glance
                — but it never orbits. The orbit is the sickness circling ground it already
                holds; a besieged region is still the player's, so there is nothing there to
                circle, and the board's one rule is that only a threat pulses. */}
            {(state === 'hot' || state === 'besieged') && (
              <circle
                className={state === 'hot' ? 'orbit' : undefined}
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
              fillOpacity={state === 'link' ? 0.5 : 1}
              stroke={state === 'link' ? 'none' : NEUTRALS.screenPaper}
              strokeWidth={state === 'core' ? 5 : 4}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
              onClick={interactive ? () => { onSelectCase(node.id); } : undefined}
            />
            {(state === 'held' || state === 'hot' || state === 'core' || state === 'besieged') && (
              <circle
                cx={node.x}
                cy={node.y}
                r={Math.max(6, node.r * 0.33)}
                fill={NEUTRALS.screenPaper}
                pointerEvents="none"
              />
            )}
            {state === 'besieged' && (
              <text
                className="mono map-siege"
                data-testid={`map-siege-${node.id}`}
                x={node.x}
                y={node.y + node.r + 16}
                textAnchor="middle"
              >
                {String(front.siege[node.id] ?? 0)}
              </text>
            )}
            {shoreable && (
              <text
                className="mono map-shoreup"
                data-testid={`map-shoreup-${node.id}`}
                x={node.x}
                y={node.y + node.r + (state === 'besieged' ? 28 : 16)}
                textAnchor="middle"
                style={{ cursor: 'pointer' }}
                onClick={() => { onShoreUp(node.id); }}
              >
                SHORE UP
              </text>
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
