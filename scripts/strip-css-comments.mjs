// Build-time removal of CSS comments from the emitted stylesheet modules
// (ported from mexiaosqwq/dsh-web-mobile v3.2.3, #260).
//
// The styles/*.css.ts modules are template-literal CSS whose comments are the
// design record: owner decisions, field measurements, host archaeology. They
// dominate the injected stylesheet and ship verbatim inside lib/client.js, so
// the browser parses them on every page load. Sources keep every comment; only
// the emitted bundle drops them.
//
// Safe for this repo's CSS by construction: no rule contains a `/*` inside a
// string or url(), and no styles module uses template interpolation.
// tests/strip-css-comments.test.ts pins both.

/**
 * Remove every CSS block comment and collapse the whitespace it leaves behind.
 * @param css - stylesheet text, comments included.
 * @returns the same stylesheet without comments or trailing whitespace runs.
 */
export function stripCssComments(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * Strip the CSS inside `exports.<NAME>_CSS = \`...\`` of one emitted module.
 * Refuses a module that interpolates: the regex would cut the string early and
 * ship a truncated stylesheet.
 * @param source - one tsc-emitted CommonJS stylesheet module.
 * @returns the module with its CSS literal comment-free.
 */
export function stripEmittedCssModule(source) {
  return source.replace(/(exports\.[A-Z_]+_CSS = `)([\s\S]*?)(`;)/g, (_, open, css, close) => {
    if (css.includes('${')) throw new Error('styles module uses interpolation; refusing to strip')
    return open + stripCssComments(css) + close
  })
}
