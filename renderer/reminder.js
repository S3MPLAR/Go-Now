(() => {
const api = window.api;
const t = (key, params) => window.i18n.t(key, params);

const rmTitle = document.getElementById('rmTitle');
const rmTime = document.getElementById('rmTime');
const rmBody = document.getElementById('rmBody');
const rmLinkRow = document.getElementById('rmLinkRow');
const rmLinkBtn = document.getElementById('rmLinkBtn');
const card = document.querySelector('.reminder-card');

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

let currentId = null;
let currentTask = null;
let autoTimer = null;
let acting = false;

function animateIn() {
  if (!card) return;
  card.classList.remove('leaving');
  card.classList.remove('entering');
  void card.offsetWidth;
  card.classList.add('entering');
}

function animateOut(callback) {
  if (!card) {
    callback();
    return;
  }
  card.classList.remove('entering');
  void card.offsetWidth;
  card.classList.add('leaving');
  setTimeout(callback, 170);
}

function act(action) {
  if (acting) return;
  acting = true;
  clearTimeout(autoTimer);
  animateOut(() => api.reminderAction(action));
}

function stripTrailing(url) {
  return url.replace(/[.,;:!?)\]]+$/, '');
}

function firstUrl(text) {
  if (!text) return null;
  const match = String(text).match(URL_PATTERN);
  return match && match.length ? stripTrailing(match[0]) : null;
}

function appendTextWithLinks(element, text) {
  element.replaceChildren();
  if (!text) return;
  const re = new RegExp(URL_PATTERN.source, 'gi');
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const url = stripTrailing(raw);
    if (match.index > lastIndex) {
      element.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'rm-link';
    link.textContent = url;
    link.title = t('reminder.linkTitle');
    link.addEventListener('click', (event) => {
      event.preventDefault();
      api.openLink(url);
    });
    element.appendChild(link);
    const tail = raw.slice(url.length);
    if (tail) element.appendChild(document.createTextNode(tail));
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) {
    element.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function formatWhen(task) {
  const [y, m, d] = task.date.split('-');
  const time = task.time ? t('reminder.at', { time: task.time }) : t('reminder.allDay');
  return `${d}.${m}.${y} · ${time}`;
}

function render(task) {
  if (!task || task.id === currentId) return;
  currentId = task.id;
  currentTask = task;
  acting = false;
  rmTitle.textContent = task.title;
  rmTime.textContent = formatWhen(task);

  const note = task.note || '';
  if (note) {
    rmBody.hidden = false;
    appendTextWithLinks(rmBody, note);
  } else {
    rmBody.hidden = true;
    rmBody.replaceChildren();
  }

  const url = firstUrl(note) || firstUrl(task.title);
  if (url) {
    rmLinkRow.hidden = false;
    rmLinkBtn.textContent = url;
    rmLinkBtn.onclick = () => api.openLink(url);
  } else {
    rmLinkRow.hidden = true;
    rmLinkBtn.onclick = null;
    rmLinkBtn.textContent = '';
  }

  playSoftChime();
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => act('snooze'), 60000);
}

function playSoftChime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.05, now + 0.035);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    master.connect(ctx.destination);
    const partials = [
      { freq: 659.25, gain: 0.75 },
      { freq: 987.77, gain: 0.18 },
      { freq: 1318.51, gain: 0.05 }
    ];
    for (const partial of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = partial.freq;
      gain.gain.value = partial.gain;
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 1.05);
    }
    setTimeout(() => ctx.close(), 1300);
  } catch (err) {
    console.error('[reminder] audio failed:', err.message);
  }
}

document.getElementById('btnDone').addEventListener('click', () => act('done'));
document.getElementById('btnSnooze').addEventListener('click', () => act('snooze'));

api.onReminderShow((task) => {
  render(task);
  animateIn();
});
api.reminderCurrent().then((task) => {
  if (task) render(task);
});
api.getTheme().then((theme) => {
  document.documentElement.dataset.theme = theme || 'peach';
});
api.onThemeChanged((theme) => {
  document.documentElement.dataset.theme = theme;
});
window.i18n.onLanguageChange(() => {
  if (!currentTask) return;
  rmTime.textContent = formatWhen(currentTask);
  rmLinkBtn.title = t('reminder.linkTitle');
  rmBody.querySelectorAll('.rm-link').forEach((link) => {
    link.title = t('reminder.linkTitle');
  });
});
})();
