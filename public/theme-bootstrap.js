(() => {
  try {
    const cached = localStorage.getItem('macnotes.theme');
    const dark =
      cached === 'dark' ||
      (cached !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();
