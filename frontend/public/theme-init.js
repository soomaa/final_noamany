(function () {
  try {
    var theme = localStorage.getItem('one80_theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (theme === 'dark' || (!theme && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
    var locale = localStorage.getItem('one80_locale');
    document.documentElement.setAttribute('lang', locale === 'en' ? 'en' : 'ar');
    document.documentElement.setAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
  } catch (_) {
    // The application providers apply the same preferences after React starts.
  }
})();
