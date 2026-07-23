import dayjs from 'dayjs';

const illegalChars = /[<>:"/\\|?*\x00-\x1F]/g;
const dotsAndSpaces = /[. ]+$/g;

export function sanitizeFilename(input) {
  return String(input || '')
    .replace(illegalChars, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(dotsAndSpaces, '');
}

export function buildBaseFilename({ caption, timestamp }) {
  const cleanCaption = sanitizeFilename(caption);
  if (cleanCaption) return cleanCaption;
  return dayjs(timestamp).format('YYYYMMDD-HHmmss');
}

export function withWebpExtension(name) {
  return `${sanitizeFilename(name)}.webp`;
}

export function addDuplicateSuffix(filename, count) {
  const extIndex = filename.toLowerCase().lastIndexOf('.webp');
  const base = extIndex >= 0 ? filename.slice(0, extIndex) : filename;
  return `${base} (${count}).webp`;
}

