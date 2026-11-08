import {useEffect, useRef, useState, type ReactNode} from 'react'
import {ChevronDown} from 'lucide-react'
import {cn} from 'cn'
import {t, type MessageKey} from '@/platform/i18n'
import {Header} from '../components/Header'
import {viewClass} from '../components/styles'

export type FaqTopic = 'matchMode' | 'extraHosts' | 'storage' | 'secrets'

const TOPICS: {id: FaqTopic; question: MessageKey}[] = [
  {id: 'matchMode', question: 'faqMatchQ'},
  {id: 'extraHosts', question: 'faqExtraQ'},
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
    storage: <StorageAnswer />,
    secrets: <SecretsAnswer />
  }

  return (
    <div className={viewClass}>
      <Header title={t('faqTitle')} onBack={onBack} />
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-3 *:shrink-0">
        {TOPICS.map(({id, question}) => {
          const expanded = open === id
          return (
            <section
              key={id}
              ref={(el) => {
                if (el) refs.current.set(id, el)
                else refs.current.delete(id)
              }}
              className="panel scroll-mt-3"
            >
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => toggle(id)}
                className={cn(
                  'focus-visible:ring-ring/50 flex min-h-12 w-full items-center gap-2.5 rounded-xl p-3 text-left text-sm outline-none focus-visible:ring-2',
                  expanded ? 'font-semibold' : 'font-medium'
                )}
              >
                <span className="flex-1">{t(question)}</span>
                <ChevronDown
                  className={cn('text-muted-foreground size-4 shrink-0 transition-transform', expanded && 'rotate-180')}
                  aria-hidden
                />
              </button>
              {expanded && (
                <div className="text-subtle-foreground grid grid-cols-1 gap-3 px-3 pb-3.5 text-[12.5px] leading-relaxed [&_strong]:text-foreground">
                  {body[id]}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Mark({yes}: {yes: boolean}) {
  return (
    <span className={cn('block text-center font-semibold', yes ? 'text-ok-foreground' : 'text-muted-foreground')}>
      {yes ? t('faqMarkDeleted') : t('faqMarkKept')}
    </span>
  )
}

/** A bordered table that fits the popup's width. */
function Table({head, children}: {head: ReactNode; children: ReactNode}) {
  return (
    <div className="overflow-hidden rounded-[10px] border">
      <table className="w-full border-collapse text-[11.5px] leading-snug">
        <thead className="bg-muted text-foreground">{head}</thead>
        <tbody className="[&_td]:border-line [&_td]:border-t">{children}</tbody>
      </table>
    </div>
  )
}

function Tip({children}: {children: ReactNode}) {
  return <p className="bg-accent text-accent-foreground rounded-[10px] px-3 py-2.5">{children}</p>
}

function MatchModeAnswer() {
  return (
    <>
      <p>{t('faqMatchIntro')}</p>
      <Table
        head={
          <tr>
            <th className="p-2 text-left font-semibold">{t('faqColUrl')}</th>
            <th className="w-[54px] px-1 py-2 font-semibold">{t('faqColSite')}</th>
            <th className="w-[54px] px-1 py-2 font-semibold">{t('faqColExact')}</th>
          </tr>
        }
      >
        {MATCH_EXAMPLES.map(([url, site, exact]) => (
          <tr key={url}>
            <td className="text-foreground px-2 py-1.5 font-mono text-[11px] break-all">{url}</td>
            <td className="px-1 py-1.5"><Mark yes={site} /></td>
            <td className="px-1 py-1.5"><Mark yes={exact} /></td>
          </tr>
        ))}
      </Table>
      <p>{t('faqMatchSite')}</p>
      <p>{t('faqMatchExact')}</p>
      <p>{t('faqMatchWhen')}</p>
      <Tip>{t('faqMatchTip')}</Tip>
    </>
  )
}

function ExtraHostsAnswer() {
  return (
    <>
      <p>{t('faqExtra1')}</p>
      <p>{t('faqExtra2')}</p>
      <p className="text-foreground font-semibold">{t('faqExtraFindTitle')}</p>
      <p>{t('faqExtraFind1')}</p>
      <ul className="list-disc pl-4">
        <li>{t('faqExtraFind2')}</li>
        <li>{t('faqExtraFind3')}</li>
      </ul>
      <p>{t('faqExtraFind4')}</p>
      <Tip>{t('faqExtraTip')}</Tip>
    </>
  )
}

function StorageAnswer() {
  return (
    <>
      <p>{t('faqStore1')}</p>
      <p>{t('faqStore2')}</p>
      <p>{t('faqStore3')}</p>
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
      <p>{t('faqSecret7')}</p>
      <Tip>{t('faqSecretWarn')}</Tip>
    </>
  )
}
