// A small sprite rig for the 3/4 top-down characters: string-grid parts (head, torso, legs) per facing,
// procedural arms and weapons, composed per frame from a pose and outlined part by part so arms and
// weapons read clearly over the body. Frames are 32×32 with the feet on row 29 (origin 16, 30).
import { C, Img, blit, darker, grid, line, linePts, mirrorX, outline, type Legend, type Ramp, materialLegend } from './lib';

export type Facing = 'down' | 'up' | 'side';
export const FW = 32, FH = 32;
export const ORIGIN: [number, number] = [16, 30];

/** Shade characters used by every character grid (dark -> light). */
export const MAT_CHARS = {
  hair: 'qhHY',
  skin: 'zsST',
  a: 'acCD', // main cloth
  b: 'bpPR', // second cloth / trim
  lea: 'lnNO', // leather, wood
  met: '1234', // metal
  gold: '5gGy',
  pants: 'tuUV',
};
export type Mats = Partial<Record<keyof typeof MAT_CHARS, Ramp>>;
export function charLegend(m: Mats, extra: Legend = {}): Legend {
  return materialLegend(MAT_CHARS, m as Record<string, Ramp>, { o: C.ink, w: C.white, ...extra });
}

export interface Arm {
  /** hand position relative to the shoulder */
  hx: number;
  hy: number;
  /** hide the arm (e.g. behind the body, or holding something drawn in the part) */
  hide?: boolean;
}
export interface Weapon {
  /** grip position in frame pixels (where the hand holds it) */
  x: number;
  y: number;
  /** direction the business end points, radians (0 = right, PI/2 = down) */
  a: number;
  /** draw behind the body */
  back?: boolean;
  /** stretch factor for the reach (1 = normal) */
  len?: number;
  /** which arm holds it (that arm is drawn over the weapon) */
  hold?: 'front' | 'back';
}
export interface Smear {
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
  w?: number;
  fade?: boolean;
  /** draw over the body (swings towards the camera or to the side) */
  front?: boolean;
  /** colours [tail, body, edge]; default is the party's cool steel-teal */
  colors?: [number, number, number];
}
export type Eyes = 'open' | 'closed' | 'hurt' | 'ko' | 'focus';
export interface Pose {
  f: Facing;
  bob?: number;
  dx?: number;
  dy?: number;
  legs?: number;
  legsDx?: number;
  headDx?: number;
  headDy?: number;
  torsoDx?: number;
  front?: Arm;
  back?: Arm;
  wpn?: Weapon;
  smear?: Smear;
  eyes?: Eyes;
  /** extra drawing after composition (frame-space) */
  post?: (img: Img) => void;
  /** draw before the body (frame-space) */
  pre?: (img: Img) => void;
  /** offhand item, e.g. a shield */
  off?: { x: number; y: number; back?: boolean; kind?: string };
}

export interface FacingParts {
  head: Img;
  torso: Img;
  legs: Img[];
  /** top-left of each part at bob 0 */
  headAt: [number, number];
  torsoAt: [number, number];
  legsAt: [number, number];
  /** shoulder positions: front arm (drawn over the body) and back arm */
  frontShoulder: [number, number];
  backShoulder: [number, number];
  /** eye pixel positions inside the head (top-left of each eye) */
  eyes: [number, number][];
  /** draw the back arm behind the torso (side view) */
  backBehind?: boolean;
  /** the front arm is drawn over the body only when facing side; down/up both arms are "front" */
  frontBehind?: boolean;
}
export interface CharDef {
  parts: Record<Facing, FacingParts>;
  sleeve: Ramp;
  skin: Ramp;
  eye: Ramp;
  /** draw the main weapon */
  weapon?: (img: Img, w: Weapon, f: Facing) => void;
  offhand?: (img: Img, o: NonNullable<Pose['off']>, f: Facing) => void;
}

