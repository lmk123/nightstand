import {useState} from 'react'
import {Check, Copy} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {t} from '@/platform/i18n'

/** Shows a recovery code as 2 rows of 4 groups, with a copy button. */
export function RecoveryCodeBox({code}: {code: string}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="bg-muted flex items-center gap-2 rounded-md p-3">
      <code className="grid flex-1 grid-cols-4 gap-x-2 gap-y-1 font-mono text-sm tracking-wide select-all">
        {code.split('-').map((group, i) => (
          <span key={i}>{group}</span>
        ))}
      </code>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={async () => {
          await navigator.clipboard.writeText(code)
          setCopied(true)
        }}
        aria-label={t('copy')}
        title={copied ? t('copied') : t('copy')}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}
