import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('no drawer rule stretches every _root fragment to full width', () => {
  // The drawer used to carry a width cascade that stretched the sidebar
  // content column (regionArea -> root -> listArea -> treeBody) to 100%.
  // That cascade is gone: the drawer now hugs its content with
  // `width: max-content; max-width: 92vw`, so no descendant rule is needed.
  //
  // What must never come back is an UNGUARDED `_root` fragment rule: it is a
  // collision bomb, because every CSS module whose local name is `root`
  // compiles to a class containing `_root` (`jR4zTa_root`, `eGUBIq_root`,
  // primitives' `_root_19372_1`, ...) and the settings sheet portals into the
  // same drawer subtree. The unguarded rule forced dshmarket's Menu anchor
  // span to width:100% inside the flex .catsRow, crushing .catsWrap
  // (min-width:0) to zero width and stacking the category chips under the
  // overlapping Filter button.
  assert.doesNotMatch(
    layout,
    /\[class\*="_root"\]\)\s*\{\s*width:\s*100%/,
  )
})
