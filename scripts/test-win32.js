const assert = require('node:assert');
const { isPinnedToDesktopNative, findDesktopTarget } = require('../src/win32');

assert.equal(isPinnedToDesktopNative(0n), false, 'zero handle is not pinned');
if (process.platform === 'win32') {
  assert.equal(typeof findDesktopTarget(), 'bigint', 'desktop target is a handle');
}
console.log('win32 tests OK');
