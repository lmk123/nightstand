import {useState} from 'react'
import {X} from 'lucide-react'
import {
  DEFAULT_DECOY_LINKS,
  ICON_SETS,
  makeDecoyLink,
  type DecoyConfig,
  type IconSet
} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {applyIcon, iconPaths} from '@/platform/icons'
import {t, type MessageKey} from '@/platform/i18n'
import {saveLinks} from '@/platform/storage'
import {Header} from '../components/Header'

const ICON_LABEL: Record<IconSet, MessageKey> = {
  nightstand: 'iconNightstand',
  book: 'iconBook',
  star: 'iconStar',
  grid: 'iconGrid'
}

/**
 * "Quick Links settings": the decoy's own, ordinary-looking settings. Edits
 * the decoy links and the toolbar icon — nothing here hints at the vault.
 */
export function DecoySettings({
  config,
  onChange,
  onBack
}: {
  config: DecoyConfig
  onChange: (config: DecoyConfig) => void
  onBack: () => void
}) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)

  async function save(next: DecoyConfig) {
    await saveLinks(next)
    onChange(next)
  }

  async function addLink(event: React.FormEvent) {
    event.preventDefault()
    const link = makeDecoyLink(title, url)
    if (!link) return setError(true)
    await save({...config, links: [...config.links, link]})
    setTitle('')
    setUrl('')
  }

  async function chooseIcon(icon: IconSet) {
    await save({...config, icon})
    await applyIcon(icon)
  }

  return (
    <div className="flex max-h-[580px] flex-col">
      <Header title={t('decoySettingsTitle')} onBack={onBack} />
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-3">
        <section className="grid gap-2">
          <h2 className="text-xs font-medium">{t('decoyLinksSection')}</h2>
          <ul className="grid gap-1">
            {config.links.map((link) => (
              <li key={link.id} className="flex items-center gap-2 rounded-md border px-2 py-1">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{link.title}</span>
                  <span className="text-muted-foreground block truncate text-xs">{link.url}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => save({...config, links: config.links.filter((l) => l.id !== link.id)})}
                  aria-label={t('delete')}
                  title={t('delete')}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <form className="grid gap-2" onSubmit={addLink}>
            <div className="flex gap-2">
              <Input className="w-28" placeholder={t('decoyLinkTitle')} value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input
                placeholder={t('decoyLinkUrl')}
                spellCheck={false}
                value={url}
                aria-invalid={error || undefined}
                onChange={(e) => {
                  setUrl(e.target.value)
                  setError(false)
                }}
              />
            </div>
            {error && <p className="text-destructive text-xs">{t('errInvalidUrl')}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="secondary" disabled={!url.trim()}>
                {t('decoyAddLink')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => save({...config, links: DEFAULT_DECOY_LINKS.map((l) => ({...l}))})}
              >
                {t('decoyRestoreDefaults')}
              </Button>
            </div>
          </form>
        </section>
        <section className="grid gap-2">
          <h2 className="text-xs font-medium">{t('iconSection')}</h2>
          <div className="grid grid-cols-4 gap-2">
            {ICON_SETS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => chooseIcon(icon)}
                aria-pressed={config.icon === icon}
                className={
                  'flex flex-col items-center gap-1 rounded-md border p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ' +
                  (config.icon === icon ? 'border-primary bg-accent' : 'hover:bg-muted')
                }
              >
                <img src={iconPaths(icon)['32']} alt="" width={24} height={24} />
                {t(ICON_LABEL[icon])}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
