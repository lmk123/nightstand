import {isUntitled, type VaultEntry} from '@nightstand/core'
import {t} from '@/platform/i18n'

/** The name the popup shows for an entry: never its domain (see `isUntitled`). */
export function entryTitle(entry: Pick<VaultEntry, 'url' | 'title'>): string {
  return isUntitled(entry) ? t('untitledEntry') : entry.title
}
