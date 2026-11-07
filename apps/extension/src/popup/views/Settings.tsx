import {useEffect, useState, type ReactNode} from 'react'
import type {OpenMode, VaultSettings} from '@nightstand/core'
import {Label} from '@/components/ui/label'
import {Switch} from '@/components/ui/switch'
import {isFirefoxLike} from '@/lib/browser'
import {t} from '@/platform/i18n'
import {isIncognitoAllowed} from '@/platform/tabs'
import {Segmented} from '../components/ChoiceCards'
import {Header} from '../components/Header'
import {IncognitoHelp} from '../components/IncognitoHelp'
import {ShortcutInfo} from '../components/ShortcutInfo'
import {viewClass} from '../components/styles'

function SwitchRow({checked, onChange, children}: {checked: boolean; onChange: (on: boolean) => void; children: ReactNode}) {
  return (
    <Label className="flex items-center gap-3 p-3 text-[13px] leading-normal font-normal">
      <span className="flex-1">{children}</span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className="data-[size=default]:h-6 data-[size=default]:w-10 [&>span]:group-data-[size=default]/switch:size-[18px] [&>span]:group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-1px)] [&>span]:group-data-[size=default]/switch:data-unchecked:translate-x-[2px]"
      />
    </Label>
  )
}

/**
 * Real settings: only reachable from the unlocked vault list. The toolbar
 * icon is not here: it is chosen in the Quick Links settings.
 */
export function Settings({
  settings,
  onChange,
  onBack,
  children
}: {
  settings: VaultSettings
  onChange: (patch: Partial<VaultSettings>) => Promise<void>
  onBack: () => void
  children?: ReactNode
}) {
  const [incognitoAllowed, setIncognitoAllowed] = useState<boolean | null>(null)
  useEffect(() => {
    isIncognitoAllowed().then(setIncognitoAllowed, () => setIncognitoAllowed(false))
  }, [])

  return (
    <div className={viewClass}>
      <Header title={t('settingsTitle')} onBack={onBack} />
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-3 py-4 *:shrink-0">
        <section className="grid gap-2">
          <h2 className="section-label">{t('openModeLabel')}</h2>
          <Segmented
            label={t('openModeLabel')}
            value={settings.openMode}
            onChange={(openMode: OpenMode) => onChange({openMode})}
            options={[
              {value: 'current', label: t('openCurrent')},
              {value: 'newTab', label: t('openNewTab')},
              {value: 'incognito', label: isFirefoxLike ? t('openPrivateFirefox') : t('openIncognito')}
            ]}
          />
          {settings.openMode === 'incognito' && incognitoAllowed === false && <IncognitoHelp />}
        </section>
        <section className="grid gap-2">
          <h2 className="section-label">{t('saveNoticeSection')}</h2>
          <div className="panel divide-line grid divide-y">
            <SwitchRow checked={settings.skipSaveNotice !== true} onChange={(on) => onChange({skipSaveNotice: !on})}>
              {t('saveNoticeSetting')}
            </SwitchRow>
            <SwitchRow checked={settings.skipSaveCheck !== true} onChange={(on) => onChange({skipSaveCheck: !on})}>
              {t('saveCheckSetting')}
            </SwitchRow>
          </div>
        </section>
        <section className="grid gap-2">
          <h2 className="section-label">{t('shortcutSection')}</h2>
          <ShortcutInfo />
        </section>
        {children}
      </div>
    </div>
  )
}
