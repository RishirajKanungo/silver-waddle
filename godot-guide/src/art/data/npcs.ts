// Townsfolk: a farmer in a straw hat. `villager2` is the same sprite with a palette swap.
import type { ArtModule, SheetDef } from '../types';
import { C, RAMPS, rampSwap, rowSheet, toRGBA, type Img } from './lib';
import { FW, FH, ORIGIN, charLegend, renderPose, type CharDef, g } from './rig';
import { frontLegSet, sideLegSet } from './characters';
import { walkCycle } from './poses';

const V = charLegend({ hair: RAMPS.hairBrown, skin: RAMPS.skin, a: RAMPS.green, b: RAMPS.red, lea: RAMPS.brown, gold: RAMPS.gold, pants: RAMPS.sand });

const headDown = g(V, `
  .....yyyy.....
  ...yGGGGGGy...
  ..yGGGGGGGGg..
  ..PPPPPPPPPP..
  yGGGGGGGGGGGGg
  .gggggggggggg.
  .hHSSSSSSSSHh.
  hHSSSSSSSSSSHh
  hSSSSSSSSSSSSh
  hSSSSSSSSSSSSh
  .SSSSSSSSSSSS.
  ..sSSSssSSSs..
  ...ssSSSSss...
`);
const headUp = g(V, `
  .....yyyy.....
  ...yGGGGGGy...
  ..yGGGGGGGGg..
  ..PPPPPPPPPP..
  yGGGGGGGGGGGGg
  .gggggggggggg.
  .hHHHHHHHHHHh.
  hHHHHHHHHHHHHh
  hHHHHHHHHHHHHh
  hhHHHHHHHHHHhh
  .hhHHHHHHHHhh.
  ..ssHHHHHHss..
  ...ssssssss...
`);
const headSide = g(V, `
  ....yyyy......
  ..yGGGGGGy....
  .yGGGGGGGGg...
  .PPPPPPPPPP...
  yGGGGGGGGGGGGg
  .ggggggggggggg
  .hHHHHSSSSSS..
  hHHHHsSSSSSSS.
  hHHHzsSSSSSSS.
  hhHHssSSSSSSS.
  .hhhSSSSSSSs..
  ..hhsSSSSSs...
  ....sssSSs....
`);
const torsoDown = g(V, `
  ...TTTTTT...
  .acCTTTTCca.
  .cCDNNNNCCc.
  .cCDNOONCCc.
  .cCDNNNNCCc.
  .lnNNNNNNnl.
  ..cCNNNNCc..
`);
const torsoUp = g(V, `
  ...TTTTTT...
  .acCCCCCCca.
  .cCDCCCCCCc.
  .cCDCCCCCCc.
  .cCDCCCCCCc.
  .lnNNNNNNnl.
  ..cCCCCCCc..
`);
const torsoSide = g(V, `
  ...TTTT...
  ..cCDCCc..
  .cCDCCNNc.
  .cCDCCNOc.
  .cCCCCNNc.
  .lnNNNNNl.
  ..cCCCNc..
`);
const leg = g(V, `
  tUU.
  tUU.
  tUU.
  lNN.
  lnNl
  llll
`);

const villager: CharDef = {
  sleeve: RAMPS.green,
  skin: RAMPS.skin,
  eye: [C.brn0, C.brn1, C.brn2, C.brn3],
  parts: {
    down: { head: headDown, torso: torsoDown, legs: frontLegSet(leg), headAt: [9, 6], torsoAt: [10, 18], legsAt: [10, 24], backShoulder: [9, 19], frontShoulder: [21, 19], eyes: [[3, 8], [9, 8]] },
    up: { head: headUp, torso: torsoUp, legs: frontLegSet(leg), headAt: [9, 6], torsoAt: [10, 18], legsAt: [10, 24], backShoulder: [9, 19], frontShoulder: [21, 19], eyes: [] },
    side: { head: headSide, torso: torsoSide, legs: sideLegSet(RAMPS.sand, RAMPS.brown), headAt: [9, 6], torsoAt: [11, 18], legsAt: [0, 0], frontShoulder: [14, 19], backShoulder: [17, 19], eyes: [[10, 8]] },
  },
};

function anims(swap?: (img: Img) => Img) {
  const R = (p: Parameters<typeof renderPose>[1]) => {
    const img = renderPose(villager, p);
    return swap ? swap(img) : img;
  };
  return [
    { name: 'idle_down', fps: 2.5, loop: true, frames: [R({ f: 'down' }), R({ f: 'down', bob: 1, front: { hx: 0, hy: 3 }, back: { hx: 0, hy: 3 } })] },
    { name: 'walk_down', fps: 7, loop: true, frames: walkCycle('down').map(R) },
    { name: 'walk_up', fps: 7, loop: true, frames: walkCycle('up').map(R) },
    { name: 'walk_side', fps: 7, loop: true, frames: walkCycle('side').map(R) },
  ];
}

// villager2: dark hair, a blue tunic, a red-brown hat and grey trousers (ramp-for-ramp palette swap)
const swap2 = (img: Img) =>
  rampSwap(img, [
    [RAMPS.green, RAMPS.blue],
    [RAMPS.hairBrown, RAMPS.hairDark],
    [[C.gold1, C.gold2, C.gold3], [C.red1, C.red2, C.red3]],
    [[C.red1, C.red2, C.red3], [C.blu1, C.blu2, C.blu3]],
    [[C.snd1, C.snd2], [C.stn2, C.stn3]],
  ]);

function sheet(id: string, title: string, file: string, swap?: (img: Img) => Img): ArtModule['sheets'][number] {
  const s = rowSheet(anims(swap), 4, FW, FH);
  const def: SheetDef = {
    id, kind: 'npc', title, file, frameW: FW, frameH: FH, cols: s.cols, rows: s.rows, anims: s.anims, origin: ORIGIN,
    notes: 'One animation per row (4 columns). Side walk faces right: flip_h for left. Pivot at the feet (16, 30).',
  };
  return { def, render: () => toRGBA(rowSheet(anims(swap), 4, FW, FH).img) };
}

export const ART: ArtModule = {
  sheets: [
    sheet('villager', 'Villager (straw hat)', 'assets/characters/villager.png'),
    sheet('villager2', 'Villager, second palette', 'assets/characters/villager2.png', swap2),
  ],
};
