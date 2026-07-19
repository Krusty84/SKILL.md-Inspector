/** Counts logical text lines consistently across token diagnostics and authoring quality. */
export function countTextLines(text: string): number {
  return text.length === 0 ? 0 : text.split(/\r\n|\n|\r/).length;
}
