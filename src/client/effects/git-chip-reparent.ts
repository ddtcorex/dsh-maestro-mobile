import type { ReconcilerTask } from '../core/reconciler-core.ts'

export function createGitChipTask(): ReconcilerTask {
  return {
    name: 'git-chip-reparent',
    scopes: ['*'],
    ensure: () => {
      const chip = document.querySelector('[data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor]')
      if (chip === null) return
      const card = document.querySelector('textarea')?.closest('[class*="_card"]')
      if (card == null) return
      if (chip.parentElement !== card) card.insertBefore(chip, card.firstChild)
    },
    dispose: () => {
      const chip = document.querySelector('[data-slot="conversation.input.dock"] [data-gitgraph-chip-anchor]')
      const dock = document.querySelector('[data-slot="conversation.input.dock"]')
      if (chip !== null && dock !== null && chip.parentElement !== dock) dock.appendChild(chip)
    },
  }
}
