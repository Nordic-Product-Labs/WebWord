/* ================================================================
   findreplace.js — Find & Replace bar with keyboard navigation
   ================================================================ */

(function () {
  'use strict';

  let matches         = [];
  let currentIdx      = -1;
  let lastSearchTerm  = '';
  let lastCaseSens    = false;
  let replacing = false;
  let searchTimer;

  // ── Helpers ───────────────────────────────────────────────────
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ── Clear only the find-bar's own highlights, restoring any pre-existing ones ──
  function clearHighlights() {
    window.CSS?.highlights?.delete('find-matches');
    window.CSS?.highlights?.delete('find-current');
  }

  // ── Find all occurrences and highlight them ───────────────────
  function findAll(term, caseSensitive, navigate = true) {
    clearHighlights();
    matches     = [];
    currentIdx  = -1;
    lastSearchTerm = term;
    lastCaseSens = caseSensitive;

    if (!term || !window.quill) {
      updateCounter();
      return;
    }

    lastSearchTerm = term;
    lastCaseSens   = caseSensitive;

    // Embeds occupy one Quill index even though getText() omits them.
    const text = window.quill.getContents().ops.map(op =>
      typeof op.insert === 'string' ? op.insert : '\uFFFC').join('');
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

    if (matches.length > 0) {
      currentIdx = 0;
      highlightCurrent();
      if (navigate) scrollToCurrent();
    }

    updateCounter();
  }

  // ── Highlight current match in orange ────────────────────────
  function highlightCurrent() {
    if (!window.CSS?.highlights || !window.Highlight) return;
    const all = new Highlight();
    const current = new Highlight();
    matches.forEach((m, i) => {
      const [start, startOffset] = window.quill.getLeaf(m.index + 1);
      const [end, endOffset] = window.quill.getLeaf(m.index + m.length);
      if (start?.domNode.nodeType !== 3 || end?.domNode.nodeType !== 3) return;
      const range = document.createRange();
      range.setStart(start.domNode, Math.max(0, startOffset - 1));
      range.setEnd(end.domNode, endOffset);
      all.add(range);
      if (i === currentIdx) current.add(range);
    });
    CSS.highlights.set('find-matches', all);
    CSS.highlights.set('find-current', current);
  }

  // ── Scroll editor to current match ───────────────────────────
  function scrollToCurrent() {
    if (!matches[currentIdx]) return;
    const m = matches[currentIdx];
    const active = document.activeElement;
    window.quill.setSelection(m.index, m.length, 'silent');
    if (document.getElementById('find-replace-bar')?.contains(active)) active.focus({ preventScroll: true });

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

    replaceMatches([m], replacement);

    // Re-search after replacement
    const term = document.getElementById('find-input')?.value || '';
    findAll(term, document.getElementById('case-sensitive-cb')?.checked);
  }

  function replaceAll() {
    if (matches.length === 0 || !lastSearchTerm) return;
    const replacement = document.getElementById('replace-input')?.value || '';
    const count       = matches.length;

    // Replace from back to front to preserve indices
    replaceMatches(matches, replacement);

    matches    = [];
    currentIdx = -1;
    clearHighlights();
    updateCounter();
    window.showToast(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}`, 'success');
  }

  function replaceMatches(items, replacement) {
    clearTimeout(searchTimer);
    clearHighlights();
    const Delta = Quill.import('delta');
    let delta = new Delta();
    let cursor = 0;
    items.forEach(m => {
      delta = delta.retain(m.index - cursor).delete(m.length);
      if (replacement) delta = delta.insert(replacement, window.quill.getFormat(m.index, 1));
      cursor = m.index + m.length;
    });
    replacing = true;
    try {
      window.quill.history.cutoff();
      window.quill.updateContents(delta, 'user');
      window.quill.history.cutoff();
    } finally { replacing = false; }
  }

  // ── Update match counter display ──────────────────────────────
  function updateCounter() {
    ['find-prev-btn', 'find-next-btn', 'replace-one-btn', 'replace-all-btn'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = matches.length === 0;
    });
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
          findAll(selectedText, document.getElementById('case-sensitive-cb')?.checked);
        }
      }
    }

    // Adjust page-area top margin to make room
    const pageArea = document.getElementById('page-area');
    if (pageArea) pageArea.classList.add('has-find-bar');
    findAll(document.getElementById('find-input')?.value || '', document.getElementById('case-sensitive-cb')?.checked);

    setTimeout(() => document.getElementById('find-input')?.focus(), 50);
  }

  function close() {
    clearTimeout(searchTimer);
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
    updateCounter();
    window.quill.on('text-change', () => {
      if (replacing || document.getElementById('find-replace-bar')?.classList.contains('hidden')) return;
      clearHighlights();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => findAll(lastSearchTerm, lastCaseSens, false), 100);
    });
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
