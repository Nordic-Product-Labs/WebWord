/* ================================================================
   export.js  —  PDF export (download) + Print
   ================================================================
   Export as PDF uses html2pdf/html2canvas (snapshot-style render).
   Print uses browser-native rendering (best fidelity, vector text).
   ================================================================ */

(function () {
  'use strict';

  function getFilename() {
    const raw = (document.getElementById('doc-title') || {}).value || 'Untitled_Document';
    return raw.trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 80) || 'document';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function raf2() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(resolve); });
    });
  }

  function getOrCreateExportOverlay() {
    let overlay = document.getElementById('pdf-export-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'pdf-export-overlay';
    overlay.className = 'pdf-export-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML =
      '<div class="pdf-export-panel">' +
      '  <div class="pdf-export-spinner" aria-hidden="true"></div>' +
      '  <div class="pdf-export-title">Converting to PDF</div>' +
      '  <div class="pdf-export-subtitle">Optimizing layout and quality…</div>' +
      '</div>';

    document.body.appendChild(overlay);
    return overlay;
  }

  function setExportBusy(isBusy) {
    const ids = ['export-pdf-btn', 'export-pdf-item', 'print-btn', 'export-txt-item', 'export-html-item'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.disabled = !!isBusy;
      el.classList.toggle('is-busy', !!isBusy);
    });

    const overlay = getOrCreateExportOverlay();
    overlay.classList.toggle('visible', !!isBusy);
  }

  // Best-effort sanitizer for the HTML we hand off to the Print blob tab.
  // Uses the browser's own parser (DOMParser) then strips inline event handlers
  // and dangerous protocols. Does NOT try to be as complete as DOMPurify — it is
  // scoped to output Quill produces plus whatever the user may have pasted in.
  function sanitizeEditorHtml(html) {
    try {
      const parsed = new DOMParser().parseFromString('<div id="__root">' + html + '</div>', 'text/html');
      const root = parsed.getElementById('__root');
      if (!root) return '';
      root.querySelectorAll('script, style, iframe, object, embed, meta, link').forEach(n => n.remove());
      root.querySelectorAll('[data-page-flow-padding]').forEach(el => {
        el.style.paddingTop = el.getAttribute('data-page-flow-padding') || '';
        el.removeAttribute('data-page-flow-padding');
      });
      root.querySelectorAll('*').forEach(el => {
        [...el.attributes].forEach(attr => {
          const name = attr.name.toLowerCase();
          const val  = String(attr.value || '');
          if (name.startsWith('on')) el.removeAttribute(attr.name);
          if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(val)) {
            el.removeAttribute(attr.name);
          }
        });
      });
      return root.innerHTML;
    } catch (e) {
      // If parsing fails, refuse to inject; caller will fall back to window.print().
      return '';
    }
  }


  function buildPrintPage(title, bodyHtml) {
    return (
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
      '<meta charset="utf-8"><title>' + escapeHtml(title) + '</title>\n' +
      '<style>\n' +
      '@page{margin:25mm;size:A4 portrait}\n' +
      '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}\n' +
      'html,body{font-family:Arial,Helvetica,sans-serif;font-size:12pt;line-height:1.6;color:#000;background:#fff}\n' +
      'p{margin-bottom:.4em}h1{font-size:24pt;font-weight:700;margin:.4em 0}h2{font-size:18pt;font-weight:700;margin:.4em 0}h3{font-size:14pt;font-weight:700;margin:.4em 0}\n' +
      'blockquote{border-left:4px solid #bbb;padding-left:1em;font-style:italic;margin:.5em 0}\n' +
      'pre{background:#f5f5f5;border:1px solid #ddd;border-radius:3px;padding:.6em .8em;font-family:monospace;font-size:10pt;white-space:pre-wrap;margin:.5em 0}\n' +
      'ol,ul{padding-left:1.8em;margin-bottom:.4em}li{margin-bottom:.2em}\n' +
      'a{color:#1a73e8;text-decoration:underline}strong,b{font-weight:700}em,i{font-style:italic}u{text-decoration:underline}s{text-decoration:line-through}\n' +
      'hr{border:none;border-top:1px solid #bbb;margin:.8em 0}\n' +
      '.ql-align-center{text-align:center}.ql-align-right{text-align:right}.ql-align-justify{text-align:justify}\n' +
      '.ql-indent-1{padding-left:3em}.ql-indent-2{padding-left:6em}.ql-indent-3{padding-left:9em}\n' +
      'img{max-width:100%;height:auto;image-rendering:auto;break-inside:avoid;page-break-inside:avoid}\n' +
      'img[data-image-align="left"]{margin:.8em auto .8em 0}img[data-image-align="right"]{margin:.8em 0 .8em auto}img[data-image-align="center"]{margin:.8em auto}\n' +
      '</style>\n' +
      '</head>\n' +
      '<body onload="window.print()">' + bodyHtml + '</body>\n</html>'
    );
  }

  async function exportPDF() {
    const editor = document.querySelector('.ql-editor');
    if (!editor) { window.showToast('Editor not ready', 'warning'); return; }

    const raw = editor.innerHTML.replace(/<p><br><\/p>/gi, '').trim();
    if (!raw) {
      window.showToast('Nothing to export — write something first!', 'warning');
      return;
    }

    const filename = getFilename() + '.pdf';
    const root = document.documentElement;
    const prevTheme = root.getAttribute('data-theme');
    const prevEditorMinHeight = editor.style.minHeight;
    const busyStart = Date.now();
    const minOverlayMs = 650;

    setExportBusy(true);
    // Force one paint cycle so the overlay is visibly rendered before conversion starts.
    await raf2();

    try {
      root.setAttribute('data-theme', 'light');

      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await raf2();
      // Screen-only page gutters make on-canvas editing clear; the PDF engine
      // paginates the original document itself, so remove those temporary spacers.
      window.PagePagination?.clearFlow?.();
      editor.style.minHeight = '0';

      const opt = {
        margin:      [20, 20, 20, 20],
        filename:    filename,
        image:       { type: 'png', quality: 1 },
        html2canvas: {
          scale:                  4,
          backgroundColor:        '#ffffff',
          useCORS:                true,
          allowTaint:             true,
          logging:                false,
          letterRendering:        true,
          foreignObjectRendering: false,
          imageTimeout:           15000,
          onclone: function (doc) {
            // Only force a clean white page + default black text where NO explicit color
            // is set. We do NOT override user-picked text colors or highlight backgrounds.
            const style = doc.createElement('style');
            style.textContent =
              'html, body { background: #ffffff !important; }' +
              // Reset the app's dark chrome only — never touch .ql-editor content
              '.ql-editor { color: #000000; background: #ffffff !important; min-height: 0 !important; }';
            doc.head.appendChild(style);
            // Neutralize the dark theme flag inside the cloned doc as belt-and-braces
            doc.documentElement.setAttribute('data-theme', 'light');
          },
        },
        jsPDF: {
          unit:        'mm',
          format:      'a4',
          orientation: 'portrait',
          compress:    true,
          precision:   16,
        },
      };

      await html2pdf().set(opt).from(editor).save();
      window.showToast('✓ "' + filename + '" downloaded', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      window.showToast('PDF export failed — use Print → Save as PDF', 'error', 5000);
    } finally {
      if (prevEditorMinHeight) editor.style.minHeight = prevEditorMinHeight;
      else editor.style.removeProperty('min-height');
      window.PagePagination?.refresh?.();
      if (prevTheme) root.setAttribute('data-theme', prevTheme);
      else root.removeAttribute('data-theme');

      const elapsed = Date.now() - busyStart;
      if (elapsed < minOverlayMs) {
        await new Promise(function (resolve) { setTimeout(resolve, minOverlayMs - elapsed); });
      }
      setExportBusy(false);
    }
  }

  function printDocument() {
    const editor = document.querySelector('.ql-editor');
    const title = (document.getElementById('doc-title') || {}).value || 'Untitled Document';

    if (!editor || !editor.innerText.trim()) {
      window.print();
      return;
    }

    const safeBody = sanitizeEditorHtml(editor.innerHTML);
    if (!safeBody) {
      window.print();
      return;
    }

    const page = buildPrintPage(title, safeBody);
    const blob = new Blob([page], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const tab = window.open(url, '_blank');

    if (!tab) {
      window.print();
      URL.revokeObjectURL(url);
      return;
    }

    window.showToast('Print dialog opening in new tab…', 'info', 4000);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  window.ExportPDF = { export: exportPDF, print: printDocument, sanitizeHtml: sanitizeEditorHtml };
})();
