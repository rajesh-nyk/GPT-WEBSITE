// Self-hosted web fonts (fontsource → bundled by Vite, no Google request at runtime).
// Fontsource splits each family by unicode-range, so only the Latin and Odia subsets
// actually used get downloaded.
import '@fontsource-variable/bodoni-moda/opsz.css'
import '@fontsource-variable/cormorant-garamond/wght.css'
import '@fontsource-variable/cormorant-garamond/wght-italic.css'
import '@fontsource-variable/noto-serif-oriya/wght.css'

/**
 * The browser only fetches a web font once text needs it — which would be AFTER the
 * loading screen, causing a visible font swap on the hero. The preloader awaits this
 * instead. The sample strings make the browser pick the right unicode-range subsets.
 */
export function preloadFonts() {
  if (!document.fonts?.load) return Promise.resolve()
  return Promise.all([
    document.fonts.load('400 72px "Bodoni Moda Variable"', 'RAJESH CHINMAYEE ODISHA 2027'),
    document.fonts.load('400 12px "Bodoni Moda Variable"', 'SHRI GANESHAYA NAMAH SCROLL'),
    document.fonts.load('300 1em "Cormorant Garamond Variable"', 'Rajesh Chinmayee'),
    document.fonts.load('italic 400 1em "Cormorant Garamond Variable"', '&'),
    document.fonts.load('400 1em "Noto Serif Oriya Variable"', 'ରାଜେଶ ଓ ଚିନ୍ମୟୀ'),
  ]).catch((err) => console.warn('[fonts] preload failed, falling back', err))
}
