// The site's own icons (no emoji, no icon font). Static markup, drawn for 24-unit boxes
// unless a viewBox says otherwise; colour follows currentColor.
export const icons = {
  play: '<svg viewBox="0 0 14 16"><path d="M2 1.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 18 18"><rect x="3" y="2" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="11" y="2" width="4" height="14" rx="1.5" fill="currentColor"/></svg>',
  fullscreen: '<svg viewBox="0 0 18 18"><path d="M2 7V2h5M11 2h5v5M16 11v5h-5M7 16H2v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  soundOff: '<svg viewBox="0 0 26 22"><path d="M2 8h5l6-5v16l-6-5H2z" fill="currentColor"/><path d="M18 7l6 8M24 7l-6 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  soundOn: '<svg viewBox="0 0 26 22"><path d="M2 8h5l6-5v16l-6-5H2z" fill="currentColor"/><path d="M17 13v3M20 10v6M23 7v9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  muted: '<svg viewBox="0 0 26 22"><path d="M2 8h5l6-5v16l-6-5H2z" fill="currentColor"/><path d="M18 7l6 8M24 7l-6 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  motionPause: '<svg viewBox="0 0 18 18"><rect x="3" y="2" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="11" y="2" width="4" height="14" rx="1.5" fill="currentColor"/></svg>',
  motionPlay: '<svg viewBox="0 0 18 18"><path d="M4 2.5v13l11-6.5z" fill="currentColor"/></svg>',
  broom: '<svg viewBox="0 0 24 24"><path d="M19 3l-7.5 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M10.2 9.4l4.4 4.4c-.9 3.4-3.6 6.6-7.6 7.7L3.4 18c1.6-1 2.6-2.4 2.4-4.5 1.3-2.4 2.6-3.7 4.4-4.1z" fill="#FFE14D" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M6.8 15.2l3 3M9 13.4l3.2 3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  arrowRight: '<svg viewBox="0 0 24 24"><path d="M4 12.5c5-.4 10-.6 15-.5M13.5 6l6 6-6.5 6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrowLeft: '<svg viewBox="0 0 90 60"><path d="M80 6C70 30 48 46 14 48M14 48L28 38M14 48L27 58" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
  arrowUp: '<svg viewBox="0 0 70 44"><path d="M60 40C52 22 38 10 12 6M12 6L24 0M12 6L22 16" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
  retry: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  dice: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="8.2" cy="8.2" r="1.8" fill="currentColor"/><circle cx="15.8" cy="8.2" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="8.2" cy="15.8" r="1.8" fill="currentColor"/><circle cx="15.8" cy="15.8" r="1.8" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 16 16"><path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
} as const;
export type IconName = keyof typeof icons;
