import {cn} from 'cn'
import {Label} from '@/components/ui/label'
import {RadioGroup, RadioGroupItem} from '@/components/ui/radio-group'

/** Radio options drawn as full-width cards; the chosen one is tinted. */
export function ChoiceCards<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: {value: T; label: string}[]
  onChange: (value: T) => void
}) {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as T)} className="grid-cols-1 gap-1.5">
      {options.map((option) => (
        <Label
          key={option.value}
          className={cn(
            'flex min-h-11 items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-[13px] font-normal',
            value === option.value
              ? 'border-primary bg-accent text-accent-foreground ring-primary ring-[0.5px]'
              : 'border-input bg-card hover:bg-muted'
          )}
        >
          <RadioGroupItem value={option.value} />
          {option.label}
        </Label>
      ))}
    </RadioGroup>
  )
}

/** A compact segmented control (2–3 short options). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: {value: T; label: string}[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="bg-track grid gap-0.5 rounded-[11px] p-[3px]"
      style={{gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`}}
    >
      {options.map((option) => {
        const checked = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={cn(
              'focus-visible:ring-ring/50 h-9 rounded-lg px-1 text-[13px] outline-none focus-visible:ring-2',
              checked ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-subtle-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
