// Payment receipts: numbering, the details printed on a receipt, and the PDF students download.
// The receipt is a narrow till slip (80 mm, the width of POS printer paper). Only the logo is in
// colour; everything else is black, grey and white. The same layout is drawn as a web page in
// views/receipt.ejs, so change both together.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const db = require('./db');
const { formatPhone } = require('./phone');

// The logo's own width/height (1757 × 1067) are taken out, so it is drawn at the size asked for
// below; its viewBox keeps the shape.
const LOGO_SVG = fs.readFileSync(path.join(__dirname, 'public', 'logo.svg'), 'utf8')
  .replace(/<svg([^>]*?)\s+width="[^"]*"/, '<svg$1')
  .replace(/<svg([^>]*?)\s+height="[^"]*"/, '<svg$1');

// Receipt numbers count up through each year: RA-2026-0001, RA-2026-0002, … RA-2027-0001.
function nextReceiptNo(year) {
  const prefix = `RA-${year}-`;
  const last = db.get(
    `SELECT MAX(CAST(SUBSTR(receipt_no, ?) AS INTEGER)) AS n FROM payments WHERE receipt_no LIKE ?`,
    prefix.length + 1, prefix + '%'
  ).n || 0;
  return prefix + String(last + 1).padStart(4, '0');
}

// Gives an approved payment its receipt number (once). Payments approved before receipts existed
// get theirs the first time someone opens the receipt, dated when the payment was approved.
function issueReceipt(paymentId, timeZone) {
  const p = db.get('SELECT id, status, receipt_no, reviewed_at FROM payments WHERE id = ?', paymentId);
  if (!p || p.status !== 'approved') return null;
  if (p.receipt_no) return p.receipt_no;
  const issuedAt = p.reviewed_at || new Date().toISOString();
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(new Date(issuedAt));
  const no = nextReceiptNo(year);
  db.run('UPDATE payments SET receipt_no = ?, receipt_issued_at = ? WHERE id = ? AND receipt_no IS NULL', no, issuedAt, p.id);
  return db.get('SELECT receipt_no FROM payments WHERE id = ?', p.id).receipt_no;
}

