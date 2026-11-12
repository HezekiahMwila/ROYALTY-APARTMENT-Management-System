// Sign-in pages (log in, create account): show / hide the password, the sliding pictures, and
// naming the theme button.
(function () {
  var eye = document.querySelector('[data-show-password]');
  var password = document.getElementById('password');
  if (eye && password) {
    eye.addEventListener('click', function () {
      var show = password.type === 'password';
      password.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    // Never send the form (or let the browser remember it) with the password showing.
    password.form.addEventListener('submit', function () { password.type = 'password'; });
  }

  // ----- sliding pictures beside the form -----
  // A new picture slides in every 5 seconds. It waits while the pointer or keyboard focus is on
  // the pictures, and does not move by itself if the visitor prefers less motion. On a phone the
  // pictures can also be swiped.
  var box = document.querySelector('[data-slides]');
  if (box) {
    var track = box.querySelector('.lg-track');
    var slides = [].slice.call(box.querySelectorAll('.lg-slide'));
    var dots = [].slice.call(box.querySelectorAll('[data-dot]'));
    var caption = box.querySelector('[data-caption]');
    var current = 0, timer = null;

    var show = function (n) {
      current = (n + slides.length) % slides.length;
      track.style.transform = 'translateX(' + (-100 * current) + '%)';
      slides.forEach(function (s, i) {
        if (i === current) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
      });
      dots.forEach(function (d, i) { d.classList.toggle('on', i === current); });
      if (caption) caption.textContent = slides[current].querySelector('img').alt;
    };
    var stop = function () { clearInterval(timer); timer = null; };
    var start = function () {
      if (timer || slides.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      timer = setInterval(function () { show(current + 1); }, 5000);
    };

    if (slides.length > 1) {
      box.querySelector('[data-prev]').addEventListener('click', function () { show(current - 1); });
      box.querySelector('[data-next]').addEventListener('click', function () { show(current + 1); });
      dots.forEach(function (d, i) { d.addEventListener('click', function () { show(i); }); });
      box.addEventListener('mouseenter', stop);
      box.addEventListener('mouseleave', start);
      box.addEventListener('focusin', stop);
      box.addEventListener('focusout', start);

      var startX = null;
      box.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; stop(); }, { passive: true });
      box.addEventListener('touchend', function (e) {
        var moved = e.changedTouches[0].clientX - startX;
        if (Math.abs(moved) > 40) show(current + (moved < 0 ? 1 : -1));
        startX = null;
        start();
      });
      start();
    }
  }

  // The theme button here is an icon only, so keep its spoken name in step with the theme.
  var theme = document.querySelector('.lg-theme');
  if (theme) {
    var name = function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      theme.setAttribute('aria-label', dark ? 'Light mode' : 'Dark mode');
    };
    new MutationObserver(name).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    name();
  }
})();
