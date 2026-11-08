import {useState} from 'react'
import {X} from 'lucide-react'
import {DEFAULT_DECOY_LINKS, hostOf, makeDecoyLink, type DecoyConfig} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {t, type MessageKey} from '@/platform/i18n'
import {saveLinks} from '@/platform/storage'
import {SiteAvatar} from '../components/Avatar'
import {Header} from '../components/Header'
import {IconPicker} from '../components/IconPicker'
import {viewClass} from '../components/styles'

/**
 * "Quick Links settings": the decoy's own, ordinary-looking settings — its
 * links and the toolbar icon. Nothing here hints at the vault.
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
  const [error, setError] = useState<MessageKey | null>(null)

  /** Writes and adopts `next`; false (with a message) when the write failed. */
  async function save(next: DecoyConfig): Promise<boolean> {
    try {
      await saveLinks(next)
    } catch (e) {
      console.error(e)
      setError('errSaveFailed')
      return false
    }
    onChange(next)
    return true
  }

  async function addLink(event: React.FormEvent) {
    event.preventDefault()
    const link = makeDecoyLink(title, url)
    if (!link) return setError('errInvalidUrl')
    if (!(await save({...config, links: [...config.links, link]}))) return
    setTitle('')
    setUrl('')
  }

  const small = 'h-9 rounded-lg bg-card px-2.5 text-[13px] md:text-[13px] dark:bg-card'

  return (
    <div className={viewClass}>
      <Header title={t('decoySettingsTitle')} onBack={onBack} />
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-3 py-4 *:shrink-0">
        <section className="grid grid-cols-1 gap-2">
          <h2 className="section-label">{t('decoyLinksSection')}</h2>
          {config.links.length > 0 && (
            <ul className="panel grid grid-cols-1 p-1">
              {config.links.map((link) => (
                <li key={link.id} className="flex items-center gap-2.5 py-1.5 pr-1 pl-2">
                  <SiteAvatar text={link.title} pageUrl={link.url} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{link.title}</span>
                    <span className="text-muted-foreground block truncate text-xs">{hostOf(link.url) ?? link.url}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground rounded-lg"
                    onClick={() => save({...config, links: config.links.filter((l) => l.id !== link.id)})}
                    aria-label={t('delete')}
                    title={t('delete')}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form className="bg-muted grid grid-cols-1 gap-2 rounded-xl p-3" onSubmit={addLink}>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
              <Input
                className={small}
                aria-label={t('decoyLinkTitle')}
                placeholder={t('decoyLinkTitle')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Input
                className={small}
                aria-label={t('decoyLinkUrl')}
                placeholder={t('decoyLinkUrl')}
                spellCheck={false}
                value={url}
                aria-invalid={error === 'errInvalidUrl' || undefined}
                onChange={(e) => {
                  setUrl(e.target.value)
                  setError(null)
                }}
              />
            </div>
            {error && <p className="text-destructive text-xs">{t(error)}</p>}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                className="text-subtle-foreground h-9 rounded-lg px-2 text-[13px]"
                onClick={() => save({...config, links: DEFAULT_DECOY_LINKS.map((l) => ({...l}))})}
              >
                {t('decoyRestoreDefaults')}
              </Button>
              <Button type="submit" className="h-9 rounded-lg px-4 text-[13px]" disabled={!url.trim()}>
                {t('decoyAddLink')}
              </Button>
            </div>
          </form>
        </section>
        <section className="grid grid-cols-1 gap-2">
          <h2 className="section-label">{t('iconSection')}</h2>
          <IconPicker links={config} onChange={onChange} />
        </section>
      </div>
    </div>
  )
}
