import {estimatePassphrase, type PassphraseStrength as Strength} from '@nightstand/core'
import {t, type MessageKey} from '@/platform/i18n'
import {HelpLink} from '../help'

const LABEL: Record<Strength, MessageKey> = {
  weak: 'passStrengthWeak',
  fair: 'passStrengthFair',
  good: 'passStrengthGood',
  strong: 'passStrengthStrong'
}

const LEVEL: Record<Strength, number> = {weak: 1, fair: 2, good: 3, strong: 4}

const COLOR: Record<Strength, string> = {
  weak: 'bg-destructive',
  fair: 'bg-amber-500',
  good: 'bg-emerald-500',
  strong: 'bg-emerald-600'
}

/** A hint only: any passphrase that passes `checkPassphrase` can still be used. */
export function PassphraseStrength({passphrase}: {passphrase: string}) {
  const {strength} = estimatePassphrase(passphrase)
  const level = passphrase ? LEVEL[strength] : 0
  return (
    <div className="grid gap-1.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={'h-1 flex-1 rounded-full ' + (i <= level ? COLOR[strength] : 'bg-muted')} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">{passphrase ? t('passStrength', t(LABEL[strength])) : ''}</span>
        <HelpLink topic="passphrase" label="faqPassQ" />
      </div>
    </div>
  )
}
