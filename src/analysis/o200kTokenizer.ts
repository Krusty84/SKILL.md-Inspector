import { Tiktoken } from 'js-tiktoken/lite';
import o200kBase from 'js-tiktoken/ranks/o200k_base';

let tokenizer: Tiktoken | undefined;

/** Exact, deterministic offline token count using only the bundled o200k_base ranks. */
export function countO200kTokens(text: string): number {
  tokenizer ??= new Tiktoken(o200kBase);
  // Skill text is ordinary content. Treat strings that resemble reserved
  // special tokens as text instead of throwing or assigning a special-token id.
  return tokenizer.encode(text, [], []).length;
}
