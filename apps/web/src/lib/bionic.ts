/**
 * Bionic Reading utility
 * Bolds the first portion of each word to guide the eye and improve reading speed
 */

/**
 * Calculate how many characters to bold based on word length
 */
function getBoldLength(wordLength: number): number {
  if (wordLength <= 1) return 1;
  if (wordLength <= 3) return 1;
  if (wordLength <= 6) return 2;
  if (wordLength <= 9) return 3;
  return Math.ceil(wordLength * 0.4);
}

/**
 * Convert text to bionic reading format
 * Returns an array of segments with bold/normal flags
 */
export function toBionicSegments(text: string): Array<{ text: string; bold: boolean }> {
  const segments: Array<{ text: string; bold: boolean }> = [];
  const words = text.split(/(\s+)/);

  for (const word of words) {
    // Keep whitespace as-is
    if (/^\s+$/.test(word)) {
      segments.push({ text: word, bold: false });
      continue;
    }

    // Skip empty strings
    if (!word) continue;

    // Handle punctuation at start/end
    const match = word.match(/^([^\w]*)(\w*)([^\w]*)$/);
    if (!match) {
      segments.push({ text: word, bold: false });
      continue;
    }

    const [, prefix, core, suffix] = match;

    // Add prefix punctuation
    if (prefix) {
      segments.push({ text: prefix, bold: false });
    }

    // Process the core word
    if (core) {
      const boldLen = getBoldLength(core.length);
      const boldPart = core.slice(0, boldLen);
      const normalPart = core.slice(boldLen);

      if (boldPart) {
        segments.push({ text: boldPart, bold: true });
      }
      if (normalPart) {
        segments.push({ text: normalPart, bold: false });
      }
    }

    // Add suffix punctuation
    if (suffix) {
      segments.push({ text: suffix, bold: false });
    }
  }

  return segments;
}

/**
 * Convert text to HTML string with bionic formatting
 */
export function toBionicHTML(text: string): string {
  const segments = toBionicSegments(text);
  return segments
    .map(seg => (seg.bold ? `<b>${seg.text}</b>` : seg.text))
    .join('');
}
