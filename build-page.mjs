// build-page.mjs — inline the gated grow.mjs kernel into index.html VERBATIM, between the markers.
// CI diffs the rebuild so the live logic cannot drift from the proven logic. Fixpoint: re-running
// produces identical output.
import { readFileSync, writeFileSync } from 'node:fs';

let kernel = readFileSync('grow.mjs', 'utf8').replace(/^export /gm, '').replace(/<\/script/g, '<\\/script');
const shell = readFileSync('page.template.html', 'utf8');
const START = '/*__KERNEL_START__*/', END = '/*__KERNEL_END__*/';
const re = new RegExp(START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const block = START + '\n' + kernel + '\nwindow.GROW = { SIGNALS, reward, makeArm, posterior, select, update, consolidate };\n' + END;
const out = shell.replace(re, () => block);
if (out === shell && !shell.includes(START)) { console.error('REFUSED: kernel markers not found in template'); process.exit(1); }
writeFileSync('index.html', out);
console.log('inlined grow.mjs → index.html (' + kernel.length + 'b kernel, ' + out.length + 'b page)');
