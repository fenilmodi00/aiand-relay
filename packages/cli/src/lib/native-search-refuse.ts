/**
 * Native server web_search* is unsupported (SPEC §9).
 * Strip these from upstream tool lists; custom function tools named
 * `web_search` are unaffected (passthrough).
 */

export const NATIVE_WEB_SEARCH_UNSUPPORTED =
  "Native web search is not supported by aiandrelay. Use a custom function tool if you need search.";

/** True for Anthropic/Codex native server search tool types (not custom functions). */
export function isNativeWebSearchToolType(type: string | undefined): boolean {
  return type === "web_search" || type?.startsWith("web_search") === true;
}
