const assert = require('node:assert');
const { buildExport, parseImport, EXPORT_VERSION, SCHEMA_VERSION } = require('../src/data-transfer');

const tasks = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
const exported = buildExport(tasks, { schemaVersion: 3 });
assert.equal(exported.app, 'Go, Now!');
assert.equal(exported.version, EXPORT_VERSION);
assert.equal(exported.schemaVersion, SCHEMA_VERSION);
assert.deepEqual(exported.tasks, tasks);
assert(exported.exportedAt, 'export has timestamp');

const parsedObject = parseImport(JSON.stringify(exported));
assert.deepEqual(parsedObject.tasks, tasks);
assert.equal(parsedObject.skipped, 0);
assert.equal(parsedObject.meta.app, 'Go, Now!');
assert.equal(parsedObject.meta.schemaVersion, SCHEMA_VERSION);

const parsedArray = parseImport(JSON.stringify([{ title: 'X' }, { title: '' }, null, { note: 'no title' }]));
assert.equal(parsedArray.tasks.length, 1);
assert.equal(parsedArray.skipped, 3);

assert.throws(() => parseImport('{ broken'), /invalid json/);
assert.throws(() => parseImport(JSON.stringify({ app: 'x' })), /invalid file/);
assert.throws(() => parseImport(JSON.stringify({ tasks: [] })), /no valid tasks/);
assert.throws(() => parseImport(JSON.stringify({ tasks: [{ note: 'x' }] })), /no valid tasks/);

console.log('data-transfer tests OK');
