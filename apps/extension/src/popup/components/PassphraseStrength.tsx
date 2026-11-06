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

const COLOR: Record<Strength, {bar: string; text: string}> = {
  weak: {bar: 'bg-destructive', text: 'text-destructive'},
  fair: {bar: 'bg-fair', text: 'text-fair-foreground'},
  good: {bar: 'bg-ok', text: 'text-ok-foreground'},
  strong: {bar: 'bg-ok', text: 'text-ok-foreground'}
}

/** A hint only: any passphrase that passes `checkPassphrase` can still be used. */
export function PassphraseStrength({passphrase}: {passphrase: string}) {
  const {strength} = estimatePassphrase(passphrase)
  const level = passphrase ? LEVEL[strength] : 0
  return (
    <div className="grid gap-1.5" aria-live="polite">
      <div className="grid grid-cols-4 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={'h-1 rounded-full ' + (i <= level ? COLOR[strength].bar : 'bg-border')} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={'text-xs ' + COLOR[strength].text}>{passphrase ? t('passStrength', t(LABEL[strength])) : ''}</span>
        <HelpLink topic="passphrase" label="faqPassQ" />
      </div>
    </div>
  )
}
