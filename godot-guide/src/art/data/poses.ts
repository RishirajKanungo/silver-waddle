// Pose tables for the party: idle, walk, attack, dash, jump, cast, hurt, KO and guard, built on ./rig.
// One set of poses serves all three characters; the fighting style decides what the hands hold.
import { C, Img, line } from './lib';
import { renderPose, type Arm, type CharDef, type Facing, type Pose, type Smear } from './rig';

export type Style = 'sword' | 'staff' | 'shield';
export interface Anim {
  name: string;
  frames: Img[];
  fps: number;
  loop: boolean;
}
const PI = Math.PI;

/** A four-point twinkle. */
export function sparkle(img: Img, x: number, y: number, size = 1, col: number = C.white, rim: number = C.tea3) {
  img.set(x, y, col);
  for (let k = 1; k <= size; k++) {
    const c = k === size ? rim : col;
    img.set(x + k, y, c);
    img.set(x - k, y, c);
    img.set(x, y + k, c);
    img.set(x, y - k, c);
  }
}
/** A soft glowing orb (magic gathering in the hands). */
function orb(img: Img, x: number, y: number, r: number, ramp: number[] = [C.tea1, C.tea2, C.tea3, C.white]) {
  for (let j = -r; j <= r; j++)
    for (let i = -r; i <= r; i++) {
      const d = Math.hypot(i, j);
      if (d > r + 0.3) continue;
      const k = d < r * 0.35 ? 3 : d < r * 0.7 ? 2 : (i + j) & 1 ? 1 : 0;
      if (k === 0 && (i + j) & 1) continue;
      img.set(x + i, y + j, ramp[k]);
    }
}
/** Speed lines trailing a dash. */
function streaks(img: Img, f: Facing) {
  const col = [C.white, C.tea3, C.stn3];
  if (f === 'side') {
    [[16, 3, 7], [20, 1, 5], [24, 4, 8], [13, 2, 4]].forEach(([y, x0, len], k) => line(img, x0, y, x0 + len, y, col[k % 3]));
  } else {
    const ys = f === 'down' ? [2, 3, 0, 0] : [22, 24, 26, 21];
    [[7, 6], [24, 6], [10, 4], [22, 3]].forEach(([x, len], k) => line(img, x, ys[k], x, ys[k] + len, col[k % 3]));
  }
}
function impact(img: Img, x: number, y: number) {
  // a little white "pow" star used by bashes and hits
  sparkle(img, x, y, 2, C.white, C.gold3);
  img.set(x - 2, y - 2, C.gold3);
  img.set(x + 2, y + 2, C.gold3);
  img.set(x + 2, y - 2, C.gold2);
  img.set(x - 2, y + 2, C.gold2);
}

interface Carry {
  /** arm that holds the main weapon and the default hand offset while carrying it */
  arm: 'front' | 'back';
  hx: number;
  hy: number;
  a: number;
  back?: boolean;
  len?: number;
}

/** The 4-frame walk cycle shared by every 32×32 character. */
export function walkCycle(f: Facing): Pose[] {
  return f === 'side'
    ? [
        { f, legs: 1, bob: 0, front: { hx: 2, hy: 4 }, back: { hx: -2, hy: 4 } },
        { f, legs: 2, bob: -1, front: { hx: 0, hy: 4 }, back: { hx: 0, hy: 4 } },
        { f, legs: 3, bob: 0, front: { hx: -2, hy: 4 }, back: { hx: 2, hy: 4 } },
        { f, legs: 4, bob: -1, front: { hx: 0, hy: 4 }, back: { hx: 0, hy: 4 } },
      ]
    : [
        { f, legs: 1, bob: 0, front: { hx: 0, hy: 5 }, back: { hx: 0, hy: 3 } },
        { f, legs: 0, bob: -1, front: { hx: 0, hy: 4 }, back: { hx: 0, hy: 4 } },
        { f, legs: 2, bob: 0, front: { hx: 0, hy: 3 }, back: { hx: 0, hy: 5 } },
        { f, legs: 0, bob: -1, front: { hx: 0, hy: 4 }, back: { hx: 0, hy: 4 } },
      ];
}

