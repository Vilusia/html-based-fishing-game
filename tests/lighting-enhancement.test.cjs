const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('ui.js', 'utf8');
const fish = fs.readFileSync('fish.js', 'utf8');

test('world uses filmic tone mapping with a warm hemisphere and cool fill', () => {
  assert.match(ui, /renderer\.toneMapping = THREE\.ACESFilmicToneMapping/);
  assert.match(ui, /renderer\.toneMappingExposure = 1\.12/);
  assert.match(fish, /let hemiLight = null, fillLight = null/);
  assert.match(ui, /hemiLight = new THREE\.HemisphereLight\(0xFFF0CF, 0x2A3138, 0\.44\)/);
  assert.match(ui, /fillLight = new THREE\.DirectionalLight\(0xB7DCFF, 0\.23\)/);
  assert.match(ui, /fillLight\.castShadow = false/);
  assert.match(ui, /sunLight\.shadow\.normalBias = 0\.02/);
});

test('day cycle drives sun, moon, hemisphere and fill independently of the shader', () => {
  assert.match(ui, /function applyWorldLights\(/);
  assert.match(ui, /hemiLight\.intensity = hemiIntensity/);
  assert.match(ui, /fillLight\.intensity = fillIntensity/);
  assert.match(ui, /LIGHT_SUN_DAY/);
  assert.match(ui, /LIGHT_SUN_GOLD/);
  assert.match(ui, /LIGHT_MOON/);
  assert.match(ui, /LIGHT_HEMI_NIGHT_SKY/);
  assert.match(ui, /sunIntensity = 0\.32/);
  assert.match(ui, /sunIntensity = 1\.05/);
});

test('rain, lava and void keep explicit balanced lighting', () => {
  assert.match(ui, /sunIntensity \*= 0\.58/);
  assert.match(ui, /hemiIntensity \*= 0\.78/);
  assert.match(ui, /fillIntensity \*= 0\.68/);
  assert.match(ui, /applyWorldLights\(_lightSun, 1\.2, _lightHemiSky, _lightHemiGround, 0\.34, _lightFill, 0\.28\)/);
  assert.match(ui, /applyWorldLights\(_lightSun, 0\.52, _lightHemiSky, _lightHemiGround, 0\.26, _lightFill, 0\.18\)/);
});
