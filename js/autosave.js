/* Browser-local draft persistence. Title and content are committed together. */
(function () {
  'use strict';
  const KEY = 'docpdf_draft';
  let timer;
  let dirty = false;
  let errorShown = false;

  function status(label, state = '') {
    const dot = document.getElementById('indicator-dot');
    const text = document.getElementById('indicator-text');
    if (dot) dot.className = 'indicator-dot ' + state;
    if (text) text.textContent = label;
  }

  function save() {
    clearTimeout(timer);
    try {
      localStorage.setItem(KEY, JSON.stringify({
        version: 1,
        title: document.getElementById('doc-title')?.value || 'Untitled Document',
        delta: window.quill.getContents(),
        savedAt: Date.now(),
      }));
      dirty = false;
      errorShown = false;
      document.title = (document.getElementById('doc-title')?.value.trim() || 'Untitled Document') + ' — WordWeb';
      status('Saved on this device');
      return true;
    } catch (error) {
      dirty = true;
      status('Not saved — export a copy', 'error');
      if (!errorShown) {
        window.showToast?.('This browser could not save your document. Export a copy to keep your work.', 'error', 7000);
        errorShown = true;
      }
      return false;
    }
  }

  function scheduleSave() {
    dirty = true;
    status('Saving…', 'saving');
    clearTimeout(timer);
    timer = setTimeout(save, 1000);
  }

  function forceSave() {
    const saved = save();
    if (saved) window.showToast?.('Document saved on this device', 'success');
    return saved;
  }

  function restore() {
    try {
      const raw = localStorage.getItem(KEY);
      const legacy = raw ? null : localStorage.getItem('docpdf_content');
      if (!raw && !legacy) { status('Ready to write'); return; }
      const draft = raw ? JSON.parse(raw) : {
        delta: JSON.parse(legacy), title: localStorage.getItem('docpdf_title'),
      };
      if (!draft.delta || !Array.isArray(draft.delta.ops) ||
          draft.delta.ops.some(op => !op || !Object.prototype.hasOwnProperty.call(op, 'insert'))) {
        throw new Error('Invalid saved document');
      }
      window.quill.setContents(draft.delta, 'silent');
      const title = document.getElementById('doc-title');
      if (title) title.value = draft.title || 'Untitled Document';
      window.quill.history.clear();
      window.PagePagination?.refresh?.();
      window.updateWordCount?.();
      status('Saved on this device');
      window.showToast?.('Previous document restored', 'info');
    } catch (error) {
      status('Restore unavailable', 'error');
      window.showToast?.('Your saved draft could not be opened. Browser storage may be unavailable.', 'warning', 6000);
    }
  }

  function init() {
    restore();
    window.quill.on('text-change', (_delta, _old, source) => {
      if (source !== 'silent') scheduleSave();
    });
    document.getElementById('doc-title')?.addEventListener('input', scheduleSave);
    document.addEventListener('doc:save', forceSave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && dirty) save();
    });
    window.addEventListener('pagehide', () => { if (dirty) save(); });
    window.addEventListener('beforeunload', event => {
      if (dirty && !save()) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  // Callers reset the editor first; committing the empty draft also prevents
  // older saved content from reappearing after a new document is created.
  window.AutoSave = { init, save: forceSave, flush: save, clear: save, isDirty: () => dirty };
})();
