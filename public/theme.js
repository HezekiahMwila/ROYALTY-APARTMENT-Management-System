// Light / dark theme switch.
// The choice is remembered on this device. When switching, the new theme spreads out in a
// circle from the switch; browsers without that feature cross-fade the colours instead.
(function () {
  var root = document.documentElement;
  var isDark = function () { return root.getAttribute('data-theme') === 'dark'; };

  function sync() {
    var dark = isDark();
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(dark));
      var label = btn.querySelector('.tt-label');
      // Like a light switch, the label names the mode you will get by pressing it.
      if (label) label.textContent = dark ? 'Light mode' : 'Dark mode';
    });
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (e) { /* private browsing: not remembered */ }
    sync();
  }

  document.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var next = isDark() ? 'light' : 'dark';
    var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (calm) { apply(next); return; }

    if (!document.startViewTransition) {
      root.classList.add('theme-fade');
      apply(next);
      setTimeout(function () { root.classList.remove('theme-fade'); }, 500);
      return;
    }

    var box = btn.getBoundingClientRect();
    var x = box.left + box.width / 2;
    var y = box.top + box.height / 2;
    var radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    var transition = document.startViewTransition(function () { apply(next); });
    transition.ready.then(function () {
      root.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 650, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(function () { /* transition skipped: the theme has still changed */ });
  });

  sync();
})();
