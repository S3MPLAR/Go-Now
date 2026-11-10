const assert = require('node:assert/strict');
const { normalizeAccelerator, sameAccelerator, displayAccelerator } = require('../src/accelerators');

assert.equal(normalizeAccelerator('shift+alt+q'), 'Alt+Shift+Q');
assert.equal(normalizeAccelerator('CommandOrControl+Alt+Space'), 'CommandOrControl+Alt+Space');
assert.equal(normalizeAccelerator('control+shift+f24'), 'Ctrl+Shift+F24');
assert.equal(normalizeAccelerator(''), '');
assert.equal(normalizeAccelerator('Ctrl+Ctrl+G'), null);
assert.equal(normalizeAccelerator('Ctrl+Shift'), null);
assert.equal(normalizeAccelerator('G'), null);
assert.equal(normalizeAccelerator('Ctrl+Shift+F25'), null);
assert.equal(normalizeAccelerator('Ctrl+Alt+'), null);

assert.equal(sameAccelerator('CommandOrControl+Alt+Space', 'Ctrl+Alt+Space', 'win32'), true);
assert.equal(sameAccelerator('CommandOrControl+Alt+Space', 'Ctrl+Alt+Space', 'darwin'), false);
assert.equal(sameAccelerator('Super+Space', 'Command+Space', 'darwin'), true);
assert.equal(sameAccelerator('Alt+Shift+Q', 'Shift+Alt+Q', 'win32'), true);
assert.equal(sameAccelerator('', 'Ctrl+Alt+Space', 'win32'), false);

assert.equal(displayAccelerator('CommandOrControl+Alt+Space', 'win32'), 'Ctrl + Alt + Space');
assert.equal(displayAccelerator('CommandOrControl+Alt+Space', 'darwin'), 'Cmd + Option + Space');
assert.equal(displayAccelerator('Alt+Shift+Q', 'win32'), 'Alt + Shift + Q');
assert.equal(displayAccelerator('', 'win32'), '');

console.log('accelerator tests OK');
