import { it } from 'vitest';
import { MODULE } from '../../content/modules/k04_battle_system';
it('x', () => {
  const l = MODULE.lessons[1];
  for (const c of l.cells) if (c.kind === 'build') console.log((c.ch.solution[0].code.match(/_in_radius/g) ?? []).length);
});