// ---------- amount in words ----------
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function under1000(n) {
  const out = [];
  if (n >= 100) { out.push(ONES[Math.floor(n / 100)] + ' hundred'); n %= 100; if (n) out.push('and'); }
  if (n >= 20) out.push(TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''));
  else if (n > 0 || !out.length) out.push(ONES[n]);
  return out.join(' ');
}
function numberToWords(n) {
  if (n === 0) return 'zero';
  const parts = [];
  for (const [size, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [1, '']]) {
    if (n >= size) {
      parts.push(under1000(Math.floor(n / size)) + (name ? ' ' + name : ''));
      n %= size;
    }
  }
  return parts.join(' ');
}
// "One thousand five hundred kwacha only". Kwacha are only named when the site's currency is the
// kwacha; for any other currency the words are left off the receipt.
function amountInWords(amount, currency) {
  if (!/^(K|ZK|ZMW|kwacha)$/i.test(String(currency).trim())) return '';
  const cents = Math.round(Number(amount) * 100);
  const kwacha = Math.floor(cents / 100);
  const ngwee = cents % 100;
  let text = `${numberToWords(kwacha)} kwacha`;
  if (ngwee) text += ` and ${numberToWords(ngwee)} ngwee`;
  text += ' only';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------- the details on a receipt ----------
function receiptData(paymentId, { currency, timeZone }) {
  const p = db.get(
    `SELECT p.*, u.name, u.phone FROM payments p JOIN users u ON u.id = p.user_id WHERE p.id = ?`, paymentId
  );
  if (!p || p.status !== 'approved' || !p.receipt_no) return null;
  const dateTime = (iso) => (iso
    ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
    : '');
  const money = (n) => `${currency} ${Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return {
    id: p.id,
    userId: p.user_id,
    no: p.receipt_no,
    issued: dateTime(p.receipt_issued_at),
    name: p.name,
    phone: p.phone ? formatPhone(p.phone) : '',
    room: p.room_id ? `Room ${p.room_id}` : '',
    method: p.method,
    submitted: dateTime(p.created_at),
    approved: dateTime(p.reviewed_at),
    description: p.room_id ? `Room rent – Room ${p.room_id}` : 'Room rent',
    period: new Date(p.period + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    amount: money(p.amount),
    words: amountInWords(p.amount, currency),
  };
}

// ---------- PDF ----------
const MM = 72 / 25.4;
const WIDTH = 80 * MM; // 80 mm POS paper
const PAD = 7 * MM;
const INK = '#222222';
const GREY = '#777777';
const LINE = '#999999';
const FOOT = [
  'Royalty Apartments',
  'This receipt was issued electronically and is valid without a physical signature. Keep it for your records.',
];

// Draws the receipt and returns how tall it came out, so the page can be cut to fit (a till slip
// is as long as its contents).
function draw(doc, r) {
  const inner = WIDTH - PAD * 2;
  let y = PAD;

  const logoW = 30 * MM;
  const logoH = logoW * 1067 / 1757;
  SVGtoPDF(doc, LOGO_SVG, (WIDTH - logoW) / 2, y, { width: logoW, height: logoH });
  y += logoH + 8;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(13);
  doc.text('R E C E I P T', PAD, y, { width: inner, align: 'center' });
  y += 17;
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  const noLabel = 'No. ';
  doc.font('Helvetica');
  const wLabel = doc.widthOfString(noLabel);
  doc.font('Helvetica-Bold');
  const wNo = doc.widthOfString(r.no);
  const startX = (WIDTH - wLabel - wNo) / 2;
  doc.font('Helvetica').text(noLabel, startX, y, { lineBreak: false });
  doc.font('Helvetica-Bold').text(r.no, startX + wLabel, y, { lineBreak: false });
  y += 12;
  doc.font('Helvetica').fillColor(GREY).text(r.issued, PAD, y, { width: inner, align: 'center' });
  y += 12;

  const sep = () => {
    y += 6;
    doc.save().moveTo(PAD, y).lineTo(WIDTH - PAD, y).lineWidth(0.6).dash(2, { space: 2 }).strokeColor(LINE).stroke().restore();
    y += 9;
  };
  const label = (text) => {
    doc.font('Helvetica').fontSize(7).fillColor(GREY).text(text.toUpperCase(), PAD, y, { width: inner, characterSpacing: 1 });
    y += 11;
  };
  // A label on the left and its value on the right; a long value wraps onto more lines.
  const row = (left, right, { bold = true, size = 9 } = {}) => {
    doc.fontSize(size).font('Helvetica').fillColor(GREY);
    if (!right) { // a line of its own, e.g. what the payment was for
      doc.text(left, PAD, y, { width: inner });
      y += doc.heightOfString(left, { width: inner }) + 3;
      return;
    }
    const leftW = Math.min(doc.widthOfString(left) + 8, inner * 0.5);
    doc.text(left, PAD, y, { width: leftW, lineBreak: false, ellipsis: true });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(INK);
    const h = doc.heightOfString(right, { width: inner - leftW, align: 'right' });
    doc.text(right, PAD + leftW, y, { width: inner - leftW, align: 'right' });
    y += Math.max(h, size + 2) + 3;
  };

  sep();
  label('Received from');
  row('Name', r.name);
  if (r.phone) row('Phone', r.phone);
  if (r.room) row('Room', r.room);

  sep();
  label('Payment details');
  row('Method', r.method);
  row('Submitted', r.submitted);
  row('Approved', r.approved);

  sep();
  row(r.description, '');
  row(r.period, r.amount);

  sep();
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('TOTAL PAID', PAD, y + 3, { lineBreak: false });
  doc.fontSize(14).text(r.amount, PAD, y, { width: inner, align: 'right' });
  y += 20;
  if (r.words) {
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#555555');
    doc.text(r.words, PAD, y, { width: inner });
    y += doc.heightOfString(r.words, { width: inner }) + 2;
  }

  sep();
  doc.font('Helvetica').fontSize(8).fillColor(GREY);
  for (const line of FOOT) {
    doc.text(line, PAD, y, { width: inner, align: 'center' });
    y += doc.heightOfString(line, { width: inner, align: 'center' }) + 1;
  }
  y += 8;
  doc.text('Thank you!', PAD, y, { width: inner, align: 'center' });
  y += 10;
  return y + PAD;
}

// Streams the receipt as a PDF into `out` (an HTTP response).
function receiptPdf(r, out) {
  // First pass on a throwaway page measures the length; the second draws on a page cut to fit.
  const probe = new PDFDocument({ size: [WIDTH, 2000], margin: 0, autoFirstPage: true });
  const height = Math.ceil(draw(probe, r));
  probe.end();

  const doc = new PDFDocument({
    size: [WIDTH, height],
    margin: 0,
    info: { Title: `Receipt ${r.no}`, Author: 'Royalty Apartments', Subject: `Payment receipt for ${r.name}` },
  });
  doc.pipe(out);
  draw(doc, r);
  doc.end();
}

module.exports = { issueReceipt, receiptData, receiptPdf, amountInWords };
