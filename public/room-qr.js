// Admin room page: the room's QR card, as a picture: the blue and red stripe, the logo,
// "Room 12", the QR code and the room code. The same picture is used for both:
//   - Download: saved as Royalty-Room-12-QR.png
//   - Print: put into the page as img.qr-print, which is all that prints (style.css @media print)
// If anything here fails, Download saves the plain QR code (the button's own link) and printing
// falls back to the page's own print layout.
(function () {
  var W = 1200, H = 1560, BLUE = '#123fdc', RED = '#f20d1d', INK = '#111111', GREY = '#555555';
  var FONT = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  var MONO = 'Consolas, "Courier New", monospace';

  function load(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function centre(ctx, text, y) { ctx.fillText(text, W / 2, y); }

  async function draw(btn) {
    var room = btn.getAttribute('data-room');
    var code = btn.getAttribute('data-code');
    var qr = await load(btn.getAttribute('href'));
    var logo = await load('/logo.svg').catch(function () { return null; });

    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // brand stripe: blue and red, as on the site
    ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, 18);
    ctx.fillStyle = RED; ctx.fillRect(0, 18, W, 8);

    var y = 70;
    if (logo) {
      var lw = 330, lh = lw * (logo.naturalHeight || 1067) / (logo.naturalWidth || 1757);
      ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
      y += lh + 40;
    } else {
      ctx.fillStyle = BLUE; ctx.font = '700 64px ' + FONT; centre(ctx, 'Royalty Apartments', y + 60); y += 110;
    }

    ctx.fillStyle = INK; ctx.font = '800 110px ' + FONT;
    centre(ctx, 'Room ' + room, y + 95); y += 135;

    var qs = 820;
    ctx.imageSmoothingEnabled = false; // keep the squares sharp
    ctx.drawImage(qr, (W - qs) / 2, y, qs, qs);
    ctx.imageSmoothingEnabled = true;
    y += qs + 60;

    // the room code, large, under the QR code
    var spaced = code.split('').join(' ');
    ctx.fillStyle = GREY; ctx.font = '500 44px ' + FONT;
    var label = 'Room code: ';
    var lwid = ctx.measureText(label).width;
    ctx.font = '700 72px ' + MONO;
    var cwid = ctx.measureText(spaced).width;
    var x0 = (W - lwid - cwid) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = GREY; ctx.font = '500 44px ' + FONT; ctx.fillText(label, x0, y + 60);
    ctx.fillStyle = RED; ctx.font = '700 72px ' + MONO; ctx.fillText(spaced, x0 + lwid, y + 60);

    return canvas;
  }

  // ----- Download -----
  document.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-qr-card]');
    if (!btn) return;
    event.preventDefault();
    draw(btn)
      .then(function (canvas) { return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); }); })
      .then(function (blob) {
        if (!blob) throw new Error('no picture');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = btn.getAttribute('download');
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      })
      .catch(function () {
        // Could not draw the card: download the plain QR code instead.
        var a = document.createElement('a');
        a.href = btn.getAttribute('href');
        a.download = btn.getAttribute('download');
        a.click();
      });
  });

  // ----- Print -----
  // Draw the card as soon as the page opens, so it is ready when Print is pressed.
  var btn = document.querySelector('[data-qr-card]');
  var holder = document.querySelector('img.qr-print');
  if (btn && holder) {
    draw(btn).then(function (canvas) {
      holder.src = canvas.toDataURL('image/png');
      holder.closest('.qr-card').classList.add('print-ready');
    }).catch(function () { /* printing uses the page's own layout */ });
  }
})();
