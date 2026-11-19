// Input for figure games, modelled on Godot's Input singleton: actions, is_action_pressed,
// is_action_just_pressed, get_vector. Key bindings follow the starter project's input map.

export type Action = 'up' | 'down' | 'left' | 'right' | 'attack' | 'dash' | 'jump' | 'tactical' | 'switch' | 'ability' | 'interact';

export const ACTION_KEYS: Record<string, Action> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  j: 'attack',
  z: 'attack',
  k: 'dash',
  x: 'dash',
  Shift: 'dash',
  ' ': 'jump',
  l: 'tactical',
  Tab: 'tactical',
  q: 'switch',
  e: 'ability',
  c: 'ability',
  f: 'interact',
  Enter: 'interact',
};

export class Input {
  private down = new Set<Action>();
  private pressed = new Set<Action>();
  private released = new Set<Action>();
  /** time (s) since each action was last pressed, for input buffering demos */
  private since = new Map<Action, number>();

  press(a: Action) {
    if (!this.down.has(a)) {
      this.pressed.add(a);
      this.since.set(a, 0);
    }
    this.down.add(a);
  }
  release(a: Action) {
    if (this.down.has(a)) this.released.add(a);
    this.down.delete(a);
  }
  releaseAll() {
    for (const a of this.down) this.released.add(a);
    this.down.clear();
  }
  /** Godot: Input.is_action_pressed */
  isDown(a: Action) {
    return this.down.has(a);
  }
  /** Godot: Input.is_action_just_pressed (true for exactly one physics step) */
  justPressed(a: Action) {
    return this.pressed.has(a);
  }
  justReleased(a: Action) {
    return this.released.has(a);
  }
  /** seconds since the action was last pressed (Infinity if never) */
  timeSincePress(a: Action) {
    return this.since.get(a) ?? Infinity;
  }
  /** Godot: Input.get_vector("left","right","up","down"), normalized to length ≤ 1 (y grows downward) */
  vector(): [number, number] {
    let x = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    let y = (this.down.has('down') ? 1 : 0) - (this.down.has('up') ? 1 : 0);
    const n = Math.hypot(x, y);
    if (n > 1) {
      x /= n;
      y /= n;
    }
    return [x, y];
  }
  /** raw axis vector without normalization (to demonstrate the diagonal-speed bug) */
  rawVector(): [number, number] {
    return [(this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0), (this.down.has('down') ? 1 : 0) - (this.down.has('up') ? 1 : 0)];
  }
  /** called by the loop after each fixed step */
  endStep(dt = 1 / 60) {
    this.pressed.clear();
    this.released.clear();
    for (const [a, t] of this.since) this.since.set(a, t + dt);
  }
}
