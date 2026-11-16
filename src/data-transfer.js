const APP_NAME = 'Go, Now!';
const EXPORT_VERSION = 1;
const SCHEMA_VERSION = 3;

function buildExport(tasks, meta = {}) {
  return {
    app: APP_NAME,
    version: EXPORT_VERSION,
    schemaVersion: Number.isFinite(meta.schemaVersion) ? meta.schemaVersion : SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tasks: Array.isArray(tasks) ? tasks : []
  };
}

function parseImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ''));
  } catch (err) {
    throw new Error('invalid json');
  }
  const tasks = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.tasks) ? parsed.tasks : null;
  if (!tasks) throw new Error('invalid file');
  const usable = tasks.filter((task) => task && typeof task === 'object' && String(task.title || '').trim());
  if (!usable.length) throw new Error('no valid tasks');
  return {
    tasks: usable,
    skipped: tasks.length - usable.length,
    meta: {
      app: parsed && typeof parsed === 'object' ? parsed.app : undefined,
      version: parsed && typeof parsed === 'object' ? parsed.version : undefined,
      schemaVersion: parsed && typeof parsed === 'object' ? parsed.schemaVersion : undefined,
      exportedAt: parsed && typeof parsed === 'object' ? parsed.exportedAt : undefined
    }
  };
}

module.exports = { APP_NAME, EXPORT_VERSION, SCHEMA_VERSION, buildExport, parseImport };
