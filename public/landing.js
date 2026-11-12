// Landing page (views/home.ejs): the background pictures, headings that arrive word by word,
// sections that come in as they are reached, and figures that count up.
// The page adds the class "anim" to <html> unless the visitor prefers less motion; without it
// nothing here hides or moves anything.
(function () {
  var root = document.documentElement;
  var anim = root.classList.contains('anim');

  // ----- background pictures: a new one fades in every 6 seconds -----
  var slides = [].slice.call(document.querySelectorAll('.backdrop .slide'));
  if (anim && slides.length > 1) {
    var current = 0;
    setInterval(function () {
      slides[current].classList.remove('on');
      current = (current + 1) % slides.length;
      slides[current].classList.add('on');
    }, 6000);
  }

  // ----- headings: wrap each word so it can arrive on its own -----
  // Screen readers are given the whole heading once, not word by word.
  document.querySelectorAll('[data-words]').forEach(function (heading) {
    var text = heading.textContent.trim();
    heading.setAttribute('aria-label', text);
    heading.textContent = '';
    text.split(/\s+/).forEach(function (word, i) {
      var span = document.createElement('span');
      span.className = 'ld-word';
      span.setAttribute('aria-hidden', 'true');
      span.style.setProperty('--i', i);
      span.textContent = word;
      heading.appendChild(span);
      heading.appendChild(document.createTextNode(' '));
    });
  });

  // ----- figures count up from zero when they appear -----
  function countUp(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (!anim || !(target > 0)) return;
    var start = null, length = 1100;
    el.textContent = '0';
    requestAnimationFrame(function step(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / length);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    });
  }

  // ----- bring things in as they are reached -----
  function arrive(el) {
    el.classList.add('in');
    el.querySelectorAll('[data-count]').forEach(countUp);
  }
  function watch() {
    var items = [].slice.call(document.querySelectorAll('[data-reveal], [data-words]'));
    if (!anim || !('IntersectionObserver' in window)) { items.forEach(function (el) { el.classList.add('in'); }); return; }
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        arrive(entry.target);
        seen.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(function (el) { seen.observe(el); });
  }

  // The logo opening plays once per visit to the site; the welcome waits for it to lift.
  var opening = anim && !root.classList.contains('opened');
  if (opening) {
    try { sessionStorage.setItem('opened', '1'); } catch (e) { /* private browsing: plays again next time */ }
    setTimeout(watch, 2500);
    setTimeout(function () { var splash = document.querySelector('.ld-splash'); if (splash) splash.remove(); }, 3400);
  } else {
    watch();
  }
})();
