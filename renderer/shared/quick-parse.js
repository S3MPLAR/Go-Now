(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.quickParse = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const WEEKDAYS = [
    { day: 0, words: ['воскресенье', 'вс', 'sunday', 'sun'] },
    { day: 1, words: ['понедельник', 'пн', 'monday', 'mon'] },
    { day: 2, words: ['вторник', 'вт', 'tuesday', 'tue'] },
    { day: 3, words: ['среду', 'среда', 'ср', 'wednesday', 'wed'] },
    { day: 4, words: ['четверг', 'чт', 'thursday', 'thu'] },
    { day: 5, words: ['пятницу', 'пятница', 'пт', 'friday', 'fri'] },
    { day: 6, words: ['субботу', 'суббота', 'сб', 'saturday', 'sat'] }
  ];

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toDateString(dt) {
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }

  function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
    dt.setDate(dt.getDate() + days);
    return toDateString(dt);
  }

  function isValidDate(year, month, day) {
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const dt = new Date(year, month - 1, day, 12, 0, 0, 0);
    return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
  }

  function escapeRe(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function matchWeekday(text, now) {
    const today = toDateString(now);
    for (const entry of WEEKDAYS) {
      const alt = entry.words.map(escapeRe).join('|');
      const re = new RegExp(`(^|[\\s,;])(?:(?:в|во|on)\\s+)?(?:${alt})(?=$|[\\s,;.!?])`, 'iu');
      const match = re.exec(text);
      if (!match) continue;
      const diff = (entry.day - now.getDay() + 7) % 7;
      return { date: addDays(today, diff), match: match[0] };
    }
    return null;
  }

  function matchDate(text, now) {
    const today = toDateString(now);
    const relatives = [
      { re: /(^|[\s,;])(?:сегодня|today)(?=$|[\s,;.!?])/iu, days: 0 },
      { re: /(^|[\s,;])(?:завтра|tomorrow)(?=$|[\s,;.!?])/iu, days: 1 },
      { re: /(^|[\s,;])(?:послезавтра|day\s+after\s+tomorrow)(?=$|[\s,;.!?])/iu, days: 2 }
    ];
    for (const item of relatives) {
      const match = item.re.exec(text);
      if (match) return { date: addDays(today, item.days), match: match[0] };
    }

    let match = /(^|[\s,;])через\s+(\d{1,3})?\s*(?:день|дня|дней|day|days)(?=$|[\s,;.!?])/iu.exec(text);
    if (match) return { date: addDays(today, Number(match[2] || 1)), match: match[0] };

    match = /(^|[\s,;])через\s+(\d{1,2})?\s*(?:неделю|недели|недель|week|weeks)(?=$|[\s,;.!?])/iu.exec(text);
    if (match) return { date: addDays(today, Number(match[2] || 1) * 7), match: match[0] };

    const weekday = matchWeekday(text, now);
    if (weekday) return weekday;

    match = /(^|[\s,;])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=$|[\s,;.!?])/u.exec(text);
    if (match) {
      const day = Number(match[2]);
      const month = Number(match[3]);
      let year = match[4] ? Number(match[4]) : now.getFullYear();
      if (match[4] && match[4].length === 2) year += 2000;
      if (isValidDate(year, month, day)) {
        return { date: `${year}-${pad(month)}-${pad(day)}`, match: match[0] };
      }
    }
    return null;
  }

  function applySuffix(hour, suffix) {
    if (!suffix) return hour;
    if (suffix === 'pm' || suffix === 'вечера' || suffix === 'дня') return hour < 12 ? hour + 12 : hour;
    if (suffix === 'am' || suffix === 'утра') return hour === 12 ? 0 : hour;
    if (suffix === 'ночи') return hour === 12 ? 0 : hour;
    return hour;
  }

  function matchTime(text) {
    let match = /(^|[\s,;])(?:в|at)\s+(\d{1,2})(?::(\d{2}))?\s*(утра|дня|вечера|ночи|am|pm)?(?=$|[\s,;.!?])/iu.exec(text);
    if (match) {
      const hour = applySuffix(Number(match[2]), (match[4] || '').toLowerCase());
      const minute = match[3] ? Number(match[3]) : 0;
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return { time: `${pad(hour)}:${pad(minute)}`, match: match[0] };
      }
    }

    match = /(^|[\s,;])(\d{1,2}):(\d{2})(?=$|[\s,;.!?])/u.exec(text);
    if (match) {
      const hour = Number(match[2]);
      const minute = Number(match[3]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return { time: `${pad(hour)}:${pad(minute)}`, match: match[0] };
      }
    }

    match = /(^|[\s,;])(\d{1,2})\s*(утра|дня|вечера|ночи|am|pm)(?=$|[\s,;.!?])/iu.exec(text);
    if (match) {
      const hour = applySuffix(Number(match[2]), match[3].toLowerCase());
      if (hour >= 0 && hour <= 23) return { time: `${pad(hour)}:00`, match: match[0] };
    }
    return null;
  }

  function parseQuickAdd(raw, now, language) {
    const base = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    let text = String(raw || '');
    const result = {
      title: '',
      date: toDateString(base),
      time: null,
      tags: [],
      important: false,
      notify: true
    };

    text = text.replace(/#([\p{L}\p{N}_-]+)/gu, (match, tag) => {
      const clean = tag.slice(0, 24);
      if (result.tags.length < 5 && !result.tags.some((item) => item.toLowerCase() === clean.toLowerCase())) {
        result.tags.push(clean);
      }
      return ' ';
    });

    if (/(^|[\s,;])!!?($|[\s,;.!?])/.test(text)) {
      result.important = true;
      text = text.replace(/(^|[\s,;])!!?($|[\s,;.!?])/g, ' ');
    }

    const noDateRe = /(^|[\s,;])(?:без\s+(?:срока|даты)|no\s+(?:date|due)|undated)(?=$|[\s,;.!?])/iu;
    if (noDateRe.test(text)) {
      result.notify = false;
      result.date = null;
      text = text.replace(noDateRe, ' ');
    }

    if (result.notify) {
      const dateMatch = matchDate(text, base);
      if (dateMatch) {
        result.date = dateMatch.date;
        text = text.replace(dateMatch.match, ' ');
      }
      const timeMatch = matchTime(text);
      if (timeMatch) {
        result.time = timeMatch.time;
        text = text.replace(timeMatch.match, ' ');
      }
    }

    text = text
      .replace(/\s+/g, ' ')
      .replace(/^[\s,;:.!?\-–—]+/, '')
      .replace(/[\s,;:.!?\-–—]+$/, '')
      .trim();

    result.title = text;
    return result;
  }

  return { parseQuickAdd };
});
