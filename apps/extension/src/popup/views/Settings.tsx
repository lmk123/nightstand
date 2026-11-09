import {useEffect, useState, type ReactNode} from 'react'
import type {Prefs, VaultSettings} from '@nightstand/core'
import {Label} from '@/components/ui/label'
import {Switch} from '@/components/ui/switch'
import {t} from '@/platform/i18n'
import {loadPrefs, savePrefs} from '@/platform/storage'
import {Header} from '../components/Header'
import {ShortcutInfo} from '../components/ShortcutInfo'
import {viewClass} from '../components/styles'

function SwitchRow({
  checked,
  onChange,
  disabled,
  children
}: {
  checked: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Label className="flex items-center gap-3 p-3 text-[13px] leading-normal font-normal">
      {/* Dimmed along with the switch, which dims itself. */}
      <span className={disabled ? 'flex-1 opacity-50' : 'flex-1'}>{children}</span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
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
  // Cover / mute live outside the vault (the page script needs them while
  // locked), so they are read and written here directly.
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  useEffect(() => {
    loadPrefs().then(setPrefs, console.error)
  }, [])
  const changePrefs = (patch: Partial<Prefs>) => {
    if (!prefs) return
    const next = {...prefs, ...patch}
    setPrefs(next)
    savePrefs(next).catch((error: unknown) => {
      console.error(error)
      // Show what is actually stored, not a change that never landed.
      loadPrefs().then(setPrefs, console.error)
    })
  }

  return (
    <div className={viewClass}>
      <Header title={t('settingsTitle')} onBack={onBack} />
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-3 py-4 *:shrink-0">
        {prefs && (
          <section className="grid grid-cols-1 gap-2">
            <h2 className="section-label">{t('coverSection')}</h2>
            <div className="panel divide-line grid grid-cols-1 divide-y">
              <SwitchRow checked={prefs.cover} onChange={(cover) => changePrefs({cover})}>
                {t('coverSetting')}
                <span className="text-muted-foreground mt-1 block text-xs">{t('coverHint')}</span>
              </SwitchRow>
              {/* Muting goes with the cover: with covering off no page is ever shown, so it would never end. */}
              <SwitchRow checked={prefs.cover && prefs.mute} disabled={!prefs.cover} onChange={(mute) => changePrefs({mute})}>
                {t('muteSetting')}
              </SwitchRow>
            </div>
          </section>
        )}
        <section className="grid grid-cols-1 gap-2">
          <h2 className="section-label">{t('saveNoticeSection')}</h2>
          <div className="panel divide-line grid grid-cols-1 divide-y">
            <SwitchRow checked={settings.skipSaveNotice !== true} onChange={(on) => onChange({skipSaveNotice: !on})}>
              {t('saveNoticeSetting')}
            </SwitchRow>
            <SwitchRow checked={settings.skipSaveCheck !== true} onChange={(on) => onChange({skipSaveCheck: !on})}>
              {t('saveCheckSetting')}
            </SwitchRow>
          </div>
        </section>
        <section className="grid grid-cols-1 gap-2">
          <h2 className="section-label">{t('shortcutSection')}</h2>
          <ShortcutInfo />
        </section>
        {children}
      </div>
    </div>
  )
}
