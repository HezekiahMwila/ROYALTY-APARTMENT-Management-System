// Admin landing page (views/admin/dashboard.ejs): panels arrive one after another, figures
// count up, and the rooms can be filtered by kind.
// The page adds the class "anim" to <html> unless the visitor prefers less motion; without it
// nothing here hides or moves anything.
(function () {
  var anim = document.documentElement.classList.contains('anim');

  // ----- figures count up from zero -----
  function countUp(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (!anim || !(target > 0)) return;
    var start = null, length = 900;
    el.textContent = '0';
    requestAnimationFrame(function step(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / length);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    });
  }

  // ----- panels arrive in order, top to bottom -----
  [].slice.call(document.querySelectorAll('[data-in]')).forEach(function (el, i) {
    el.style.setProperty('--n', Math.min(i, 9));
    // Two frames later, so the starting position is drawn first and the move is seen.
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('in'); }); });
    setTimeout(function () { el.querySelectorAll('[data-count]').forEach(countUp); }, anim ? Math.min(i, 9) * 70 + 150 : 0);
    // Once it has arrived, let go of it, so its own hover effects work and answer straight away.
    setTimeout(function () { el.style.removeProperty('--n'); el.removeAttribute('data-in'); }, 1600);
  });

  // ----- room filter -----
  var buttons = [].slice.call(document.querySelectorAll('[data-filter]'));
  var rooms = [].slice.call(document.querySelectorAll('.ad-rooms .room'));
  var none = document.querySelector('[data-none]');
  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      var kind = button.getAttribute('data-filter'), shown = 0;
      buttons.forEach(function (b) {
        b.classList.toggle('on', b === button);
        b.setAttribute('aria-pressed', String(b === button));
      });
      rooms.forEach(function (room) {
        var show = kind === 'all' || room.getAttribute('data-status') === kind;
        room.hidden = !show;
        if (show) shown++;
      });
      if (none) none.hidden = shown > 0;
    });
  });
})();
