const COUNTRY_SEGMENTS = new Set(
  [
    'united states',
    'united states of america',
    'usa',
    'us',
    'u.s.',
    'u.s.a.',
    'ukraine',
    'україна',
    'ukraina',
    'russia',
    'россия',
    'росія',
    'united kingdom',
    'great britain',
    'uk',
    'canada',
    'poland',
    'polska',
    'germany',
    'deutschland',
  ].map((value) => value.toLowerCase()),
);

const US_STATE_NAMES = new Set(
  [
    'alabama',
    'alaska',
    'arizona',
    'arkansas',
    'california',
    'colorado',
    'connecticut',
    'delaware',
    'florida',
    'georgia',
    'hawaii',
    'idaho',
    'illinois',
    'indiana',
    'iowa',
    'kansas',
    'kentucky',
    'louisiana',
    'maine',
    'maryland',
    'massachusetts',
    'michigan',
    'minnesota',
    'mississippi',
    'missouri',
    'montana',
    'nebraska',
    'nevada',
    'new hampshire',
    'new jersey',
    'new mexico',
    'new york',
    'north carolina',
    'north dakota',
    'ohio',
    'oklahoma',
    'oregon',
    'pennsylvania',
    'rhode island',
    'south carolina',
    'south dakota',
    'tennessee',
    'texas',
    'utah',
    'vermont',
    'virginia',
    'washington',
    'west virginia',
    'wisconsin',
    'wyoming',
    'district of columbia',
  ].map((value) => value.toLowerCase()),
);

const US_STATE_CODES = new Set(
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(
    ' ',
  ),
);

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeHyphens(value: string) {
  return normalizeWhitespace(value.replace(/-/g, ' '));
}

function toTitleCaseWords(value: string) {
  return normalizeHyphens(value)
    .split(' ')
    .map((word) => {
      if (!word) {
        return word;
      }

      if (/^[A-Z0-9]{2,}$/.test(word)) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function splitLocationSegments(location: string) {
  return location
    .split(',')
    .map((segment) => normalizeHyphens(segment))
    .filter(Boolean);
}

function isZipOrPostalSegment(segment: string) {
  return /^\d{5}(?:-\d{4})?$/.test(segment) || /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(segment);
}

function isCountrySegment(segment: string) {
  const normalized = segment.toLowerCase();

  return COUNTRY_SEGMENTS.has(normalized);
}

function isStateSegment(segment: string) {
  const normalized = segment.toLowerCase();

  if (US_STATE_NAMES.has(normalized)) {
    return true;
  }

  if (/^[A-Z]{2}$/.test(segment) && US_STATE_CODES.has(segment.toUpperCase())) {
    return true;
  }

  return false;
}

function isStreetOrRoomSegment(segment: string) {
  if (/^\d+[\s-]/.test(segment)) {
    return true;
  }

  if (/^(room|suite|ste|floor|fl|building|bldg|unit|apt|apartment|office|ofc)\b/i.test(segment)) {
    return true;
  }

  return false;
}

function isLowValueSegment(segment: string) {
  return (
    isCountrySegment(segment) ||
    isStateSegment(segment) ||
    isZipOrPostalSegment(segment) ||
    segment.length === 0
  );
}

function pickUsefulLocationSegment(segments: string[]) {
  const meaningfulSegments = segments.filter((segment) => !isLowValueSegment(segment));

  if (meaningfulSegments.length === 0) {
    return segments[0] ?? '';
  }

  if (meaningfulSegments.length === 1) {
    return meaningfulSegments[0];
  }

  const withoutStreetPrefix = meaningfulSegments.filter((segment) => !isStreetOrRoomSegment(segment));

  if (withoutStreetPrefix.length === 1) {
    return withoutStreetPrefix[0];
  }

  if (withoutStreetPrefix.length > 1) {
    return withoutStreetPrefix[withoutStreetPrefix.length - 1];
  }

  return meaningfulSegments[meaningfulSegments.length - 1];
}

export function formatLocationShort(location: string) {
  const trimmed = location.trim();

  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return '';
  }

  const segments = splitLocationSegments(trimmed);

  if (segments.length === 0) {
    return toTitleCaseWords(trimmed);
  }

  if (segments.length === 1) {
    return toTitleCaseWords(pickUsefulLocationSegment(segments));
  }

  return toTitleCaseWords(pickUsefulLocationSegment(segments));
}
