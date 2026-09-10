/* ================================================================
   app.js — Bootstrap: initialize all modules in the correct order
   ================================================================ */

(function () {
  'use strict';

  function bootstrap() {
    // 1. UI module (toolbar, themes, keyboard shortcuts)
    window.UI.init();

    // 2. Auto-save module (attaches text-change, restores session)
    window.AutoSave.init();

    // 3. Find & Replace
    window.FindReplace.init();

    // 4. Templates
    window.Templates.init();

    // 5. Stats/Analysis panel
    window.StatsPanel.init();

    // 6. Focus the editor
    setTimeout(() => window.quill.focus(), 100);

    // Dev mode hint
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      console.log(
        '%cDocPDF%c Ready — v2.0',
        'color:#1a73e8;font-weight:700;font-size:16px',
        'color:#34a853;font-weight:600;font-size:14px'
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
