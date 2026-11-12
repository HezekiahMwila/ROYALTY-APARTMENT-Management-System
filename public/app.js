// Turns the website into an installable app: registers the service worker (sw.js) and shows an
// "Install app" button wherever a page has one ([data-install]), only when installing is possible.
// iPhones and iPads have no install button in the browser, so they get short instructions instead.
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* app features unavailable, site still works */ });
    });
  }

  var installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (installed) document.documentElement.classList.add('is-app');

  var prompt = null;
  var buttons = function () { return [].slice.call(document.querySelectorAll('[data-install]')); };
  var show = function (on) { buttons().forEach(function (b) { b.hidden = !on; }); };

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault(); // use our own button instead of the browser's banner
    prompt = event;
    show(true);
  });

  window.addEventListener('appinstalled', function () {
    prompt = null;
    show(false);
  });

  document.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-install]');
    if (!btn) return;
    if (prompt) {
      prompt.prompt();
      prompt.userChoice.finally(function () { prompt = null; show(false); });
    } else if (btn.hasAttribute('data-ios')) {
      alert('To install Royalty Apartments:\n\n1. Tap the Share button (the square with an arrow) at the bottom of Safari.\n2. Choose "Add to Home Screen".\n3. Tap "Add".');
    }
  });

  // iPhone / iPad in Safari, not yet installed: offer the instructions.
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !installed) {
    document.addEventListener('DOMContentLoaded', function () {
      buttons().forEach(function (b) { b.setAttribute('data-ios', ''); b.hidden = false; });
    });
  }
})();
