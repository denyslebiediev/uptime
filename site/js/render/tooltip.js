// One shared tooltip for every `[data-tip]` mark: hover with a mouse, tap on a touch screen.

/** @param {HTMLElement} root the positioned `.ui` wrapper @param {HTMLElement} tip */
export function initTooltip(root, tip) {
  const hide = () => { tip.style.opacity = '0' }
  const show = e => {
    const el = e.target.closest('[data-tip]')
    if (!el) return hide()
    const R = root.getBoundingClientRect()
    tip.textContent = el.dataset.tip
    tip.style.left = `${Math.min(Math.max(e.clientX - R.left, tip.offsetWidth / 2 + 8), R.width - tip.offsetWidth / 2 - 8)}px`
    tip.style.top = `${e.clientY - R.top}px`; tip.style.opacity = '1'
  }
  root.addEventListener('pointermove', show)
  root.addEventListener('pointerdown', show)
  // a finger "leaves" right after every tap, which would hide the tip it just showed
  root.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hide() })
  addEventListener('scroll', hide, { passive: true })
}
