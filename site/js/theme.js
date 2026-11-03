// Stored preferences and the Auto / Light / Dark switch. Storage can be missing or throw (private mode, blocked data).

/** @param {string} key @param {string[]} allowed @returns {string | null} */
export function getPref(key, allowed) {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v) ? v : null
  } catch { return null }
}

/** @param {string} key @param {string} value */
export function setPref(key, value) {
  try { localStorage.setItem(key, value) } catch { /* the choice just is not remembered */ }
}

/** Applies the stored theme to <html data-mode> and wires the `[data-t]` buttons in `seg`. @param {HTMLElement} seg */
export function initTheme(seg) {
  const mq = matchMedia('(prefers-color-scheme: dark)')
  let choice = getPref('uptime.theme', ['auto', 'light', 'dark']) ?? 'auto'
  const apply = () => {
    document.documentElement.dataset.mode = choice === 'auto' ? (mq.matches ? 'dark' : 'light') : choice
    for (const b of seg.querySelectorAll('[data-t]')) {
      b.classList.toggle('on', b.dataset.t === choice); b.setAttribute('aria-checked', String(b.dataset.t === choice))
    }
  }
  mq.addEventListener('change', () => { if (choice === 'auto') apply() })
  seg.addEventListener('click', e => {
    const b = e.target.closest('[data-t]')
    if (b) { choice = b.dataset.t; setPref('uptime.theme', choice); apply() }
  })
  apply()
}