export function buildAnims(ch: CharDef, style: Style, ko: (ch: CharDef) => Img): Anim[] {
  const R = (p: Pose) => renderPose(ch, p);
  const sh = (f: Facing, arm: 'front' | 'back') => (arm === 'front' ? ch.parts[f].frontShoulder : ch.parts[f].backShoulder);
  /** grip point for a hand at offset (hx, hy) from the given shoulder */
  const grip = (f: Facing, arm: 'front' | 'back', hx: number, hy: number, tdx = 0) => {
    const [sx, sy] = sh(f, arm);
    return { x: sx + hx + tdx, y: sy + hy };
  };

  // ------------------------------------------------------------------ what the hands carry
  const carry: Record<Style, Partial<Record<Facing, Carry>>> = {
    sword: {},
    staff: {
      down: { arm: 'back', hx: -1, hy: 3, a: -PI / 2 },
      up: { arm: 'front', hx: 1, hy: 3, a: -PI / 2 },
      side: { arm: 'back', hx: 1, hy: 3, a: -PI / 2 + 0.05, back: true, len: 1.35 },
    },
    shield: {
      down: { arm: 'back', hx: -1, hy: 4, a: -PI / 2 - 0.3 },
      up: { arm: 'front', hx: 1, hy: 4, a: -PI / 2 + 0.3 },
      side: { arm: 'front', hx: 0, hy: 4, a: -PI + 0.55 },
    },
  };
  /** shield placement (Bram): carried on the off arm */
  const shieldAt = (f: Facing, dx = 0, dy = 0, kind?: string): Pose['off'] =>
    style !== 'shield' ? undefined : f === 'down' ? { x: 22 + dx, y: 23 + dy, kind: kind ?? 'front' } : f === 'up' ? { x: 9 + dx, y: 23 + dy, kind: kind ?? 'back', back: false } : { x: 20 + dx, y: 23 + dy, kind: kind ?? 'side' };

  /** add the carried weapon (and shield) to a non-attack pose */
  const withCarry = (p: Pose): Pose => {
    const c = carry[style][p.f];
    const q: Pose = { ...p };
    if (c) {
      const arm: Arm = { hx: c.hx, hy: c.hy };
      if (c.arm === 'front') q.front = arm;
      else q.back = arm;
      const gp = grip(p.f, c.arm, c.hx, c.hy, (p.dx ?? 0) * 0 + (p.torsoDx ?? 0));
      q.wpn = { x: gp.x, y: gp.y, a: c.a, back: c.back, hold: c.arm, len: c.len };
    }
    if (style === 'shield') {
      q.off = shieldAt(p.f, p.torsoDx ?? 0, 0);
      // the shield arm is hidden behind the shield in front/back views
      if (p.f === 'down') q.front = { hx: 0, hy: 3 };
      if (p.f === 'up') q.back = { hx: 0, hy: 3 };
    }
    return q;
  };

  const anims: Anim[] = [];
  const add = (name: string, fps: number, loop: boolean, poses: Pose[]) => anims.push({ name, fps, loop, frames: poses.map(R) });
  const F: Facing[] = ['down', 'up', 'side'];

  // ------------------------------------------------------------------ idle (breathing)
  for (const f of F)
    add(`idle_${f}`, 3, true, [
      withCarry({ f, bob: 0 }),
      withCarry({ f, bob: 1, front: { hx: 0, hy: 3 }, back: { hx: 0, hy: 3 } }),
    ]);

  // ------------------------------------------------------------------ walk
  for (const f of F) {
    const poses = walkCycle(f);
    add(`walk_${f}`, 8, true, poses.map((p) => {
      const q = withCarry(p);
      // the carried weapon swings a little with the walk
      if (q.wpn && f === 'side' && style === 'shield') q.wpn.a += (p.front?.hx ?? 0) * 0.08;
      return q;
    }));
  }

  // ------------------------------------------------------------------ attacks
  for (const f of F) add(`attack_${f}`, 14, false, attackPoses(f));

  function attackPoses(f: Facing): Pose[] {
    if (style === 'sword') {
      if (f === 'down') {
        const W = (hx: number, hy: number, a: number) => ({ ...grip(f, 'back', hx, hy), a, hold: 'back' as const });
        return [
          { f, legs: 1, eyes: 'focus', back: { hx: -2, hy: -3 }, front: { hx: 1, hy: 3 }, wpn: W(-2, -3, -2.3) },
          { f, legs: 2, bob: 1, eyes: 'focus', back: { hx: 3, hy: 5 }, front: { hx: 1, hy: 2 }, wpn: W(3, 5, 1.45), smear: { cx: 16, cy: 19, r: 13, a0: PI * 0.97, a1: PI * 0.5, front: true } },
          { f, legs: 2, bob: 1, back: { hx: 8, hy: 4 }, front: { hx: 2, hy: 3 }, wpn: W(8, 4, 0.45), smear: { cx: 16, cy: 19, r: 13, a0: PI * 0.8, a1: PI * 0.12, fade: true, front: true } },
          { f, legs: 0, back: { hx: 4, hy: 5 }, front: { hx: 0, hy: 4 }, wpn: W(4, 5, 1.1) },
        ];
      }
      if (f === 'up') {
        const W = (hx: number, hy: number, a: number, back = true) => ({ ...grip(f, 'front', hx, hy), a, hold: 'front' as const, back });
        return [
          { f, legs: 1, front: { hx: 2, hy: -2 }, back: { hx: -1, hy: 3 }, wpn: W(2, -2, -0.5, false) },
          { f, legs: 2, bob: -1, front: { hx: -3, hy: -4 }, back: { hx: 0, hy: 3 }, wpn: W(-3, -4, -1.75), smear: { cx: 16, cy: 15, r: 13, a0: -PI * 0.08, a1: -PI * 0.55 } },
          { f, legs: 2, bob: -1, front: { hx: -8, hy: -3 }, back: { hx: 0, hy: 4 }, wpn: W(-8, -3, -2.5), smear: { cx: 16, cy: 15, r: 13, a0: -PI * 0.3, a1: -PI * 0.92, fade: true } },
          { f, legs: 0, front: { hx: -4, hy: 2 }, back: { hx: 0, hy: 4 }, wpn: W(-4, 2, -2.2) },
        ];
      }
      const W = (hx: number, hy: number, a: number, tdx = 0) => ({ ...grip(f, 'front', hx, hy, tdx), a, hold: 'front' as const });
      return [
        { f, legs: 0, eyes: 'focus', torsoDx: -1, headDx: -1, front: { hx: -3, hy: -3 }, back: { hx: -1, hy: 3 }, wpn: W(-3, -3, -2.35, -1) },
        { f, legs: 7, torsoDx: 1, headDx: 1, front: { hx: 5, hy: 0 }, back: { hx: -2, hy: 3 }, wpn: W(5, 0, -0.12, 1), smear: { cx: 18, cy: 21, r: 12, a0: -PI * 0.45, a1: -0.05, front: true } },
        { f, legs: 7, torsoDx: 1, headDx: 1, front: { hx: 5, hy: 3 }, back: { hx: -2, hy: 3 }, wpn: W(5, 3, 0.75, 1), smear: { cx: 18, cy: 21, r: 12, a0: -PI * 0.3, a1: PI * 0.3, fade: true, front: true } },
        { f, legs: 1, front: { hx: 3, hy: 4 }, back: { hx: -1, hy: 4 }, wpn: W(3, 4, 1.25) },
      ];
    }
    if (style === 'staff') {
      // a two-handed jab with the crystal end, finished with a spark at the tip
      if (f === 'down') {
        const W = (x: number, y: number, len = 0.55) => ({ x, y, a: PI / 2, hold: 'back' as const, len });
        return [
          { f, legs: 0, bob: -1, eyes: 'focus', back: { hx: 4, hy: -2 }, front: { hx: -4, hy: -1 }, wpn: W(13, 17, 0.4) },
          { f, legs: 1, bob: 1, back: { hx: 5, hy: 4 }, front: { hx: -4, hy: 4 }, wpn: W(14, 23, 0.6), post: (img) => sparkle(img, 15, 31, 2) },
          { f, legs: 1, bob: 1, back: { hx: 5, hy: 4 }, front: { hx: -4, hy: 4 }, wpn: W(14, 23, 0.6), post: (img) => { sparkle(img, 12, 29, 1); sparkle(img, 19, 30, 1); } },
          { f, legs: 0, back: { hx: 3, hy: 3 }, front: { hx: -3, hy: 4 }, wpn: W(12, 22, 0.45) },
        ];
      }
      if (f === 'up') {
        const W = (x: number, y: number, len: number) => ({ x, y, a: -PI / 2 + 0.08, hold: 'front' as const, len });
        return [
          { f, legs: 0, bob: 1, back: { hx: 2, hy: 2 }, front: { hx: 1, hy: 2 }, wpn: W(22, 22, 0.8) },
          { f, legs: 1, bob: -1, back: { hx: 3, hy: -2 }, front: { hx: 1, hy: -3 }, wpn: W(22, 16, 1.0), post: (img) => sparkle(img, 24, 1, 2) },
          { f, legs: 1, bob: -1, back: { hx: 3, hy: -2 }, front: { hx: 1, hy: -3 }, wpn: W(22, 16, 1.0), post: (img) => { sparkle(img, 21, 2, 1); sparkle(img, 27, 3, 1); } },
          { f, legs: 0, back: { hx: 1, hy: 3 }, front: { hx: 1, hy: 2 }, wpn: W(22, 21, 0.85) },
        ];
      }
      const W = (hx: number, hy: number, tdx: number) => ({ ...grip(f, 'front', hx, hy, tdx), a: 0, hold: 'front' as const, len: 0.95 });
      return [
        { f, legs: 0, eyes: 'focus', torsoDx: -1, headDx: -1, front: { hx: -4, hy: 2 }, back: { hx: -1, hy: 2 }, wpn: { ...W(-4, 2, -1), len: 0.8 } },
        { f, legs: 7, torsoDx: 1, headDx: 1, front: { hx: 3, hy: 2 }, back: { hx: 1, hy: 2 }, wpn: W(3, 2, 1), post: (img) => sparkle(img, 31, 21, 2) },
        { f, legs: 7, torsoDx: 1, headDx: 1, front: { hx: 3, hy: 2 }, back: { hx: 1, hy: 2 }, wpn: W(3, 2, 1), post: (img) => { sparkle(img, 29, 18, 1); sparkle(img, 30, 24, 1); } },
        { f, legs: 1, front: { hx: 0, hy: 3 }, back: { hx: 0, hy: 3 }, wpn: { ...W(0, 3, 0), a: 0.5, len: 0.8 } },
      ];
    }
    // shield bash: pull in, slam forward with a "pow", hold, recover
    if (f === 'down')
      return [
        { ...withCarry({ f, legs: 0, bob: -1, eyes: 'focus' }), off: shieldAt(f, -2, -2) },
        { ...withCarry({ f, legs: 1, bob: 1 }), off: shieldAt(f, -3, 3, 'front'), post: (img: Img) => impact(img, 20, 29) },
        { ...withCarry({ f, legs: 1, bob: 1 }), off: shieldAt(f, -3, 3, 'front'), post: (img: Img) => { sparkle(img, 14, 30, 1, C.white, C.gold3); sparkle(img, 26, 29, 1, C.white, C.gold3); } },
        { ...withCarry({ f, legs: 0 }), off: shieldAt(f, -1, 1) },
      ];
    if (f === 'up')
      return [
        { ...withCarry({ f, legs: 0, bob: 1 }), off: shieldAt(f, 2, 1) },
        { ...withCarry({ f, legs: 1, bob: -1 }), off: shieldAt(f, 4, -6), post: (img) => impact(img, 15, 7) },
        { ...withCarry({ f, legs: 1, bob: -1 }), off: shieldAt(f, 4, -6), post: (img) => { sparkle(img, 10, 5, 1, C.white, C.gold3); sparkle(img, 21, 4, 1, C.white, C.gold3); } },
        { ...withCarry({ f, legs: 0 }), off: shieldAt(f, 2, -1) },
      ];
    return [
      { ...withCarry({ f, legs: 0, eyes: 'focus', torsoDx: -1, headDx: -1 }), off: shieldAt(f, -3, 0) },
      { ...withCarry({ f, legs: 7, torsoDx: 1, headDx: 1 }), off: shieldAt(f, 5, 0), post: (img) => impact(img, 28, 21) },
      { ...withCarry({ f, legs: 7, torsoDx: 1, headDx: 1 }), off: shieldAt(f, 5, 0), post: (img) => { sparkle(img, 29, 15, 1, C.white, C.gold3); sparkle(img, 30, 26, 1, C.white, C.gold3); } },
      { ...withCarry({ f, legs: 1 }), off: shieldAt(f, 1, 0) },
    ];
  }

  // ------------------------------------------------------------------ dash
  for (const f of F) {
    const poses: Pose[] =
      f === 'side'
        ? [
            { f, legs: 7, torsoDx: 1, headDx: 2, bob: 1, front: { hx: -3, hy: 2 }, back: { hx: -3, hy: 2 }, pre: (img) => streaks(img, f) },
            { f, legs: 1, torsoDx: 1, headDx: 2, bob: 0, front: { hx: -3, hy: 3 }, back: { hx: -2, hy: 3 }, pre: (img) => streaks(img, f) },
          ]
        : [
            { f, legs: 1, bob: 1, headDy: f === 'down' ? 1 : -1, front: { hx: 2, hy: 1 }, back: { hx: -2, hy: 1 }, pre: (img) => streaks(img, f) },
            { f, legs: 2, bob: 0, headDy: f === 'down' ? 1 : -1, front: { hx: 2, hy: 2 }, back: { hx: -2, hy: 2 }, pre: (img) => streaks(img, f) },
          ];
    add(`dash_${f}`, 12, true, poses.map((p) => {
      const q = withCarry(p);
      if (carry[style][f] && style !== 'shield') {
        // trail the weapon behind while dashing
        const c = carry[style][f]!;
        const arm = c.arm === 'front' ? p.front! : p.back!;
        if (c.arm === 'front') q.front = arm;
        else q.back = arm;
        const gp = grip(f, c.arm, arm.hx, arm.hy, p.torsoDx ?? 0);
        q.wpn = { ...q.wpn!, x: gp.x, y: gp.y, a: f === 'side' ? PI - 0.5 : c.a };
      }
      return q;
    }));
  }

  // ------------------------------------------------------------------ jump
  add('jump_down', 10, false, [
    withCarry({ f: 'down', bob: 2, eyes: 'focus', front: { hx: 2, hy: 2 }, back: { hx: -2, hy: 2 } }),
    withCarry({ f: 'down', dy: -5, legs: 3, front: { hx: 2, hy: -2 }, back: { hx: -2, hy: -2 } }),
  ]);
  add('jump_side', 10, false, [
    withCarry({ f: 'side', bob: 2, legs: 5, torsoDx: 1, headDx: 1, eyes: 'focus', front: { hx: -2, hy: 3 }, back: { hx: -2, hy: 3 } }),
    withCarry({ f: 'side', dy: -5, legs: 6, front: { hx: 3, hy: -2 }, back: { hx: 2, hy: -1 } }),
  ]);

  // ------------------------------------------------------------------ cast (facing down)
  const glowRamp = [C.tea1, C.tea2, C.tea3, C.white];
  if (style === 'staff') {
    const W = (x: number, y: number, a = -PI / 2) => ({ x, y, a, hold: 'back' as const });
    add('cast', 8, false, [
      { f: 'down', eyes: 'closed', back: { hx: -1, hy: -1 }, front: { hx: -2, hy: 1 }, wpn: W(8, 18), post: (img) => sparkle(img, 9, 2, 1) },
      { f: 'down', eyes: 'closed', bob: -1, back: { hx: 1, hy: -5 }, front: { hx: -4, hy: -4 }, wpn: W(10, 14), post: (img) => { orb(img, 11, 0, 2, glowRamp); sparkle(img, 6, 3, 1); sparkle(img, 17, 1, 1); } },
      { f: 'down', eyes: 'open', back: { hx: 3, hy: 2 }, front: { hx: 1, hy: 3 }, wpn: W(12, 21, PI / 2 + 0.6), post: (img) => { sparkle(img, 4, 28, 2); sparkle(img, 2, 22, 1); sparkle(img, 8, 31, 1); } },
    ]);
  } else {
    add('cast', 8, false, [
      withCarryCast({ f: 'down', eyes: 'closed', back: { hx: -1, hy: -4 }, front: { hx: 1, hy: -4 }, post: (img) => { sparkle(img, 8, 13, 1); sparkle(img, 23, 13, 1); } }),
      withCarryCast({ f: 'down', eyes: 'closed', bob: 1, back: { hx: 4, hy: 2 }, front: { hx: -4, hy: 2 }, post: (img) => orb(img, 15, 23, 2, glowRamp) }),
      withCarryCast({ f: 'down', eyes: 'open', back: { hx: -3, hy: 1 }, front: { hx: 3, hy: 1 }, post: (img) => { sparkle(img, 5, 18, 2); sparkle(img, 26, 18, 2); sparkle(img, 15, 2, 1); } }),
    ]);
  }
  function withCarryCast(p: Pose): Pose {
    // the sword stays sheathed; the shield stays on the arm
    if (style === 'shield') return { ...p, off: shieldAt('down', 0, 0), front: p.front };
    return p;
  }

  // ------------------------------------------------------------------ hurt, KO, guard
  add('hurt', 8, false, [
    withCarry({ f: 'down', dy: -1, headDy: -1, eyes: 'hurt', front: { hx: 3, hy: 0 }, back: { hx: -3, hy: 0 }, post: (img) => impact(img, 24, 9) }),
    withCarry({ f: 'down', bob: 1, eyes: 'hurt', front: { hx: 1, hy: 3 }, back: { hx: -1, hy: 3 } }),
  ]);
  anims.push({ name: 'ko', fps: 1, loop: false, frames: [ko(ch)] });
  const guardPose: Pose =
    style === 'sword'
      ? { f: 'down', bob: 1, eyes: 'focus', back: { hx: 3, hy: 1 }, front: { hx: -4, hy: 1 }, wpn: { ...grip('down', 'back', 3, 1), a: -0.15, hold: 'back' } }
      : style === 'staff'
        ? { f: 'down', bob: 1, eyes: 'focus', back: { hx: 0, hy: 2 }, front: { hx: -2, hy: 2 }, wpn: { x: 9, y: 22, a: -0.12, hold: 'back', len: 1.15 } }
        : { ...withCarry({ f: 'down', bob: 1, eyes: 'focus' }), off: { x: 15, y: 22, kind: 'front' } };
  add('guard', 1, false, [guardPose]);
  return anims;
}

export type { Smear };
