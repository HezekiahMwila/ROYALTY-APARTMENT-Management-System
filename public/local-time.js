// Greets each visitor by their own time of day, and shows today's date by their own clock.
// The server first draws the page for the boarding house's time zone (server.js, TIME_ZONE);
// this switches it to the time zone of the phone or computer the page is opened on.
//   <span data-greeting>Good morning</span>   ->  Good morning / afternoon / evening / night
//   <span data-date="long">…</span>           ->  Friday 13 November 2026
//   <span data-date="short">…</span>          ->  13 Nov
// The page stays right if it is left open: it is checked again every minute.
(function () {
  // Same hours as server.js: morning 5–11, afternoon 12–16, evening 17–20, night 21–4.
  function greetingAt(h) {
    return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : h >= 17 && h < 21 ? 'Good evening' : 'Good night';
  }
  var STYLES = {
    long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    short: { day: 'numeric', month: 'short' },
  };

  function update() {
    var now = new Date();
    var greeting = greetingAt(now.getHours());
    document.querySelectorAll('[data-greeting]').forEach(function (el) {
      if (el.textContent !== greeting) el.textContent = greeting;
    });
    document.querySelectorAll('[data-date]').forEach(function (el) {
      var style = STYLES[el.getAttribute('data-date')];
      if (!style) return;
      var text = now.toLocaleDateString('en-GB', style).replace(',', '');
      if (el.textContent !== text) el.textContent = text;
    });
    var part = greeting.replace('Good ', '');
    document.documentElement.setAttribute('data-daypart', part);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', update);
  else update();
  setInterval(update, 60 * 1000);
})();
