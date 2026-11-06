import {useState} from 'react'
import {Check, Copy} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {t} from '@/platform/i18n'

/** Shows a recovery code as 2 rows of 4 groups, with a copy button. */
export function RecoveryCodeBox({code}: {code: string}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="panel overflow-hidden">
      <code className="grid grid-cols-4 gap-x-1.5 gap-y-2 px-3.5 py-4 text-center font-mono text-[15px] font-medium tracking-[0.08em] select-all">
        {code.split('-').map((group, i) => (
          <span key={i} className="bg-muted rounded-md py-1.5">
            {group}
          </span>
        ))}
      </code>
      <div className="border-line bg-background flex justify-end border-t p-1.5">
        <Button
          variant="ghost"
          className="h-9 rounded-lg px-3 text-[13px]"
          onClick={async () => {
            await navigator.clipboard.writeText(code)
            setCopied(true)
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? t('copied') : t('copy')}
        </Button>
      </div>
    </div>
  )
}
