const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('ui.js', 'utf8');
const core = fs.readFileSync('core.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

test('retro display settings default on and persist explicit choices', () => {
  assert.match(core, /retroShader: true/);
  assert.match(core, /retroShaderDefaultRevision: 1/);
  assert.match(core, /retroPixelSize: 3/);
  assert.match(ui, /Number\(d\.retroShaderDefaultRevision\) >= 1/);
  assert.match(ui, /saveState\.retroShaderDefaultRevision = 1/);
  assert.match(ui, /RETRO_PIXEL_SIZES\.includes\(savedRetroPixelSize\)/);
  assert.match(ui, /window\.toggleRetroShader=function\(\)/);
  assert.match(ui, /window\.changeRetroPixelSize=function\(value\)/);
});

test('retro pipeline renders at low resolution with nearest sampling and a full-screen shader pass', () => {
  assert.match(ui, /new THREE\.WebGLRenderTarget\(1, 1,/);
  assert.match(ui, /minFilter: THREE\.NearestFilter/);
  assert.match(ui, /magFilter: THREE\.NearestFilter/);
  assert.match(ui, /target\.texture\.generateMipmaps = false/);
  assert.match(ui, /uniforms:[\s\S]*tDiffuse:[\s\S]*uResolution:[\s\S]*uTime:/);
  assert.match(ui, /blending: THREE\.NoBlending/);
  assert.match(ui, /gl_FragColor = vec4\(clamp\(color, 0\.0, 1\.0\), texel\.a\)/);
  assert.match(ui, /Math\.floor\(window\.innerWidth \/ scale\)/);
  assert.match(ui, /Math\.floor\(window\.innerHeight \/ scale\)/);
});

test('post processing preserves depth punching and scene performance stats', () => {
  const start = ui.indexOf('function renderGameView');
  const body = ui.slice(start, ui.indexOf('// --- THREE.JS SCENE SETUP ---', start));
  assert.ok(start >= 0 && body.length > 0);
  const sceneRender = body.indexOf('renderer.render(viewScene, viewCamera)');
  const perfCapture = body.indexOf('GamePerformance.captureRender(renderer.info)');
  const punch = body.indexOf('window.punchScreens');
  const screenPass = body.indexOf('renderer.render(pipeline.quadScene, pipeline.quadCamera)');
  assert.ok(perfCapture > sceneRender, 'scene draw is captured after rendering');
  assert.ok(punch > perfCapture, 'screen punch runs before the upscale pass');
  assert.ok(screenPass > punch, 'the upscale pass runs after screen punching');
  assert.match(body, /renderer\.setRenderTarget\(pipeline\.target\)/);
  assert.match(body, /renderer\.setRenderTarget\(null\)/);
  assert.match(body, /finally \{/);
});

test('display settings expose a retro toggle and 2x/3x/4x pixel sizes', () => {
  assert.match(index, /id="btn-retro-shader"/);
  assert.match(index, /onclick="toggleRetroShader\(\)"/);
  assert.match(index, /id="retro-pixel-size"/);
  for (const size of [2, 3, 4]) {
    assert.match(index, new RegExp(`<option value="${size}"`));
  }
  assert.match(index, /onchange="changeRetroPixelSize\(this\.value\)"/);
  assert.match(ui, /retroButton\.textContent='Retro shader: '/);
  assert.match(ui, /pixelSize\.disabled=!saveState\.retroShader/);
});
