// Node replacement for bump-pins.ps1: bumps ?v= pins in index.html/editor.html
// for scripts changed vs. HEAD (staged/unstaged/untracked .js), then rewrites
// the HTML files. Run: node bump-pins.js  (or `node bump-pins.js all`)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const mode = process.argv[2] === 'all' ? 'all' : 'changed';
const htmlFiles = ['index.html', 'editor.html'].map(f => path.join(ROOT, f)).filter(fs.existsSync);

let targets = null;
if (mode !== 'all') {
    const st = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
    targets = new Set(st.split('\n').map(l => l.replace(/^[ MADR?]*\s*/, '').trim()).filter(f => f.endsWith('.js')));
}

for (const hs of htmlFiles) {
    if (!fs.existsSync(hs)) continue;
    let html = fs.readFileSync(hs, 'utf8');
    let changed = false;
    const re = /<script src="([^"?]+\.js)\?v=([\d.]+)"><\/script>/g;
    html = html.replace(re, (m, file, ver) => {
        if (targets && !targets.has(path.basename(file))) return m;
        const parts = ver.split('.');
        const last = parts.pop();
        const nl = /^\d+$/.test(last) ? String(Number(last) + 1) : last;
        parts.push(nl);
        const nv = parts.join('.');
        console.log(path.basename(hs) + ': ' + path.basename(file) + ' -> v' + nv);
        changed = true;
        return `<script src="${file}?v=${nv}"></script>`;
    });
    if (changed) fs.writeFileSync(hs, html, 'utf8');
}
console.log('done');
