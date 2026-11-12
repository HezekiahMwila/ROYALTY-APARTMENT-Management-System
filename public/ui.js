// Small page behaviours: the drop-down menu, and the "busy" state on buttons.
(function () {
  // ----- menu -----
  var menu = document.querySelector('details.menu');
  if (menu) {
    // Close when clicking anywhere outside it, or pressing Escape.
    document.addEventListener('click', function (event) {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menu.open) {
        menu.open = false;
        menu.querySelector('summary').focus();
      }
    });
  }

  // ----- busy buttons -----
  // When a form is sent, the button that sent it shows a spinner and cannot be pressed again,
  // so a slow connection never causes a payment or report to be submitted twice.
  document.addEventListener('submit', function (event) {
    // A form whose confirmation question was answered "Cancel" is not being sent.
    if (event.defaultPrevented) return;
    var button = event.submitter || event.target.querySelector('button[type="submit"], button:not([type])');
    if (!button) return;
    button.classList.add('is-busy');
    button.setAttribute('aria-busy', 'true');
    // Disable on the next tick: the browser has already collected the form's values by then,
    // including the name and value of the button that was pressed.
    setTimeout(function () { button.disabled = true; }, 0);
  });

  // Coming back with the browser's Back button restores the page as it was left,
  // so clear any spinner that was showing.
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return; // an ordinary page load: nothing to reset
    document.querySelectorAll('.is-busy').forEach(function (button) {
      button.classList.remove('is-busy');
      button.removeAttribute('aria-busy');
      button.disabled = false;
    });
    if (menu) menu.open = false;
  });
})();
