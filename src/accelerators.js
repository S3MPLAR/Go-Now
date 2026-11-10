const MODIFIER_ALIASES = new Map([
  ['commandorcontrol', 'CommandOrControl'],
  ['cmdorctrl', 'CommandOrControl'],
  ['command', 'Command'],
  ['cmd', 'Command'],
  ['control', 'Ctrl'],
  ['ctrl', 'Ctrl'],
  ['alt', 'Alt'],
  ['option', 'Alt'],
  ['altgr', 'AltGr'],
  ['shift', 'Shift'],
  ['super', 'Super'],
  ['meta', 'Super']
]);

const MODIFIER_ORDER = ['CommandOrControl', 'Command', 'Ctrl', 'Alt', 'AltGr', 'Shift', 'Super'];

const KEY_ALIASES = new Map([
  ['space', 'Space'],
  ['spacebar', 'Space'],
  ['tab', 'Tab'],
  ['enter', 'Enter'],
  ['return', 'Enter'],
  ['backspace', 'Backspace'],
  ['delete', 'Delete'],
  ['insert', 'Insert'],
  ['home', 'Home'],
  ['end', 'End'],
  ['pageup', 'PageUp'],
  ['pagedown', 'PageDown'],
  ['up', 'Up'],
  ['arrowup', 'Up'],
  ['down', 'Down'],
  ['arrowdown', 'Down'],
  ['left', 'Left'],
  ['arrowleft', 'Left'],
  ['right', 'Right'],
  ['arrowright', 'Right'],
  ['escape', 'Escape'],
  ['esc', 'Escape']
]);

function normalizeModifier(token) {
  return MODIFIER_ALIASES.get(token.toLowerCase()) || null;
}

function normalizeKey(token) {
  const alias = KEY_ALIASES.get(token.toLowerCase());
  if (alias) return alias;
  if (/^[a-z]$/i.test(token)) return token.toUpperCase();
  if (/^[0-9]$/.test(token)) return token;
  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(token)) return token.toUpperCase();
  return null;
}

function normalizeAccelerator(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return '';
  const parts = text.split('+');
  if (parts.some((part) => !part.trim())) return null;

  const modifiers = [];
  let key = null;
  for (const raw of parts) {
    const token = raw.trim();
    const modifier = normalizeModifier(token);
    if (modifier) {
      if (modifiers.includes(modifier)) return null;
      modifiers.push(modifier);
      continue;
    }
    if (key !== null) return null;
    key = normalizeKey(token);
    if (!key) return null;
  }

  if (!modifiers.length || !key) return null;
  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
  return `${modifiers.join('+')}+${key}`;
}

function canonicalForPlatform(value, platform) {
  const normalized = normalizeAccelerator(value);
  if (normalized === null) return null;
  if (!normalized) return '';
  const parts = normalized.split('+');
  const key = parts.pop();
  const modifiers = parts.map((part) => {
    if (part === 'CommandOrControl') return platform === 'darwin' ? 'Command' : 'Ctrl';
    if (part === 'Super') return platform === 'darwin' ? 'Command' : 'Super';
    if (part === 'Command') return 'Command';
    if (part === 'Ctrl') return 'Ctrl';
    if (part === 'Alt') return 'Alt';
    if (part === 'AltGr') return 'AltGr';
    if (part === 'Shift') return 'Shift';
    return part;
  });
  const unique = [...new Set(modifiers)];
  if (unique.length !== modifiers.length) return null;
  const order = ['Command', 'Ctrl', 'Alt', 'AltGr', 'Shift', 'Super'];
  unique.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return `${unique.join('+')}+${key}`;
}

function sameAccelerator(first, second, platform) {
  const a = canonicalForPlatform(first, platform);
  const b = canonicalForPlatform(second, platform);
  return a !== null && b !== null && a === b;
}

function displayAccelerator(value, platform) {
  const normalized = normalizeAccelerator(value);
  if (normalized === null) return value == null ? '' : String(value);
  if (!normalized) return '';
  return normalized.split('+').map((part) => {
    if (part === 'CommandOrControl') return platform === 'darwin' ? 'Cmd' : 'Ctrl';
    if (part === 'Command') return 'Cmd';
    if (part === 'Ctrl') return 'Ctrl';
    if (part === 'Alt') return platform === 'darwin' ? 'Option' : 'Alt';
    if (part === 'AltGr') return 'AltGr';
    if (part === 'Shift') return 'Shift';
    if (part === 'Super') return platform === 'darwin' ? 'Cmd' : 'Win';
    return part;
  }).join(' + ');
}

module.exports = {
  normalizeAccelerator,
  sameAccelerator,
  displayAccelerator
};
