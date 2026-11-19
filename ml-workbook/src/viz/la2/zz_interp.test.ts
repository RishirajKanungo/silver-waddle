// TEMPORARY harness (deleted before hand-off): run snippets in the in-browser interpreter and CPython.
import { it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { runPython } from '../../py/python';
const DIR = process.env.SNIP_DIR ?? '';
it('snippets', () => {
  if (!DIR) return;
  let log = '';
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.py')).sort()) {
    const src = readFileSync(DIR + '/' + f, 'utf8');
    const r = runPython(src);
    let ref = '';
    try { ref = execFileSync('python3', ['-c', src], { encoding: 'utf8' }); } catch (e) { ref = 'CPYTHON ERROR ' + String((e as { stderr?: string }).stderr); }
    const same = r.stdout === ref && !r.error;
    log += (`=== ${f}: ${same ? 'SAME' : 'DIFF'}\n` + (same ? r.stdout : `--- interp:\n${r.stdout}${r.error ?? ''}\n--- cpython:\n${ref}`));
  }
  writeFileSync(DIR + '/out.txt', log);
});
