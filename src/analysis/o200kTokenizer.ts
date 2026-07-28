import { Tiktoken } from 'js-tiktoken/lite';
import o200kBase from 'js-tiktoken/ranks/o200k_base';

let tokenizer: Tiktoken | undefined;

/**
 * Constructs the shared tokenizer eagerly. Decoding the o200k_base ranks is a
 * noticeable synchronous chunk of CPU that otherwise lands on whichever
 * validation happens to run first; calling this from an idle moment after
 * activation keeps that stall away from the user's first edit.
 */
export function warmUpO200kTokenizer(): void {
  tokenizer ??= new Tiktoken(o200kBase);
}

/** Exact, deterministic offline token count using only the bundled o200k_base ranks. */
export function countO200kTokens(text: string): number {
  tokenizer ??= new Tiktoken(o200kBase);
  // Skill text is ordinary content. Treat strings that resemble reserved
  // special tokens as text instead of throwing or assigning a special-token id.
  return tokenizer.encode(text, [], []).length;
}