// ------------------------------------------------------------------------------------ parts drawing
function drawEyes(head: Img, p: FacingParts, eyes: Eyes, eye: Ramp, skin: Ramp, side: boolean) {
  for (const [ex, ey] of p.eyes) {
    const w = side ? 1 : 2;
    if (eyes === 'open' || eyes === 'focus') {
      // dark top row, iris + glint under it
      for (let i = 0; i < w; i++) head.set(ex + i, ey, eye[0]);
      if (side) {
        head.set(ex, ey + 1, eye[1]);
        head.set(ex, ey + 2, eye[0]);
      } else {
        head.set(ex, ey + 1, eye[1]);
        head.set(ex + 1, ey + 1, C.white);
        head.set(ex, ey + 2, eye[0]);
        head.set(ex + 1, ey + 2, eye[2]);
      }
      if (eyes === 'focus') for (let i = 0; i < w; i++) head.set(ex + i, ey - 1, darker(skin[1]));
    } else if (eyes === 'closed') {
      for (let i = 0; i < w; i++) head.set(ex + i, ey + 2, eye[0]);
      for (let i = 0; i < w; i++) head.set(ex + i, ey + 1, skin[2]);
      for (let i = 0; i < w; i++) head.set(ex + i, ey, skin[2]);
    } else if (eyes === 'hurt') {
      // squeezed shut: > <
      for (let i = 0; i < w; i++) {
        head.set(ex + i, ey, skin[2]);
        head.set(ex + i, ey + 1, eye[0]);
        head.set(ex + i, ey + 2, skin[2]);
      }
      if (!side) {
        head.set(ex, ey, eye[0]);
        head.set(ex + 1, ey + 2, eye[0]);
      }
    } else if (eyes === 'ko') {
      for (let i = 0; i < w; i++) for (let j = 0; j < 3; j++) head.set(ex + i, ey + j, skin[2]);
      head.set(ex, ey, eye[0]);
      head.set(ex + w - 1, ey + 2, eye[0]);
      head.set(ex + w - 1, ey, eye[0]);
      head.set(ex, ey + 2, eye[0]);
      head.set(ex, ey + 1, eye[0]);
    }
  }
}

/** A chibi arm: a short sleeve and a 2×2 hand. Returns its own outlined layer. */
function armLayer(sx: number, sy: number, hx: number, hy: number, sleeve: Ramp, skin: Ramp): Img {
  const L = new Img(FW, FH);
  const ex = sx + hx, ey = sy + hy;
  const pts = linePts(sx, sy, ex, ey);
  // sleeve covers the first ~60% of the arm
  const cut = Math.max(1, Math.ceil(pts.length * 0.6));
  pts.forEach(([x, y], i) => {
    const c = i < cut ? sleeve[2] : skin[2];
    L.set(x, y, c);
    L.set(x + 1, y, i < cut ? sleeve[1] : skin[1]);
  });
  // the hand: a 2×2 fist
  L.set(ex, ey, skin[2]);
  L.set(ex + 1, ey, skin[2]);
  L.set(ex, ey + 1, skin[1]);
  L.set(ex + 1, ey + 1, skin[1]);
  L.set(ex, ey, skin[3]);
  return L;
}

/** Compose one frame from a pose. */
export function renderPose(ch: CharDef, p: Pose): Img {
  const P = ch.parts[p.f];
  const out = new Img(FW, FH);
  const bob = (p.bob ?? 0) + (p.dy ?? 0);
  const dx = p.dx ?? 0;
  const side = p.f === 'side';
  const layer = () => new Img(FW, FH);

  // head with eyes
  const head = P.head.clone();
  drawEyes(head, P, p.eyes ?? 'open', ch.eye, ch.skin, side);

  const L_legs = layer();
  blit(L_legs, P.legs[p.legs ?? 0], P.legsAt[0] + dx + (p.legsDx ?? 0), P.legsAt[1] + (p.dy ?? 0));
  const L_torso = layer();
  blit(L_torso, P.torso, P.torsoAt[0] + dx + (p.torsoDx ?? 0), P.torsoAt[1] + bob);
  const L_head = layer();
  blit(L_head, head, P.headAt[0] + dx + (p.headDx ?? 0), P.headAt[1] + bob + (p.headDy ?? 0));

  const fs = P.frontShoulder, bs = P.backShoulder;
  const tdx = dx + (p.torsoDx ?? 0);
  const front = p.front ?? { hx: 0, hy: 4 };
  const back = p.back ?? { hx: 0, hy: 4 };
  const L_front = front.hide ? layer() : outline(armLayer(fs[0] + tdx, fs[1] + bob, front.hx, front.hy, ch.sleeve, ch.skin));
  const L_back = back.hide ? layer() : outline(armLayer(bs[0] + tdx, bs[1] + bob, back.hx, back.hy, ch.sleeve, ch.skin));

  let L_wpn = layer();
  if (p.wpn && ch.weapon) {
    ch.weapon(L_wpn, { ...p.wpn, x: p.wpn.x + dx, y: p.wpn.y + bob }, p.f);
    L_wpn = outline(L_wpn);
  }
  let L_off = layer();
  if (p.off && ch.offhand) {
    ch.offhand(L_off, { ...p.off, x: p.off.x + dx, y: p.off.y + bob }, p.f);
    L_off = outline(L_off);
  }

  // body = legs + torso + head, outlined as one so the silhouette is clean
  const body = layer();
  blit(body, L_legs, 0, 0);
  blit(body, outline(L_torso), 0, 0);
  blit(body, outline(L_head), 0, 0);

  p.pre?.(out);
  if (p.smear && !p.smear.front) drawSmear(out, p.smear);
  const hold = p.wpn?.hold;
  const isSideBack = side || P.backBehind;
  if (p.wpn?.back) blit(out, L_wpn, 0, 0);
  if (p.off?.back) blit(out, L_off, 0, 0);
  if (isSideBack) blit(out, L_back, 0, 0);
  blit(out, outline(body), 0, 0);
  if (!isSideBack && hold !== 'back') blit(out, L_back, 0, 0);
  if (hold !== 'front' && !side) blit(out, L_front, 0, 0);
  if (p.wpn && !p.wpn.back) blit(out, L_wpn, 0, 0);
  if (hold === 'back' && !isSideBack) blit(out, L_back, 0, 0);
  if (hold === 'front' || side) blit(out, L_front, 0, 0);
  if (p.smear?.front) drawSmear(out, p.smear);
  if (p.off && !p.off.back) blit(out, L_off, 0, 0);
  p.post?.(out);
  return out;
}

