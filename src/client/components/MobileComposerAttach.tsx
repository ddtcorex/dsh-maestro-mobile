import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconPaperclipOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { NS } from '../i18n/locales.ts'

/** Full props for the composer attachment entry. */
export interface MobileComposerAttachProps extends PropsRuntime<'conversation.input.left'>, PropsLocale<typeof NS> {}

/**
 * Mobile-only attachment entry in the composer tool row, beside the permission
 * selector.
 *
 * Upstream declares `conversation.input.left` as "compact controls at the left
 * of the composer tool row" but ships no contributor, so on a phone the file
 * picker sits two taps deep behind the `+` menu ("Add files or run commands" →
 * File). This fills that empty seat with the one-tap control it exists for.
 *
 * It does not reimplement any intake logic: it forwards to the hidden
 * `input[type=file]` upstream already renders inside the composer card, so
 * upstream keeps ownership of the accept list, the multi-select flag, the
 * image-limit checks and the upload transaction.
 *
 * The selector prefers `[data-composer-card]` (the stable capsule root that
 * ui-conversation hardcodes around the contenteditable and the toolbar) and
 * falls back to the plugin's own `[data-composer-seat]` marker.
 */
export function MobileComposerAttach({ t }: MobileComposerAttachProps) {
  const openPicker = (): void => {
    const input = document.querySelector<HTMLInputElement>(
      '[data-composer-card] input[type="file"], [data-composer-seat] input[type="file"]',
    )
    input?.click()
  }
  return (
    <button
      type="button"
      data-mobile-nav="attach"
      aria-label={t('attach')}
      title={t('attach')}
      onClick={openPicker}
    >
      <IconPaperclipOutline16 size={16} />
    </button>
  )
}
