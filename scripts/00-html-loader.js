/* HTML composition and script bootstrap loader */
'use strict';

(async function loadApp() {
  const root = document.getElementById('app-root');
  if (!root) return;

  const partials = [
    'html/01-login-screen.html',
    'html/02-main-app.html',
    'html/03-overlays.html',
  ];

  const scripts = [
    'scripts/01-core.js',
    'scripts/02-notifications.js',
    'scripts/03-features.js',
    'scripts/04-bootstrap.js',
  ];

  try {
    const htmlParts = await Promise.all(
      partials.map(async path => {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load ${path}`);
        return res.text();
      })
    );

    root.innerHTML = htmlParts.join('\n\n');

    for (const src of scripts) {
      await new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = src;
        tag.onload = resolve;
        tag.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.body.appendChild(tag);
      });
    }
  } catch (err) {
    console.error(err);
    root.innerHTML = '<div style="padding:16px;color:#ef4444;font-family:sans-serif">Application failed to load. Please refresh.</div>';
  }
})();
