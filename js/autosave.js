/* ================================================================
   autosave.js — localStorage auto-save with debounce & restore
   ================================================================ */

(function () {
  'use strict';

  const STORAGE_KEY_CONTENT = 'docpdf_content';
  const STORAGE_KEY_TITLE   = 'docpdf_title';
  const DEBOUNCE_MS         = 1500;

  let saveTimer = null;
  let isDirty   = false;

  // ── DOM refs (available after HTML is parsed) ─────────────────
  function getIndicatorDot()  { return document.getElementById('indicator-dot'); }
  function getIndicatorText() { return document.getElementById('indicator-text'); }
  function getDocTitle()      { return document.getElementById('doc-title'); }

  // ── Mark as saving (yellow dot + animation) ───────────────────
  function markSaving() {
    const dot  = getIndicatorDot();
    const text = getIndicatorText();
    if (dot)  dot.className  = 'indicator-dot saving';
    if (text) text.textContent = 'Saving…';
  }

  // ── Mark as saved (green dot) ─────────────────────────────────
  function markSaved() {
    const dot  = getIndicatorDot();
    const text = getIndicatorText();
    if (dot)  dot.className  = 'indicator-dot';
    if (text) text.textContent = 'Saved';
    isDirty = false;
  }

  // ── Mark as unsaved (yellow dot, no animation) ────────────────
  function markUnsaved() {
    const dot  = getIndicatorDot();
    const text = getIndicatorText();
    if (dot)  dot.className  = 'indicator-dot saving';
    if (text) text.textContent = 'Unsaved';
    isDirty = true;
  }

  // ── Save to localStorage ──────────────────────────────────────
  function save() {
    try {
      const delta = window.quill.getContents();
      const title = getDocTitle()?.value || 'Untitled Document';
      localStorage.setItem(STORAGE_KEY_CONTENT, JSON.stringify(delta));
      localStorage.setItem(STORAGE_KEY_TITLE, title);
      markSaved();
    } catch (e) {
      console.warn('Auto-save failed:', e);
      const dot  = getIndicatorDot();
      const text = getIndicatorText();
      if (dot)  dot.className  = 'indicator-dot error';
      if (text) text.textContent = 'Save error';
      if (e.name === 'QuotaExceededError') {
        window.showToast?.(
          'Document too large to auto-save — export it now to avoid losing content',
          'error',
          0
        );
      }
    }
  }

  // ── Debounced save ─────────────────────────────────────────────
  function scheduleSave() {
    markSaving();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, DEBOUNCE_MS);
  }

  // ── Force-save immediately (Ctrl+S) ──────────────────────────
  function forceSave() {
    clearTimeout(saveTimer);
    save();
    window.showToast('Document saved', 'success');
  }

  // ── Restore last session from localStorage ───────────────────
  function restore() {
    const raw   = localStorage.getItem(STORAGE_KEY_CONTENT);
    const title = localStorage.getItem(STORAGE_KEY_TITLE);

    if (!raw) return;

    try {
      const delta = JSON.parse(raw);

      // Only restore if there's actual content (not just an empty newline)
      const hasContent = delta && delta.ops && delta.ops.some(op =>
        typeof op.insert === 'string' && op.insert.trim().length > 0
      );

      if (!hasContent) return;

      // Restore title
      const titleInput = getDocTitle();
      if (titleInput && title) titleInput.value = title;

      // Restore content
      window.quill.setContents(delta, 'silent');
      window.quill.history.clear(); // don't let undo go back past restore
      window.PagePagination?.refresh?.();
      markSaved();

      // 'silent' source above suppresses text-change listeners, so the
      // status-bar word/char counter, the stats panel and the AI panel
      // would all stay stuck at 0. Trigger downstream refreshes manually.
      try { window.updateWordCount && window.updateWordCount(); } catch (_) {}
      try { window.StatsPanel && window.StatsPanel.refresh && window.StatsPanel.refresh(); } catch (_) {}

      window.showToast('Previous document restored', 'info');
    } catch (e) {
      console.warn('Restore failed:', e);
    }
  }

  // ── Clear saved data ──────────────────────────────────────────
  function clearStorage() {
    localStorage.removeItem(STORAGE_KEY_CONTENT);
    localStorage.removeItem(STORAGE_KEY_TITLE);
    markSaved();
  }

  // ── Attach Quill listener ─────────────────────────────────────
  function init() {
    window.quill.on('text-change', function (delta, oldDelta, source) {
      if (source === 'user') scheduleSave();
    });

    // Title field changes
    const titleInput = getDocTitle();
    if (titleInput) {
      titleInput.addEventListener('input', scheduleSave);
    }

    // Ctrl+S
    document.addEventListener('doc:save', forceSave);

    // Restore on load
    restore();
  }

  // ── Public API ────────────────────────────────────────────────
  window.AutoSave = { init, save: forceSave, clear: clearStorage, isDirty: () => isDirty };
})();
