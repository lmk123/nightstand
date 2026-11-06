import {createRoot} from 'react-dom/client'
import App from './App'
import {t} from '@/platform/i18n'
import '../styles/globals.css'

document.title = t('popupTitle')

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Popup root element not found')

createRoot(rootElement).render(<App />)
