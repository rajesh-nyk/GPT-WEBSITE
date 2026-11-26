import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import './lib/fonts'
import App from './App.tsx'
import { QualityProvider } from './lib/quality'
import { LenisProvider } from './lib/LenisProvider'
import { Preloader } from './components/Preloader'
import { FpsMeter } from './components/dev/FpsMeter'
import { RoyalInteractionCursor } from './components/cursor/RoyalInteractionCursor'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user": framer-motion drops transform/layout animations when the
        OS setting is on (opacity/colour fades still run, which is reduced-motion safe). */}
    <MotionConfig reducedMotion="user">
      <QualityProvider>
        <LenisProvider paced>
          <Preloader>
            <App />
          </Preloader>
          <RoyalInteractionCursor />
          {(import.meta.env.DEV || new URLSearchParams(window.location.search).has('fps')) && <FpsMeter />}
        </LenisProvider>
      </QualityProvider>
    </MotionConfig>
  </StrictMode>,
)
