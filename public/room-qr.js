// Admin room page: the Download button saves a picture of the whole room card, ready to print
// or send: the logo, "Room 12", the QR code, the room link for phones that cannot scan, and the code.
// The button's own link (the plain QR code picture) is the fallback if anything here fails.
(function () {
  var W = 1200, H = 1700, BLUE = '#123fdc', RED = '#f20d1d', INK = '#111111', GREY = '#555555';
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

  // Largest font size (up to max) at which the text fits the width.
  function fit(ctx, text, font, max, width) {
    var size = max;
    for (; size > 18; size -= 2) {
      ctx.font = font.replace('SIZE', size);
      if (ctx.measureText(text).width <= width) break;
    }
    return size;
  }

  function centre(ctx, text, y) { ctx.fillText(text, W / 2, y); }

  async function draw(btn) {
    var room = btn.getAttribute('data-room');
    var link = btn.getAttribute('data-link');
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
    y += qs + 45;

    ctx.fillStyle = GREY; ctx.font = '500 40px ' + FONT;
    centre(ctx, 'No camera? Open this link:', y + 34); y += 70;

    var size = fit(ctx, link, '700 SIZEpx ' + MONO, 54, W - 120);
    ctx.fillStyle = BLUE; ctx.font = '700 ' + size + 'px ' + MONO;
    centre(ctx, link, y + size); y += size + 50;

    ctx.fillStyle = GREY; ctx.font = '500 36px ' + FONT;
    var label = 'Room code: ';
    var lwid = ctx.measureText(label).width;
    ctx.font = '700 44px ' + MONO;
    var cwid = ctx.measureText(code.split('').join(' ')).width;
    var x0 = (W - lwid - cwid) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = GREY; ctx.font = '500 36px ' + FONT; ctx.fillText(label, x0, y + 40);
    ctx.fillStyle = RED; ctx.font = '700 44px ' + MONO; ctx.fillText(code.split('').join(' '), x0 + lwid, y + 40);

    return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
  }

  document.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-qr-card]');
    if (!btn) return;
    event.preventDefault();
    draw(btn).then(function (blob) {
      if (!blob) throw new Error('no picture');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = btn.getAttribute('download');
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }).catch(function () {
      // Could not draw the card: download the plain QR code instead.
      var a = document.createElement('a');
      a.href = btn.getAttribute('href');
      a.download = btn.getAttribute('download');
      a.click();
    });
  });
})();
