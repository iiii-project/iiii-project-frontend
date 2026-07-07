export type RitualEffectKind = 'prayer' | 'draw' | 'sheng' | 'retry' | 'reject'

export const RITUAL_EFFECT_MS: Record<RitualEffectKind, number> = {
  prayer: 2200,
  draw: 2200,
  sheng: 2400,
  retry: 2000,
  reject: 2600
}

export function triggerRitualEffect(kind: RitualEffectKind, text: string) {
  window.dispatchEvent(new CustomEvent('ritual-effect', { detail: { kind, text } }))
  return new Promise<void>((resolve) => window.setTimeout(resolve, RITUAL_EFFECT_MS[kind]))
}
