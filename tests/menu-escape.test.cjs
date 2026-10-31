const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const ui = fs.readFileSync('ui.js', 'utf8');

test('Lucky Lou has an in-panel close button and no floating red X', () => {
  assert.match(html, /id="scratch-close"[^>]*onclick="toggleScratchShop\(\)"/);
  assert.match(html, /id="scratch-panel"[\s\S]*id="scratch-close"/);
  assert.equal(html.includes('<button class="close-x-btn" onclick="toggleScratchShop()">×</button>'), false);
});

test('Escape closes the top-most open menu and dialogs', () => {
  assert.match(ui, /function closeTopOverlay\(\)/);
  assert.match(ui, /if\(e\.code === 'Escape' && closeTopOverlay\(\)\)/);
  assert.match(ui, /'scratch-overlay': \(\) => window\.toggleScratchShop\?\.\(\)/);
  assert.match(ui, /'options-overlay': \(\) => window\.toggleOptions\?\.\(\)/);
  assert.match(ui, /'player-list-overlay': \(\) => window\.togglePlayerList\?\.\(\)/);
  assert.match(ui, /dialog\.id === 'character-studio'/);
  assert.match(ui, /dialog\.id === 'protogen-logo-editor'/);
  assert.match(ui, /closeButton\.click\(\)/);
});
