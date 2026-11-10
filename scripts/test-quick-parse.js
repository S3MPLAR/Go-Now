const assert = require('node:assert');
const { parseQuickAdd } = require('../renderer/shared/quick-parse');

const now = new Date(2026, 10, 9, 12, 0, 0, 0);

function check(input, expected) {
  const result = parseQuickAdd(input, now, 'ru');
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(result[key], value, `${input} -> ${key}`);
  }
  return result;
}

check('Позвонить маме', { title: 'Позвонить маме', date: '2026-11-09', time: null });
check('завтра 15:00 позвонить маме', { title: 'позвонить маме', date: '2026-11-10', time: '15:00' });
check('в понедельник в 9 утра зарядка', { title: 'зарядка', date: '2026-11-09', time: '09:00' });
check('в среду в 18:30 встреча', { title: 'встреча', date: '2026-11-11', time: '18:30' });
check('послезавтра #работа ! сдать отчёт', { title: 'сдать отчёт', date: '2026-11-11', important: true, tags: ['работа'] });
check('через 3 дня в 18:30 встреча', { title: 'встреча', date: '2026-11-12', time: '18:30' });
check('через неделю план', { title: 'план', date: '2026-11-16' });
check('15.12 10:00 dentist', { title: 'dentist', date: '2026-12-15', time: '10:00' });
check('15.12.2027 dentist', { date: '2027-12-15' });
check('15/11 dentist', { date: '2026-11-15' });
check('в 9 вечера фильм', { title: 'фильм', time: '21:00' });
check('3 pm call', { title: 'call', time: '15:00' });
check('12 am сон', { title: 'сон', time: '00:00' });
check('в 12 ночи сон', { title: 'сон', time: '00:00' });
check('no date купить хлеб', { title: 'купить хлеб', notify: false, date: null, time: null });
check('без срока позвонить', { title: 'позвонить', notify: false, date: null });
check('купить #дом #работа #дом', { title: 'купить', tags: ['дом', 'работа'] });
check('!! срочно', { title: 'срочно', important: true });
check('завтра', { title: '', date: '2026-11-10' });
check('', { title: '' });

console.log('quick-parse tests OK');
