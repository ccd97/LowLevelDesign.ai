/**
 * Utility to instantly switch theme without CSS transitions/animations.
 */
export function applyThemeInstantly(theme: 'dark' | 'light') {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  // Add the class that suppresses all transitions across all elements
  root.classList.add('disable-transitions');

  if (theme === 'light') {
    root.classList.remove('dark');
    root.classList.add('light');
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
  }

  // Force reflow so the browser applies the theme classes immediately
  // without triggering any CSS transitions.
  void root.offsetHeight;

  // Restore transitions on subsequent frame so interactive hover effects still work
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove('disable-transitions');
    });
  });
}
