import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App } from './App'
import './styles.css'

async function boot(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setBackgroundColor({ color: '#07090f' })
      await StatusBar.setStyle({ style: Style.Dark })
    } catch {
      // Emulador o plugin no disponible
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void boot()