/** A motion smear: a crescent along the swing, thin at the tail (a0) and thick at the head (a1). */
export function drawSmear(img: Img, s: Smear) {
  const w = s.w ?? 4;
  const TAU = Math.PI * 2;
  const span = s.a1 - s.a0;
  const R = Math.ceil(s.r + 1);
  for (let y = Math.floor(s.cy - R); y <= s.cy + R; y++)
    for (let x = Math.floor(s.cx - R); x <= s.cx + R; x++) {
      const dx = x + 0.5 - s.cx, dy = y + 0.5 - s.cy;
      const d = Math.hypot(dx, dy);
      if (d > s.r + 0.5) continue;
      const a = Math.atan2(dy, dx);
      const along = span > 0 ? (((a - s.a0) % TAU) + TAU) % TAU : (((s.a0 - a) % TAU) + TAU) % TAU;
      if (along > Math.abs(span)) continue;
      const t = along / Math.abs(span); // 0 tail .. 1 head
      const thick = 1 + (w - 1) * Math.min(1, t * 1.3);
      if (d < s.r + 0.5 - thick) continue;
      const edge = d > s.r - 0.7;
      const [c0, c1, c2] = s.colors ?? [C.tea2, C.tea3, C.white];
      let c: number;
      if (t > 0.55) c = edge ? c2 : d > s.r - 2 ? c1 : c0;
      else if (t > 0.22) c = edge ? c1 : c0;
      else c = (x + y) & 1 ? c0 : 0;
      if (s.fade && t < 0.75 && (x + y) & 1) c = 0;
      if (s.fade && t >= 0.75 && c === c2) c = c1;
      if (c) img.set(x, y, c);
    }
}

// ------------------------------------------------------------------------------------ weapons
/** A straight blade: grip, crossguard, two-tone blade with a lit edge. */
export function drawBlade(img: Img, w: Weapon, opts: { len?: number; blade?: Ramp; guard?: Ramp; grip?: number } = {}) {
  const len = Math.round((opts.len ?? 9) * (w.len ?? 1));
  const blade = opts.blade ?? [C.stn1, C.stn2, C.stn3, C.white];
  const guard = opts.guard ?? [C.brn1, C.gold1, C.gold2, C.gold3];
  const dx = Math.cos(w.a), dy = Math.sin(w.a);
  const nx = -dy, ny = dx;
  // pick the perpendicular that points away from the light (down-right) for the shaded half
  const sgn = nx + ny >= 0 ? 1 : -1;
  // pommel + grip
  img.set(Math.round(w.x - dx * 2), Math.round(w.y - dy * 2), guard[2]);
  line(img, w.x - dx, w.y - dy, w.x, w.y, opts.grip ?? C.brn1);
  // blade
  for (let t = 2; t <= len; t += 0.5) {
    const x = w.x + dx * t, y = w.y + dy * t;
    img.set(Math.round(x), Math.round(y), t >= len - 0.5 ? blade[2] : blade[3]);
    if (t < len - 1) img.set(Math.round(x + nx * sgn * 0.9), Math.round(y + ny * sgn * 0.9), blade[1]);
  }
  // crossguard
  const gx = w.x + dx * 1.2, gy = w.y + dy * 1.2;
  for (let k = -2; k <= 2; k++) img.set(Math.round(gx + nx * k * 0.75), Math.round(gy + ny * k * 0.75), k === 0 ? guard[3] : guard[2]);
}

