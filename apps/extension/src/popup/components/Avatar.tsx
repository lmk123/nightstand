/** A neutral letter tile instead of a favicon (favicons would need an extra permission). */
export function LetterAvatar({text}: {text: string}) {
  const letter = [...text.trim()][0]?.toUpperCase() ?? '·'
  return (
    <span className="bg-accent text-accent-foreground flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-medium">
      {letter}
    </span>
  )
}
