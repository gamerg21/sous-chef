// One polite live region on <body> for results that outlive the control that
// caused them (a hidden recipe's card is usually gone by the time it's announced).
let region: HTMLElement | null = null

export function announce(message: string) {
  if (typeof document === 'undefined') return
  if (!region || !region.isConnected) {
    region = document.createElement('div')
    region.setAttribute('role', 'status')
    region.setAttribute('aria-live', 'polite')
    region.dataset.communityAnnouncer = ''
    region.className = 'sr-only'
    document.body.appendChild(region)
  }
  const target = region
  target.textContent = ''
  // After a closing dialog has left the top layer; an inert region isn't read out.
  window.setTimeout(() => { target.textContent = message }, 300)
}
