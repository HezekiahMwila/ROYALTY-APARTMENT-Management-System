// Admin room page: the Download button saves the room's QR code as a picture laid out exactly like
// the printed page: "Room 12 QR code" at the top, the QR code, "Room 12", and "Code: ABC234",
// in black on white. (The printed layout is the @media print part of style.css.)
// The button's own link (the plain QR code picture) is the fallback if anything here fails.
(function () {
  // The printed page, scaled up 2.5 times so the picture prints sharply.
  var S = 2.5;
  var W = 1000, H = 1380, INK = '#000000';
  var FONT = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  var MONO = 'Consolas, "Courier New", monospace'; // the code's letters, as on the printed page

  function load(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  // Text centred on the page, with optional space between the letters (as the printed code has).
  function centred(ctx, parts, y) {
    var widths = parts.map(function (p) {
      ctx.font = p.font;
      var gap = p.spacing || 0;
      return p.text.split('').reduce(function (w, ch) { return w + ctx.measureText(ch).width + gap; }, 0) - gap;
    });
    var x = (W - widths.reduce(function (a, b) { return a + b; }, 0)) / 2;
    ctx.textAlign = 'left';
    parts.forEach(function (p, i) {
      ctx.font = p.font;
      ctx.fillStyle = INK;
      var gap = p.spacing || 0, cx = x;
      p.text.split('').forEach(function (ch) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + gap; });
      x += widths[i];
    });
  }

  async function draw(btn) {
    var room = btn.getAttribute('data-room');
    var code = btn.getAttribute('data-code');
    var qr = await load(btn.getAttribute('href'));

    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';

    // "Room 12 QR code", small, at the top
    centred(ctx, [{ text: 'Room ' + room + ' QR code', font: '600 ' + Math.round(16 * S) + 'px ' + FONT }], 34 * S);

    // the QR code (360px on the printed page), with its own white border
    var qs = 360 * S, qy = 52 * S;
    ctx.imageSmoothingEnabled = false; // keep the squares sharp
    ctx.drawImage(qr, (W - qs) / 2, qy, qs, qs);
    ctx.imageSmoothingEnabled = true;

    // "Room 12", large and bold
    centred(ctx, [{ text: 'Room ' + room, font: '700 ' + Math.round(38 * S) + 'px ' + FONT }], qy + qs + 54 * S);

    // "Code: ABC234": the label plain, the code bold with its letters spaced out
    centred(ctx, [
      { text: 'Code: ', font: '400 ' + Math.round(22 * S) + 'px ' + FONT },
      { text: code, font: '700 ' + Math.round(32 * S) + 'px ' + MONO, spacing: 0.18 * 32 * S },
    ], qy + qs + 104 * S);

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
