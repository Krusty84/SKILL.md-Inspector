/**
 * Lightweight, dependency-free language check for the description analyzer. The
 * verb/vague/artifact dictionaries are English, so a description dominated by a
 * non-Latin script (Cyrillic, CJK, …) can only be analyzed structurally. This
 * flags that case so the quality result can be marked language-limited.
 */
export function isProbablyNonEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length === 0) {
    return false; // no letters (digits/punctuation only) — nothing to warn about
  }
  const latin = (text.match(/\p{Script=Latin}/gu) ?? []).length;
  return latin / letters.length < 0.5; // dominated by a non-Latin script
}
