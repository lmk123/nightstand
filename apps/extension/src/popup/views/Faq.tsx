import {useEffect, useRef, useState, type ReactNode} from 'react'
import {ChevronRight} from 'lucide-react'
import {t, type MessageKey} from '@/platform/i18n'
import {Header} from '../components/Header'

export type FaqTopic = 'matchMode' | 'extraHosts' | 'passphrase' | 'storage' | 'secrets'

const TOPICS: {id: FaqTopic; question: MessageKey}[] = [
  {id: 'matchMode', question: 'faqMatchQ'},
  {id: 'extraHosts', question: 'faqExtraQ'},
  {id: 'passphrase', question: 'faqPassQ'},
  {id: 'storage', question: 'faqStoreQ'},
  {id: 'secrets', question: 'faqSecretQ'}
]

/** Example visits for an entry `example.com/docs/guide`: [url, site mode cleans, exact mode cleans]. */
const MATCH_EXAMPLES: [string, boolean, boolean][] = [
  ['example.com/docs/guide', true, true],
  ['http://www.example.com/docs/guide#intro', true, true],
  ['example.com/docs/guide/', true, true],
  ['example.com/docs/guide?page=2', true, false],
  ['example.com/', true, false],
  ['blog.example.com/', true, false],
  ['evil-example.com/', false, false],
  ['example.org/', false, false]
]

const PASS_EXAMPLES: [MessageKey, MessageKey][] = [
  ['faqPassRow1', 'faqPassTime1'],
  ['faqPassRow2', 'faqPassTime2'],
  ['faqPassRow3', 'faqPassTime3'],
  ['faqPassRow4', 'faqPassTime4'],
  ['faqPassRow5', 'faqPassTime5']
]

/** FAQ: a view inside the popup (never an extension tab). Opened from settings and from "?" links. */
export function Faq({initial, onBack}: {initial?: FaqTopic; onBack: () => void}) {
  // One answer at a time: the popup is short, and a second open answer would
  // push the one being read off screen.
  const [open, setOpen] = useState<FaqTopic | null>(initial ?? null)
  const refs = useRef(new Map<FaqTopic, HTMLElement>())

  // Bring the opened question to the top (collapsing a long answer above it moves it).
  useEffect(() => {
    if (open) refs.current.get(open)?.scrollIntoView({block: 'start'})
  }, [open])

  function toggle(topic: FaqTopic) {
    setOpen((current) => (current === topic ? null : topic))
  }

  const body: Record<FaqTopic, ReactNode> = {
    matchMode: <MatchModeAnswer />,
    extraHosts: <ExtraHostsAnswer />,
    passphrase: <PassphraseAnswer />,
    storage: <StorageAnswer onPassphrase={() => setOpen('passphrase')} />,
    secrets: <SecretsAnswer />
  }

  return (
    <div className="flex max-h-[580px] flex-col">
      <Header title={t('faqTitle')} onBack={onBack} />
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto p-2">
        {TOPICS.map(({id, question}) => {
          const expanded = open === id
          return (
            <section
              key={id}
              ref={(el) => {
                if (el) refs.current.set(id, el)
                else refs.current.delete(id)
              }}
              className="scroll-mt-2"
            >
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => toggle(id)}
                className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <ChevronRight className={'text-muted-foreground size-4 shrink-0 transition-transform ' + (expanded ? 'rotate-90' : '')} />
                {t(question)}
              </button>
              {expanded && <div className="grid gap-2 px-2 pt-1 pb-3 text-xs leading-relaxed">{body[id]}</div>}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Mark({yes}: {yes: boolean}) {
  return <span className={yes ? 'block text-center' : 'text-muted-foreground block text-center'}>{yes ? '✓' : '✗'}</span>
}

function MatchModeAnswer() {
  return (
    <>
      <p>{t('faqMatchIntro')}</p>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-muted-foreground border-b">
            <th className="py-1 text-left font-normal">{t('faqColUrl')}</th>
            <th className="w-14 py-1 font-normal">{t('faqColSite')}</th>
            <th className="w-14 py-1 font-normal">{t('faqColExact')}</th>
          </tr>
        </thead>
        <tbody>
          {MATCH_EXAMPLES.map(([url, site, exact]) => (
            <tr key={url} className="border-b last:border-0">
              <td className="py-1 pr-1 font-mono text-[11px] break-all">{url}</td>
              <td className="py-1"><Mark yes={site} /></td>
              <td className="py-1"><Mark yes={exact} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{t('faqMatchSite')}</p>
      <p>{t('faqMatchExact')}</p>
      <p>{t('faqMatchWhen')}</p>
      <p className="bg-accent text-accent-foreground rounded-md p-2">{t('faqMatchTip')}</p>
    </>
  )
}

function ExtraHostsAnswer() {
  return (
    <>
      <p>{t('faqExtra1')}</p>
      <p>{t('faqExtra2')}</p>
      <p className="font-medium">{t('faqExtraFindTitle')}</p>
      <p>{t('faqExtraFind1')}</p>
      <ul className="list-disc pl-4">
        <li>{t('faqExtraFind2')}</li>
        <li>{t('faqExtraFind3')}</li>
      </ul>
      <p>{t('faqExtraFind4')}</p>
      <p className="bg-accent text-accent-foreground rounded-md p-2">{t('faqExtraTip')}</p>
    </>
  )
}

function PassphraseAnswer() {
  return (
    <>
      <p>{t('faqPass1')}</p>
      <p>{t('faqPass2')}</p>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-muted-foreground border-b">
            <th className="py-1 text-left font-normal">{t('faqColPassExample')}</th>
            <th className="py-1 text-right font-normal">{t('faqColPassTime')}</th>
          </tr>
        </thead>
        <tbody>
          {PASS_EXAMPLES.map(([row, time]) => (
            <tr key={row} className="border-b last:border-0">
              <td className="py-1 pr-2">{t(row)}</td>
              <td className="py-1 text-right whitespace-nowrap">{t(time)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground">{t('faqPassNote')}</p>
      <p>{t('faqPassChoose')}</p>
      <p>{t('faqPassMeter')}</p>
      <p>{t('faqPassRecovery')}</p>
    </>
  )
}

function StorageAnswer({onPassphrase}: {onPassphrase: () => void}) {
  return (
    <>
      <p>{t('faqStore1')}</p>
      <p>{t('faqStore2')}</p>
      <p>{t('faqStore3')}</p>
      <button
        type="button"
        onClick={onPassphrase}
        className="justify-self-start rounded-sm underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {t('faqPassQ')}
      </button>
      <p>{t('faqStore4')}</p>
      <p>{t('faqStore5')}</p>
    </>
  )
}

function SecretsAnswer() {
  return (
    <>
      <p>{t('faqSecret1')}</p>
      <p>{t('faqSecret2')}</p>
      <p>{t('faqSecret3')}</p>
      <p>{t('faqSecret4')}</p>
      <p>{t('faqSecret5')}</p>
      <p>{t('faqSecret6')}</p>
      <p className="bg-accent text-accent-foreground rounded-md p-2">{t('faqSecretWarn')}</p>
    </>
  )
}
