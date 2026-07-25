import type { BodyNodeId } from '../types';

export interface BodyNode {
  readonly id: BodyNodeId;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly label?: string;
  readonly core?: true;
}

export const BODY_NODES: readonly BodyNode[] = [
  { id: 'sinus', x: 187, y: 56, r: 24, label: 'SINUS' },
  { id: 'throat', x: 187, y: 108, r: 19, label: 'THROAT' },
  { id: 'lungL', x: 128, y: 148, r: 21 },
  { id: 'lungR', x: 246, y: 148, r: 21 },
  { id: 'heart', x: 187, y: 176, r: 30, core: true, label: 'HEART · CORE' },
  { id: 'stomach', x: 187, y: 254, r: 23, label: 'STOMACH' },
  { id: 'gut', x: 187, y: 322, r: 19 },
  { id: 'shoulder', x: 104, y: 196, r: 15 },
  { id: 'forearm', x: 64, y: 252, r: 26, label: 'FOREARM' },
  { id: 'shoulderR', x: 270, y: 196, r: 15 },
  { id: 'handR', x: 310, y: 252, r: 22 },
  { id: 'kneeL', x: 146, y: 386, r: 15 },
  { id: 'kneeR', x: 228, y: 386, r: 15 },
  { id: 'footL', x: 146, y: 452, r: 21 },
  { id: 'footR', x: 228, y: 452, r: 21 },
];

export const BODY_LINKS: readonly (readonly [BodyNodeId, BodyNodeId])[] = [
  ['sinus', 'throat'], ['throat', 'heart'], ['heart', 'lungL'], ['heart', 'lungR'],
  ['heart', 'stomach'], ['stomach', 'gut'], ['heart', 'shoulder'], ['shoulder', 'forearm'],
  ['heart', 'shoulderR'], ['shoulderR', 'handR'], ['gut', 'kneeL'], ['gut', 'kneeR'],
  ['kneeL', 'footL'], ['kneeR', 'footR'],
];

export const BODY_MAP_VIEWBOX = { width: 374, height: 500 } as const;
