import {useEffect, useState} from 'react'
import type {OpenMode, VaultSettings} from '@nightstand/core'
import {Label} from '@/components/ui/label'
import {RadioGroup, RadioGroupItem} from '@/components/ui/radio-group'
import {isFirefoxLike} from '@/lib/browser'
import {t} from '@/platform/i18n'
import {isIncognitoAllowed} from '@/platform/tabs'
import {Header} from '../components/Header'
import {IncognitoHelp} from '../components/IncognitoHelp'

/** Real settings: only reachable from the unlocked vault list. */
export function Settings({
  settings,
  onChange,
  onBack,
  children
}: {
  settings: VaultSettings
  onChange: (patch: Partial<VaultSettings>) => Promise<void>
  onBack: () => void
  children?: React.ReactNode
}) {
  const [incognitoAllowed, setIncognitoAllowed] = useState<boolean | null>(null)
  useEffect(() => {
    isIncognitoAllowed().then(setIncognitoAllowed, () => setIncognitoAllowed(false))
  }, [])

  return (
    <div className="flex max-h-[580px] flex-col">
      <Header title={t('settingsTitle')} onBack={onBack} />
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-3">
        <section className="grid gap-2">
          <h2 className="text-xs font-medium">{t('openModeLabel')}</h2>
          <RadioGroup value={settings.openMode} onValueChange={(v) => onChange({openMode: v as OpenMode})} className="gap-2">
            <Label className="flex items-center gap-2 text-sm font-normal">
              <RadioGroupItem value="current" />
              {t('openCurrent')}
            </Label>
            <Label className="flex items-center gap-2 text-sm font-normal">
              <RadioGroupItem value="newTab" />
              {t('openNewTab')}
            </Label>
            <Label className="flex items-center gap-2 text-sm font-normal">
              <RadioGroupItem value="incognito" />
              {isFirefoxLike ? t('openPrivateFirefox') : t('openIncognito')}
            </Label>
          </RadioGroup>
          {settings.openMode === 'incognito' && incognitoAllowed === false && <IncognitoHelp />}
        </section>
        {children}
      </div>
    </div>
  )
}