/** A staff with a crystal at the top. */
export function drawStaff(img: Img, w: Weapon, opts: { len?: number; under?: number; gem?: Ramp } = {}) {
  const len = Math.round((opts.len ?? 12) * (w.len ?? 1));
  const under = opts.under ?? 5;
  const dx = Math.cos(w.a), dy = Math.sin(w.a);
  const gem = opts.gem ?? [C.blu0, C.tea1, C.tea2, C.tea3];
  line(img, w.x - dx * under, w.y - dy * under, w.x + dx * len, w.y + dy * len, (t) => (t < 0.5 ? C.brn2 : C.brn2));
  // shaded side of the shaft
  const nx = -dy, ny = dx;
  const sgn = nx + ny >= 0 ? 1 : -1;
  line(img, w.x - dx * under + nx * sgn, w.y - dy * under + ny * sgn, w.x + dx * (len - 1) + nx * sgn, w.y + dy * (len - 1) + ny * sgn, (t, x, y) => (img.get(x, y) ? 0 : C.brn1));
  // gold cap
  const cx = w.x + dx * len, cy = w.y + dy * len;
  img.set(Math.round(cx), Math.round(cy), C.gold2);
  img.set(Math.round(cx - dx), Math.round(cy - dy), C.gold1);
  // crystal: a 3×4 diamond past the cap
  const gx = Math.round(cx + dx * 2.5), gy = Math.round(cy + dy * 2.5);
  const shape: [number, number, number][] = [
    [0, -2, 3], [-1, -1, 3], [0, -1, 2], [1, -1, 2], [-1, 0, 2], [0, 0, 2], [1, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 0], [0, 2, 0],
  ];
  for (const [x, y, k] of shape) img.set(gx + x, gy + y, gem[k]);
  img.set(gx - 1, gy - 1, C.white);
}

/** A flanged mace: wooden haft, steel head. */
export function drawMace(img: Img, w: Weapon, opts: { len?: number } = {}) {
  const len = Math.round((opts.len ?? 6) * (w.len ?? 1));
  const dx = Math.cos(w.a), dy = Math.sin(w.a);
  line(img, w.x - dx * 1.5, w.y - dy * 1.5, w.x + dx * len, w.y + dy * len, C.brn2);
  img.set(Math.round(w.x - dx * 2), Math.round(w.y - dy * 2), C.gold2);
  const hx = w.x + dx * (len + 2), hy = w.y + dy * (len + 2);
  // head: 4×4 with flanges
  for (let j = -2; j <= 2; j++)
    for (let i = -2; i <= 2; i++) {
      if (Math.abs(i) + Math.abs(j) > 3) continue;
      const v = -i - j; // light from top-left
      const c = v >= 2 ? C.white : v >= 0 ? C.stn3 : v >= -2 ? C.stn2 : C.stn1;
      img.set(Math.round(hx) + i, Math.round(hy) + j, c);
    }
  img.set(Math.round(hx), Math.round(hy), C.gold2);
}

// ------------------------------------------------------------------------------------ helpers
export const mirrorParts = (img: Img) => mirrorX(img);
/**
 * Side-view legs drawn procedurally: a hip, two legs (the far one a shade darker) and boots pointing
 * right. `feet` are [x, y] of each boot's heel; y = 29 is on the ground.
 */
export function sideLegs(pants: Ramp, boots: Ramp, hip: [number, number], near: [number, number], far: [number, number], opts: { w?: number; bootLen?: number; robe?: boolean } = {}): Img {
  const L = new Img(FW, FH);
  const w = opts.w ?? 3;
  const bl = opts.bootLen ?? 4;
  const leg = (foot: [number, number], dark: boolean) => {
    const P = dark ? [pants[0], pants[1], pants[1]] : [pants[1], pants[2], pants[3]];
    const B = dark ? [boots[0], boots[0], boots[1]] : [boots[0], boots[1], boots[2]];
    const [fx, fy] = foot;
    const ax = fx, ay = fy - 1; // ankle
    const pts = linePts(hip[0], hip[1], ax, ay - 1);
    for (const [x, y] of pts) for (let i = 0; i < w; i++) L.set(x - 1 + i, y, i === 0 ? P[1] : i === w - 1 ? P[0] : P[2]);
    // boot: two rows, toe forward (right)
    for (let i = 0; i < bl; i++) {
      L.set(ax - 1 + i, ay, i === bl - 1 ? B[1] : B[2]);
      L.set(ax - 1 + i, ay + 1, B[0]);
    }
    L.set(ax - 1, ay - 1, B[1]);
    L.set(ax, ay - 1, B[2]);
    L.set(ax + 1, ay - 1, B[1]);
  };
  leg(far, true);
  const nearL = new Img(FW, FH);
  const save = L.px.slice();
  L.px.fill(0);
  leg(near, false);
  nearL.px.set(L.px);
  L.px.set(save);
  blit(L, outline(nearL), 0, 0);
  return L;
}

export function g(legend: Legend, s: string) {
  return grid(s, legend);
}
