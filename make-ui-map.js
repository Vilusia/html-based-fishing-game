const fs = require('fs');
const lines = fs.readFileSync('ui.js', 'utf8').split('\n');
const NAME = '([A-Za-z_$][\\w$]*)';
const decl = new RegExp('^(?:async\\s+)?(?:function\\*?\\s+' + NAME + '|class\\s+' + NAME +
  '|(?:const|let|var)\\s+' + NAME + '\\b)');
const banner = /^\/\/\s*[=\-#*]{3,}\s*(.+?)\s*[=\-#*]*\s*$/;

const out = ['# UI_MAP.md', '',
  'Top-level declarations in ui.js as name:line, grouped by comment headers. Rerun after big edits.', ''];
let row = [];
const flush = () => { if (row.length) { out.push(row.join(', ')); row = []; } };

lines.forEach((l, i) => {
  if (l.length > 2000) return;
  const b = banner.exec(l);
  if (b && /\w/.test(b[1])) { flush(); out.push('', `### ${b[1]} (line ${i + 1})`); return; }
  const m = decl.exec(l);
  if (m) {
    row.push(`${m[1] || m[2] || m[3]}:${i + 1}`);
    if (row.length >= 8) flush();
  }
});
flush();
fs.writeFileSync('UI_MAP.md', out.join('\n'));
console.log('Wrote UI_MAP.md');