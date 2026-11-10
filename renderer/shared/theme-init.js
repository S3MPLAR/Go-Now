(() => {
  try {
    const theme = new URLSearchParams(window.location.search).get('theme');
    if (theme) document.documentElement.dataset.theme = theme;
  } catch (err) {
    // ignore
  }
})();
