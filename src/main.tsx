import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled with the app rather than loaded from a font CDN: no
// third-party requests, and they work offline. A face only downloads when a
// theme actually uses it.
import '@fontsource/bowlby-one/400.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/grandstander'
import '@fontsource-variable/nunito'
import './styles/base.css'
import './styles/app.css'
import App from './App'
import { startPwa } from './pwa/pwa'

startPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
