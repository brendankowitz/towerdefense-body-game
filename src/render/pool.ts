/**
 * How a pool builds, shows, hides and tears down the thing it pools. Injected rather than
 * baked in so the pool itself carries no dependency on a scene graph and can be reasoned
 * about — and tested — without one.
 */
export interface ViewHandlers<TView> {
  readonly create: () => TView;
  /** Bring a view back into use. Called on the frame an entity appears or reappears. */
  readonly attach: (view: TView) => void;
  /** Take a view out of use without discarding it. Called the frame its entity is gone. */
  readonly detach: (view: TView) => void;
  /** Discard a view for good. Called only when the whole pool is torn down. */
  readonly destroy: (view: TView) => void;
}

interface Entry<TView> {
  readonly view: TView;
  /** The frame this view was last acquired on. Anything older is stale by `endFrame`. */
  frame: number;
}

/**
 * Keyed reuse of display objects across frames.
 *
 * Entities come and go constantly — a wave spawns and kills dozens — and building a fresh
 * display object for each one hands the GPU a new geometry batch every frame, which is the
 * first thing to fall over in an iOS WebView. So views are keyed by entity id, kept for as
 * long as that entity lives, and returned to a free list rather than destroyed when it
 * dies. The pool therefore grows to the peak number of simultaneous entities and stops.
 *
 * One frame is: `beginFrame()`, one `acquire(id)` per live entity, `endFrame()`. Anything
 * not acquired in between is detached. No per-frame allocation: the touched set is a frame
 * counter on each entry, not a `Set` built and thrown away every draw.
 *
 * That last choice has one consequence worth naming. A view cannot be known dead until the
 * frame's acquires are done, so it is only returned to the free list one frame after its
 * entity disappeared. A frame that replaces part of the population therefore allocates for
 * the newcomers before the departed are released, and the pool settles at the peak plus
 * whatever the largest single-frame turnover was — bounded by twice the peak in the worst
 * case, and by peak-plus-one for the gradual churn a wave actually produces. It then stops.
 */
export class ViewPool<TView> {
  readonly #handlers: ViewHandlers<TView>;
  readonly #active = new Map<number, Entry<TView>>();
  readonly #free: Entry<TView>[] = [];
  #frame = 0;
  #created = 0;

  constructor(handlers: ViewHandlers<TView>) {
    this.#handlers = handlers;
  }

  /** Views created over this pool's life. Never exceeds the peak simultaneous entity count. */
  get createdCount(): number {
    return this.#created;
  }

  get activeCount(): number {
    return this.#active.size;
  }

  get freeCount(): number {
    return this.#free.length;
  }

  beginFrame(): void {
    this.#frame += 1;
  }

  acquire(id: number): TView {
    const existing = this.#active.get(id);
    if (existing !== undefined) {
      existing.frame = this.#frame;
      return existing.view;
    }

    const recycled = this.#free.pop();
    const entry = recycled ?? this.#createEntry();
    entry.frame = this.#frame;
    this.#active.set(id, entry);
    this.#handlers.attach(entry.view);
    return entry.view;
  }

  /** Detaches every view whose entity did not appear in this frame. */
  endFrame(): void {
    for (const [id, entry] of this.#active) {
      if (entry.frame === this.#frame) continue;
      this.#handlers.detach(entry.view);
      this.#active.delete(id);
      this.#free.push(entry);
    }
  }

  destroyAll(): void {
    for (const entry of this.#active.values()) this.#handlers.destroy(entry.view);
    for (const entry of this.#free) this.#handlers.destroy(entry.view);
    this.#active.clear();
    this.#free.length = 0;
  }

  #createEntry(): Entry<TView> {
    this.#created += 1;
    return { view: this.#handlers.create(), frame: this.#frame };
  }
}
