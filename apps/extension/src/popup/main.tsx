import {createRoot} from 'react-dom/client'
import App from './App'
import {HelpProvider} from './help'
import {t} from '@/platform/i18n'
import '../styles/globals.css'

// The catalog the browser picked, not its UI language: a zh-TW browser falls
// back to the English catalog, and `lang` should say so.
document.documentElement.lang = t('htmlLang')
document.title = t('popupTitle')

// Follow the system light/dark preference.
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches)
applyTheme()
dark.addEventListener('change', applyTheme)

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Popup root element not found')

createRoot(rootElement).render(
  <HelpProvider>
    <App />
  </HelpProvider>
)
