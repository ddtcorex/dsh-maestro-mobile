/**
 * dsh-maestro-mobile, node half. Client UI plugin with transparent
 * gzip/brotli compression for large JSON responses (long-session history
 * is megabytes on a phone); the browser half ships via exports["./client"],
 * discovered through the package.json dsh.client declaration.
 */
import { installResponseCompression } from './compress.js'

/** Minimal structural slice of the host cordis Context that apply() needs. */
export interface HostContext {
  /** Register one disposable installer; its return value disposes on unload. */
  effect(install: () => unknown, label?: string): unknown
}

export function apply(ctx: HostContext): void {
  // Transparent gzip/brotli for large JSON responses (long-session history
  // is megabytes on a phone). Patches http.ServerResponse.prototype; the
  // disposer restores it on plugin unload/reload.
  // Ported from mexiaosqwq/dsh-web-mobile v2.1.5 (wzxmt-zhc fork).
  ctx.effect(() => installResponseCompression(), 'dsh-maestro-mobile: response compression')
}
