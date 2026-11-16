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

let currentTask = null;
let acting = false;
let soundToken = 0;

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
  soundToken += 1;
  if (window.ppSound) window.ppSound.stop();
  animateOut(async () => {
    try {
      await api.reminderAction(action);
    } catch (err) {
      console.error('[reminder] action failed:', err.message);
      acting = false;
      if (card) {
        card.classList.remove('leaving');
        animateIn();
      }
    }
  });
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

function render(task, show = false) {
  if (!task) return;
  currentTask = task;
  if (show) {
    acting = false;
  }
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
}

async function playNotificationSound(task) {
  const current = ++soundToken;
  let volume = 0.8;
  try {
    const info = await api.getSound();
    const id = task && task.soundId ? task.soundId : (info && info.value ? info.value : 'soft');
    volume = info && Number.isFinite(Number(info.volume)) ? Number(info.volume) / 100 : 0.8;
    const custom = info && Array.isArray(info.custom) && info.custom.some((item) => item.id === id);
    let dataUrl = null;
    if (custom) {
      const data = await api.getSoundData(id);
      if (data && data.dataUrl) dataUrl = data.dataUrl;
    }
    if (current !== soundToken || acting) return;
    await window.ppSound.play(id, dataUrl, volume);
  } catch (err) {
    console.error('[reminder] sound failed:', err.message);
    if (current !== soundToken || acting) return;
    try {
      await window.ppSound.play('soft', null, volume);
    } catch (fallbackErr) {
      // ignore
    }
  }
}

document.getElementById('btnDone').addEventListener('click', () => act('done'));
document.getElementById('btnSnooze').addEventListener('click', () => act('snooze'));

api.onReminderShow((task) => {
  if (!task) return;
  render(task, true);
  playNotificationSound(task);
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
