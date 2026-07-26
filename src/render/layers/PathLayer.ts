import { Container, Graphics } from 'pixi.js';
import { CASE_BY_ID } from '@game/content/cases';
import type { CaseId } from '@game/types';
import { tokenHex } from '../colors';
import { polyline } from '../shapes';

/** Asset sheet line 694: one stroked path, two widths — 34 casing, 22 lumen. */
const CASING_WIDTH = 34;
const LUMEN_WIDTH = 22;

/** The vessel does not change for the life of a case, so it is drawn once and left alone. */
export class PathLayer {
  readonly container: Container;

  constructor(caseId: CaseId) {
    const points = CASE_BY_ID[caseId].path;
    const vessel = new Graphics();
    polyline(vessel, points, tokenHex('vesselCasing'), CASING_WIDTH);
    polyline(vessel, points, tokenHex('vesselLumen'), LUMEN_WIDTH);
    this.container = vessel;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
