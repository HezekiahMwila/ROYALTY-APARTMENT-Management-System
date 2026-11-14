// Zambian mobile numbers.
//
// A Zambian mobile number is 10 digits written locally: 0, then 7 or 9, then 8 more digits
// (097 / 077 Airtel, 096 / 076 MTN, 095 / 075 Zamtel, and any newer 07x / 09x prefixes).
// Internationally it is +260 followed by the same number without its first 0.
//
// Students log in with their number, so every number is saved in one standard form, the local
// 10 digits ("0971234567"), whichever way it was typed:
//   0971234567   097 123 4567   097-123-4567   971234567   +260971234567   260 97 123 4567
// That way logging in works however the student types it, and one number cannot be registered
// twice in two different forms.

const ZAMBIAN_MOBILE = /^0[79]\d{8}$/;

// The standard form of a number, or '' when it is not a Zambian mobile number.
function normalizePhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00260')) digits = digits.slice(5);      // 00260 97 …  (international prefix)
  else if (digits.startsWith('260')) digits = digits.slice(3);   // 260 97 … / +260 97 …
  if (digits.length === 9) digits = '0' + digits;                // 97 123 4567 (no leading 0)
  return ZAMBIAN_MOBILE.test(digits) ? digits : '';
}

// "097 123 4567": how numbers are shown.
const formatPhone = (p) => (ZAMBIAN_MOBILE.test(p || '') ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : p || '');

// "+260971234567": for Call and Text links, which work from any phone, in or outside Zambia.
const dialPhone = (p) => (ZAMBIAN_MOBILE.test(p || '') ? `+260${p.slice(1)}` : String(p || '').replace(/[^\d+]/g, ''));

const PHONE_HINT = 'a Zambian mobile number, like 097 123 4567';

module.exports = { normalizePhone, formatPhone, dialPhone, ZAMBIAN_MOBILE, PHONE_HINT };
