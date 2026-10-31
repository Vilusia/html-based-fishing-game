const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('ui.js', 'utf8');
const audio = fs.readFileSync('audio.js', 'utf8');

test('rain renders as falling line streaks instead of square point sprites', () => {
  assert.match(ui, /rainSystem = new THREE\.LineSegments\(geom, material\)/);
  assert.match(ui, /const writeDrop = \(index, drop\)/);
  assert.match(ui, /positions\[o \+ 1\] = drop\.y \+ drop\.length/);
  assert.match(ui, /drop\.y -= drop\.speed \* rainDt/);
  assert.match(ui, /new THREE\.LineBasicMaterial\(/);
  assert.equal(ui.includes('rainTexture'), false);
  assert.equal(ui.includes('const velocities = [];'), false);
});

test('rain audio mixes a filtered body layer with a high-frequency hiss layer', () => {
  assert.match(audio, /RainAudio\.hissSource = audioCtx\.createBufferSource\(\)/);
  assert.match(audio, /RainAudio\.highpassNode\.type = 'highpass'/);
  assert.match(audio, /RainAudio\.highpassNode\.frequency\.value = 260/);
  assert.match(audio, /RainAudio\.filterNode\.frequency\.value = 5200/);
  assert.match(audio, /RainAudio\.hissFilterNode\.frequency\.value = 2600/);
  assert.match(audio, /RainAudio\.gainNode\.gain\.setTargetAtTime\(0\.24/);
  assert.match(audio, /RainAudio\.hissGainNode\.gain\.setTargetAtTime\(0\.055/);
  assert.equal(audio.includes('frequency.value = 800; // 800Hz is a nice soft rain sound'), false);
});
