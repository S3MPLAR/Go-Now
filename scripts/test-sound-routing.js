const assert = require('node:assert');
const { normalizeTagKey, resolveTaskSound } = require('../src/sound-routing');

const customSounds = [
  { id: 'custom-a', name: 'A', file: 'custom-a.wav' },
  { id: 'custom-b', name: 'B', file: 'custom-b.wav' }
];

const settings = {
  notificationSound: 'soft',
  customSounds,
  notificationTagSounds: {
    important: 'pulse',
    'tag:звонок': 'custom-a',
    'tag:работа': 'bell'
  }
};

assert.equal(
  resolveTaskSound({ important: true, tags: ['звонок'] }, settings),
  'pulse',
  'important binding wins'
);
assert.equal(
  resolveTaskSound({ important: false, tags: ['Работа', 'звонок'] }, settings),
  'bell',
  'first matching task tag wins'
);
assert.equal(
  resolveTaskSound({ tags: ['звонок'] }, settings),
  'custom-a',
  'custom sound binding works'
);
assert.equal(
  resolveTaskSound({ tags: ['неизвестный'] }, settings),
  'soft',
  'general sound fallback'
);
assert.equal(
  resolveTaskSound({ important: true, tags: ['звонок'] }, { ...settings, notificationTagSounds: { 'tag:звонок': 'click' } }),
  'click',
  'missing important binding falls through to tag'
);
assert.equal(
  resolveTaskSound({ tags: ['звонок'] }, { ...settings, notificationTagSounds: { 'tag:звонок': 'missing' } }),
  'soft',
  'missing bound sound falls back'
);
assert.equal(
  resolveTaskSound({}, { notificationSound: 'gone', customSounds: [], notificationTagSounds: {} }),
  'soft',
  'invalid general sound falls back to soft'
);
assert.equal(
  resolveTaskSound({ important: true, tags: ['звонок'] }, settings, new Set(['soft', 'click'])),
  'soft',
  'unavailable bindings fall through to general'
);
assert.equal(normalizeTagKey('  Работа  '), 'tag:работа', 'tag key is normalized');
assert.equal(normalizeTagKey('   '), null, 'empty tag has no key');

console.log('sound routing tests OK');
