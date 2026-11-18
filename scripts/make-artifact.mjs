// Turns dist-single/index.html into a body fragment (title + styles + root + script)
// for hosts that wrap pages in their own <html>/<head>/<body> skeleton.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist-single/index.html', 'utf8');
const head = /<head>([\s\S]*?)<\/head>/i.exec(html)[1];
const body = /<body>([\s\S]*?)<\/body>/i.exec(html)[1];
const title = /<title>[\s\S]*?<\/title>/i.exec(head)[0];
const desc = /<meta name="description"[^>]*>/i.exec(head)?.[0] ?? '';
const styles = [...head.matchAll(/<style[\s\S]*?<\/style>/gi)].map((m) => m[0]).join('\n');
const scripts = [...head.matchAll(/<script[\s\S]*?<\/script>/gi)].map((m) => m[0]).join('\n');
const out = `${title}\n${desc}\n${styles}\n${body.trim()}\n${scripts}\n`;
writeFileSync('dist-single/excel-hero-academy.html', out);
console.log('wrote dist-single/excel-hero-academy.html', (out.length / 1024).toFixed(0) + ' KB');
