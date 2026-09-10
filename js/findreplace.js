/* ================================================================
   findreplace.js — Find & Replace bar with keyboard navigation
   ================================================================ */

(function () {
  'use strict';

  let matches         = [];
  let currentIdx      = -1;
  let lastSearchTerm  = '';
  let lastCaseSens    = false;
  // Snapshot of user-set backgrounds per range, so closing Find restores them.
  // Each entry: { index, length, prev } where prev is undefined | color string.
  let priorBg         = [];

  // ── Helpers ───────────────────────────────────────────────────
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ── Clear only the find-bar's own highlights, restoring any pre-existing ones ──
  function clearHighlights() {
    if (!window.quill) return;
    priorBg.forEach(entry => {
      // Restore whatever the user had before we tinted this range (may be undefined = none)
      window.quill.formatText(
        entry.index, entry.length,
        'background', entry.prev || false,
        'silent'
      );
    });
    priorBg = [];
  }

  // ── Find all occurrences and highlight them ───────────────────
  function findAll(term, caseSensitive) {
    clearHighlights();
    matches     = [];
    currentIdx  = -1;

    if (!term || !window.quill) {
      updateCounter();
      return;
    }

    lastSearchTerm = term;
    lastCaseSens   = caseSensitive;

    const text  = window.quill.getText();
    const flags = caseSensitive ? 'g' : 'gi';
    let   re;

    try {
      re = new RegExp(escapeRegex(term), flags);
    } catch {
      updateCounter();
      return;
    }

    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push({ index: m.index, length: m[0].length });
    }

    // Snapshot the user's existing background at each match range BEFORE we tint it,
    // so we can restore it exactly when the Find bar closes.
    matches.forEach(match => {
      const fmt = window.quill.getFormat(match.index, match.length);
      priorBg.push({ index: match.index, length: match.length, prev: fmt.background });
    });

    // Highlight all in pale yellow
    matches.forEach(match => {
      window.quill.formatText(match.index, match.length, 'background', '#fff59d', 'silent');
    });

    if (matches.length > 0) {
      currentIdx = 0;
      highlightCurrent();
      scrollToCurrent();
    }

    updateCounter();
  }

  // ── Highlight current match in orange ────────────────────────
  function highlightCurrent() {
    matches.forEach((m, i) => {
      window.quill.formatText(
        m.index, m.length, 'background',
        i === currentIdx ? '#ffab40' : '#fff59d',
        'silent'
      );
    });
  }

  // ── Scroll editor to current match ───────────────────────────
  function scrollToCurrent() {
    if (!matches[currentIdx]) return;
    const m = matches[currentIdx];
    window.quill.setSelection(m.index, m.length, 'silent');

    try {
      const bounds   = window.quill.getBounds(m.index, m.length);
      const pageArea = document.getElementById('page-area');
      const canvas   = document.getElementById('page-canvas');
      if (pageArea && canvas && bounds) {
        const canvasTop = canvas.getBoundingClientRect().top
          - pageArea.getBoundingClientRect().top
          + pageArea.scrollTop;
        pageArea.scrollTop = canvasTop + bounds.top - pageArea.clientHeight / 3;
      }
    } catch {}
  }

  // ── Navigation ────────────────────────────────────────────────
  function nextMatch() {
    if (matches.length === 0) return;
    currentIdx = (currentIdx + 1) % matches.length;
    highlightCurrent();
    scrollToCurrent();
    updateCounter();
  }

  function prevMatch() {
    if (matches.length === 0) return;
    currentIdx = (currentIdx - 1 + matches.length) % matches.length;
    highlightCurrent();
    scrollToCurrent();
    updateCounter();
  }

  // ── Replace ───────────────────────────────────────────────────
  function replaceCurrent() {
    if (!matches[currentIdx]) return;
    const replacement = document.getElementById('replace-input')?.value || '';
    const m           = matches[currentIdx];

    window.quill.deleteText(m.index, m.length, 'user');
    if (replacement) window.quill.insertText(m.index, replacement, 'user');

    // Re-search after replacement
    const term = document.getElementById('find-input')?.value || '';
    findAll(term, document.getElementById('case-sensitive-cb')?.checked);
  }

  function replaceAll() {
    if (matches.length === 0 || !lastSearchTerm) return;
    const replacement = document.getElementById('replace-input')?.value || '';
    const count       = matches.length;

    // Replace from back to front to preserve indices
    [...matches].reverse().forEach(m => {
      window.quill.deleteText(m.index, m.length, 'user');
      if (replacement) window.quill.insertText(m.index, replacement, 'user');
    });

    matches    = [];
    currentIdx = -1;
    clearHighlights();
    updateCounter();
    window.showToast(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}`, 'success');
  }

  // ── Update match counter display ──────────────────────────────
  function updateCounter() {
    const el = document.getElementById('match-counter');
    if (!el) return;
    if (!lastSearchTerm) {
      el.textContent = '';
      return;
    }
    if (matches.length === 0) {
      el.textContent = 'No results';
      el.style.color = 'var(--danger)';
    } else {
      el.textContent = `${currentIdx + 1} / ${matches.length}`;
      el.style.color = 'var(--text-secondary)';
    }
  }

  // ── Open / Close ──────────────────────────────────────────────
  function open() {
    const bar = document.getElementById('find-replace-bar');
    if (!bar) return;
    bar.classList.remove('hidden');
    bar.setAttribute('aria-hidden', 'false');

    // Pre-fill with selected text if any
    const sel = window.quill?.getSelection();
    if (sel && sel.length > 0) {
      const selectedText = window.quill.getText(sel.index, sel.length).trim();
      if (selectedText && selectedText.length <= 80) {
        const findInput = document.getElementById('find-input');
        if (findInput) {
          findInput.value = selectedText;
          findAll(selectedText, false);
        }
      }
    }

    // Adjust page-area top margin to make room
    const pageArea = document.getElementById('page-area');
    if (pageArea) pageArea.classList.add('has-find-bar');

    setTimeout(() => document.getElementById('find-input')?.focus(), 50);
  }

  function close() {
    const bar = document.getElementById('find-replace-bar');
    if (!bar) return;
    bar.classList.add('hidden');
    bar.setAttribute('aria-hidden', 'true');

    clearHighlights();
    matches    = [];
    currentIdx = -1;
    lastSearchTerm = '';

    const pageArea = document.getElementById('page-area');
    if (pageArea) pageArea.classList.remove('has-find-bar');

    window.quill?.focus();
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    const findInput  = document.getElementById('find-input');
    const replaceCb  = document.getElementById('case-sensitive-cb');

    findInput?.addEventListener('input', function () {
      findAll(this.value, replaceCb?.checked || false);
    });

    findInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prevMatch() : nextMatch(); }
      if (e.key === 'Escape') close();
    });

    document.getElementById('replace-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); replaceCurrent(); }
      if (e.key === 'Escape') close();
    });

    replaceCb?.addEventListener('change', function () {
      findAll(findInput?.value || '', this.checked);
    });

    document.getElementById('find-prev-btn')?.addEventListener('click', prevMatch);
    document.getElementById('find-next-btn')?.addEventListener('click', nextMatch);
    document.getElementById('replace-one-btn')?.addEventListener('click', replaceCurrent);
    document.getElementById('replace-all-btn')?.addEventListener('click', replaceAll);
    document.getElementById('find-close-btn')?.addEventListener('click', close);

    // Ctrl+F / Cmd+F → open
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const ae = document.activeElement;
        if (ae && ae !== document.body) {
          const tag = ae.tagName;
          const inEditor = ae.classList && ae.classList.contains('ql-editor');
          if (!inEditor && (tag === 'INPUT' || tag === 'TEXTAREA' || ae.isContentEditable)) {
            // Let the browser's built-in Find run inside the input, or ignore.
            return;
          }
        }
        e.preventDefault();
        open();
      }
    });

    // Close on overlay click
    document.getElementById('find-replace-bar')?.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
    });
  }

  window.FindReplace = { init, open, close };
})();
