/* ================================================================
   ui.js — Toolbar wiring, keyboard shortcuts, word count,
           zoom, theme toggle, new-document modal
   ================================================================ */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  /** Show a brief toast notification */
  window.showToast = function (message, type = 'info', duration = 3000) {
    const icons = {
      success: 'fa-check-circle',
      error:   'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info:    'fa-info-circle',
    };
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = document.createElement('i');
    icon.className = `fas ${icons[type] || icons.info}`;
    icon.setAttribute('aria-hidden', 'true');
    toast.append(icon, document.createTextNode(' ' + message));
    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    return toast;
  };

  // ─────────────────────────────────────────────────────────────
  // Toolbar — format toggle helpers
  // ─────────────────────────────────────────────────────────────

  function toggleFormat(format) {
    const current = window.quill.getFormat();
    window.quill.format(format, !current[format], 'user');
  }

  function setFormat(format, value) {
    window.quill.format(format, value, 'user');
  }

  // ─────────────────────────────────────────────────────────────
  // Toolbar — update active states from current selection
  // ─────────────────────────────────────────────────────────────

  function syncToolbarToFormats(formats) {
    // Toggle buttons
    const toggleBtns = {
      'btn-bold':       'bold',
      'btn-italic':     'italic',
      'btn-underline':  'underline',
      'btn-strike':     'strike',
      'btn-blockquote': 'blockquote',
      'btn-code-block': 'code-block',
    };
    Object.entries(toggleBtns).forEach(([id, fmt]) => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.toggle('active', !!formats[fmt]);
    });

    // Alignment buttons
    const align = formats.align || '';
    document.getElementById('btn-align-left')?.classList.toggle('active',    align === '');
    document.getElementById('btn-align-center')?.classList.toggle('active',  align === 'center');
    document.getElementById('btn-align-right')?.classList.toggle('active',   align === 'right');
    document.getElementById('btn-align-justify')?.classList.toggle('active', align === 'justify');

    // List buttons
    const list = formats.list || '';
    document.getElementById('btn-list-ordered')?.classList.toggle('active', list === 'ordered');
    document.getElementById('btn-list-bullet')?.classList.toggle('active',  list === 'bullet');

    // Heading select
    const headingSel = document.getElementById('heading-select');
    if (headingSel) {
      headingSel.value = formats.header ? String(formats.header) : '';
    }

    // Font select
    const fontSel = document.getElementById('font-select');
    if (fontSel) {
      const font = formats['font'] || 'Inter';
      const match = [...fontSel.options].find(o => o.value === font);
      if (match) fontSel.value = font;
    }

    // Size select
    const sizeSel = document.getElementById('size-select');
    if (sizeSel) {
      const size = formats['size'] || '12pt';
      const match = [...sizeSel.options].find(o => o.value === size);
      if (match) sizeSel.value = size;
    }

    // Color bars
    if (formats.color) {
      const bar = document.getElementById('text-color-bar');
      const input = document.getElementById('text-color-input');
      if (bar)   bar.style.background = formats.color;
      if (input) input.value = rgbToHex(formats.color) || formats.color;
    }
    if (formats.background) {
      const bar = document.getElementById('bg-color-bar');
      const input = document.getElementById('bg-color-input');
      if (bar)   bar.style.background = formats.background;
      if (input) input.value = rgbToHex(formats.background) || formats.background;
    }
  }

  /** Convert CSS rgb()/rgba() string to #rrggbb hex */
  function rgbToHex(color) {
    if (!color) return color;
    if (color.startsWith('#')) return color;
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return color;
    return '#' + [m[1], m[2], m[3]]
      .map(n => parseInt(n, 10).toString(16).padStart(2, '0'))
      .join('');
  }

  // ─────────────────────────────────────────────────────────────
  // Word / Character count
  // ─────────────────────────────────────────────────────────────

  function updateWordCount() {
    const text  = window.quill.getText();
    const clean = text.trim();
    const words = clean.length > 0
      ? clean.split(/\s+/).filter(w => w.length > 0).length
      : 0;
    const chars = Math.max(0, text.length - 1); // -1 trailing newline

    const wEl = document.getElementById('word-count');
    const cEl = document.getElementById('char-count');
    if (wEl) wEl.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    if (cEl) cEl.textContent = `${chars.toLocaleString()} character${chars !== 1 ? 's' : ''}`;
  }
  // Expose so restore paths (autosave, template load, etc.) can force a refresh
  // even when they use `silent` Quill mutations that don't fire text-change.
  window.updateWordCount = updateWordCount;

  // ─────────────────────────────────────────────────────────────
  // Zoom
  // ─────────────────────────────────────────────────────────────

  function applyZoom(scale) {
    const canvas = document.getElementById('page-canvas');
    if (!canvas) return;
    canvas.style.transform       = `scale(${scale})`;
    canvas.style.transformOrigin = 'top center';

    const pageArea = document.getElementById('page-area');
    if (!pageArea) return;

    if (scale > 1) {
      pageArea.style.overflowX = 'auto';
      // offsetHeight may be 0 before layout — defer padding adjustment one frame
      const setBottom = () => {
        const h = canvas.offsetHeight;
        if (h > 0) {
          pageArea.style.paddingBottom = `${(scale - 1) * h + 40}px`;
        } else {
          requestAnimationFrame(setBottom);
        }
      };
      setBottom();
    } else {
      pageArea.style.paddingBottom = '40px';
      pageArea.style.overflowX = '';
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Dark / Light theme
  // ─────────────────────────────────────────────────────────────

  function setTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = dark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    try { localStorage.setItem('docpdf_theme', dark ? 'dark' : 'light'); } catch (_) {}
  }

  function loadTheme() {
    let saved;
    try { saved = localStorage.getItem('docpdf_theme'); } catch (_) {}
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(saved ? saved === 'dark' : prefersDark);
  }

  // ─────────────────────────────────────────────────────────────
  // New Document modal
  // ─────────────────────────────────────────────────────────────

  function openNewDocModal() {
    document.getElementById('new-doc-modal')?.classList.remove('hidden');
  }

  function closeNewDocModal() {
    document.getElementById('new-doc-modal')?.classList.add('hidden');
  }

  function confirmNewDoc() {
    window.FindReplace?.close();
    // Tear down any floating image toolbar bound to the doc we're about to replace
    hideImageTools();
    dragImageIndex = null;
    savedRange = null;

    window.quill.setContents([], 'silent');
    window.quill.history.clear();
    window.PagePagination?.refresh?.();
    const titleInput = document.getElementById('doc-title');
    if (titleInput) titleInput.value = 'Untitled Document';
    window.AutoSave.clear();
    updateWordCount();
    closeNewDocModal();
    window.quill.focus();
    // Refresh analysis panel so it doesn't show stale previous-doc data
    if (window.StatsPanel) window.StatsPanel.refresh();
    window.showToast('New document created', 'info');
  }

  // ─────────────────────────────────────────────────────────────
  // Link dialog
  // ─────────────────────────────────────────────────────────────

  let savedRange = null;

  let imageInputEl = null;
  let imageToolsEl = null;
  let activeImage = null;
  let dragImageIndex = null;

  function openLinkModal() {
    // Save selection before focus leaves the editor
    savedRange = window.quill.getSelection();
    const existing = savedRange ? window.quill.getFormat(savedRange).link : null;
    const input = document.getElementById('link-url-input');
    if (input) input.value = existing || '';
    document.getElementById('link-modal')?.classList.remove('hidden');
    setTimeout(() => input?.focus(), 50);
  }

  function closeLinkModal() {
    document.getElementById('link-modal')?.classList.add('hidden');
    savedRange = null;
  }

  function confirmLink() {
    const url = document.getElementById('link-url-input')?.value.trim();
    // Block obviously-unsafe URLs before writing them into the doc
    if (url && /^\s*javascript:/i.test(url)) {
      window.showToast('That link protocol is not allowed', 'warning');
      return;
    }
    if (url && savedRange) {
      window.quill.setSelection(savedRange, 'silent');
      if (savedRange.length === 0) {
        // No selection — insert URL as text link
        window.quill.insertText(savedRange.index, url, 'link', url, 'user');
      } else {
        window.quill.formatText(savedRange.index, savedRange.length, 'link', url, 'user');
      }
    } else if (!url && savedRange) {
      // Remove link
      window.quill.formatText(savedRange.index, savedRange.length, 'link', false, 'user');
    }
    savedRange = null;
    closeLinkModal();
  }


  // ─────────────────────────────────────────────────────────────
  // Image tools: insert, resize, align, move
  // ─────────────────────────────────────────────────────────────

  function clampImageWidth(v) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return 75;
    return Math.max(15, Math.min(100, n));
  }

  function getImageContext(img) {
    if (!img) return null;
    const blot = Quill.find(img, true) || Quill.find(img);
    if (!blot || blot.statics?.blotName !== 'image') return null;
    return { img, index: blot.offset(window.quill.scroll) };
  }

  function normalizeImageNode(img) {
    if (!img) return;
    img.classList.add('doc-image');
    img.setAttribute('draggable', 'true');

    const width = clampImageWidth(img.getAttribute('data-image-width') || '75');
    const align = ['left','center','right'].includes(img.getAttribute('data-image-align'))
      ? img.getAttribute('data-image-align')
      : 'center';

    img.setAttribute('data-image-width', String(width));
    img.setAttribute('data-image-align', align);
    img.style.width = width + '%';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';

    if (align === 'left') img.style.margin = '0.8em auto 0.8em 0';
    else if (align === 'right') img.style.margin = '0.8em 0 0.8em auto';
    else img.style.margin = '0.8em auto';
  }

  function normalizeAllImages() {
    document.querySelectorAll('.ql-editor img').forEach(normalizeImageNode);
  }

  function hideImageTools() {
    if (activeImage) activeImage.removeAttribute('data-image-selected');
    activeImage = null;
    imageToolsEl?.classList.add('hidden');
  }

  function positionImageTools(img) {
    if (!imageToolsEl || !img) return;
    const rect = img.getBoundingClientRect();
    const toolbarHeight = imageToolsEl.offsetHeight || 44;
    let top = rect.top - toolbarHeight - 8;
    if (top < 8) top = rect.bottom + 8;
    const left = Math.min(window.innerWidth - imageToolsEl.offsetWidth - 8, Math.max(8, rect.left));
    imageToolsEl.style.top = top + 'px';
    imageToolsEl.style.left = left + 'px';
  }

  function syncImageTools(img) {
    if (!imageToolsEl || !img) return;
    const width = clampImageWidth(img.getAttribute('data-image-width') || '75');
    const align = img.getAttribute('data-image-align') || 'center';

    const size = imageToolsEl.querySelector('#image-size-range');
    const label = imageToolsEl.querySelector('#image-size-label');
    if (size) size.value = String(width);
    if (label) label.textContent = width + '%';

    imageToolsEl.querySelectorAll('[data-image-align]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-image-align') === align);
    });
  }

  function showImageTools(img) {
    if (!img) return;
    normalizeImageNode(img);
    if (activeImage && activeImage !== img) activeImage.removeAttribute('data-image-selected');
    activeImage = img;
    activeImage.setAttribute('data-image-selected', 'true');

    const ctx = getImageContext(img);
    // Only sync Quill's selection when the editor already owns focus — otherwise
    // clicking an image while a modal input is focused steals focus back.
    if (ctx && window.quill.hasFocus()) {
      window.quill.setSelection(ctx.index, 1, 'silent');
    }

    imageToolsEl?.classList.remove('hidden');
    syncImageTools(img);
    positionImageTools(img);
  }

  function ensureImageInput() {
    if (imageInputEl && document.body.contains(imageInputEl)) return imageInputEl;
    imageInputEl = document.createElement('input');
    imageInputEl.type = 'file';
    imageInputEl.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
    imageInputEl.style.display = 'none';
    document.body.appendChild(imageInputEl);
    imageInputEl.addEventListener('change', handleImageFileChange);
    return imageInputEl;
  }

  function handleImageFileChange() {
    const file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.showToast('Please choose a valid image file', 'warning');
      return;
    }
    const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_IMAGE_BYTES) {
      window.showToast('Image too large — please use one under 2 MB', 'warning', 4000);
      return;
    }

    const reader = new FileReader();
    reader.onerror = function () {
      window.showToast('Could not read that image file', 'error');
    };
    reader.onload = function () {
      const q = window.quill;
      if (!q) return;
      const range = q.getSelection(true) || { index: q.getLength(), length: 0 };
      q.insertEmbed(range.index, 'image', { src: reader.result, width: '75', align: 'center' }, 'user');
      q.insertText(range.index + 1, '\n', 'user');
      q.setSelection(range.index + 2, 0, 'user');
      normalizeAllImages();
      window.showToast('Image inserted', 'success');
    };
    reader.readAsDataURL(file);
  }

  function initImageTools() {
    // File input for the "insert image" button. Created immediately so the
    // toolbar button works regardless of any later init order changes.
    ensureImageInput();

    imageToolsEl = document.createElement('div');
    imageToolsEl.id = 'image-tools';
    imageToolsEl.className = 'image-tools hidden';
    imageToolsEl.innerHTML = `
      <button class="toolbar-btn" type="button" data-image-align="left" title="Align left"><i class="fas fa-align-left"></i></button>
      <button class="toolbar-btn" type="button" data-image-align="center" title="Align center"><i class="fas fa-align-center"></i></button>
      <button class="toolbar-btn" type="button" data-image-align="right" title="Align right"><i class="fas fa-align-right"></i></button>
      <input id="image-size-range" class="image-size-input" type="range" min="15" max="100" step="1" value="75" title="Image width">
      <span id="image-size-label" class="image-size-label">75%</span>
      <button class="toolbar-btn" type="button" id="image-delete-btn" title="Delete image"><i class="fas fa-trash"></i></button>
    `;
    document.body.appendChild(imageToolsEl);

    // normalize pre-existing/pasted images
    normalizeAllImages();

    imageToolsEl.addEventListener('click', function (e) {
      e.stopPropagation();
      const alignBtn = e.target.closest('[data-image-align]');
      if (alignBtn && activeImage) {
        const ctx = getImageContext(activeImage);
        if (!ctx) return;
        const align = alignBtn.getAttribute('data-image-align');
        window.quill.formatText(ctx.index, 1, 'imageAlign', align, 'user');
        activeImage.setAttribute('data-image-align', align);
        syncImageTools(activeImage);
        positionImageTools(activeImage);
        return;
      }

      if (e.target.closest('#image-delete-btn') && activeImage) {
        const ctx = getImageContext(activeImage);
        if (!ctx) return;
        window.quill.deleteText(ctx.index, 1, 'user');
        hideImageTools();
      }
    });

    imageToolsEl.querySelector('#image-size-range')?.addEventListener('input', function () {
      if (!activeImage) return;
      const width = clampImageWidth(this.value);
      const ctx = getImageContext(activeImage);
      if (!ctx) return;
      window.quill.formatText(ctx.index, 1, 'imageWidth', String(width), 'user');
      activeImage.setAttribute('data-image-width', String(width));
      const label = imageToolsEl.querySelector('#image-size-label');
      if (label) label.textContent = width + '%';
      positionImageTools(activeImage);
    });

    // Image click/select — bind on the document in the CAPTURE phase so it
    // always fires before Quill's own click handling, and works even if the
    // editor's DOM gets re-mounted. We check editor containment explicitly.
    document.addEventListener('click', function (e) {
      const t = e.target;
      const editorEl = window.quill && window.quill.root;
      if (!editorEl) return;

      // Ignore clicks inside our own floating image toolbar
      if (t && t.closest && t.closest('#image-tools')) return;

      // A click on an <img> inside the editor selects that image
      if (t && t.tagName === 'IMG' && editorEl.contains(t)) {
        e.preventDefault();
        showImageTools(t);
        return;
      }

      // Any other click outside an editor image hides the tools
      if (activeImage) hideImageTools();
    }, true);

    // Reposition on resize/scroll
    window.addEventListener('resize', function () { if (activeImage) positionImageTools(activeImage); });
    document.addEventListener('scroll', function () { if (activeImage) positionImageTools(activeImage); }, true);

    // Drag-and-drop reorder images inside the editor
    window.quill.root?.addEventListener('dragstart', function (e) {
      const img = e.target.closest('.ql-editor img');
      if (!img) return;
      const ctx = getImageContext(img);
      if (!ctx) return;
      dragImageIndex = ctx.index;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'doc-image'); } catch (_) {}
    });

    window.quill.root?.addEventListener('dragover', function (e) {
      if (dragImageIndex === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    window.quill.root?.addEventListener('drop', function (e) {
      if (dragImageIndex === null) return;
      e.preventDefault();

      const q = window.quill;
      const srcDelta = q.getContents(dragImageIndex, 1);
      const op = srcDelta?.ops?.[0] || null;
      if (!op || !op.insert || !op.insert.image) {
        dragImageIndex = null;
        return;
      }

      const sourceValue = op.insert.image;
      const sourceFormats = q.getFormat(dragImageIndex, 1);

      let dropIndex = q.getLength() - 1;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const hitBlot = hit ? Quill.find(hit, true) : null;
      if (hitBlot) {
        dropIndex = hitBlot.offset(q.scroll);
      }

      // Dropping the image on itself is a no-op.
      if (dropIndex === dragImageIndex) {
        dragImageIndex = null;
        return;
      }

      if (dropIndex > dragImageIndex) dropIndex -= 1;

      q.deleteText(dragImageIndex, 1, 'user');
      q.insertEmbed(dropIndex, 'image', sourceValue, 'user');

      if (sourceFormats.imageWidth) q.formatText(dropIndex, 1, 'imageWidth', sourceFormats.imageWidth, 'user');
      if (sourceFormats.imageAlign) q.formatText(dropIndex, 1, 'imageAlign', sourceFormats.imageAlign, 'user');

      q.setSelection(dropIndex + 1, 0, 'silent');
      dragImageIndex = null;
      window.showToast('Image moved', 'info', 1200);
    });

    window.quill.root?.addEventListener('dragend', function () {
      dragImageIndex = null;
    });
  }

  function openImagePicker() {
    // Lazy-init: works even if initImageTools hasn't run for any reason
    ensureImageInput().click();
  }

  // ─────────────────────────────────────────────────────────────
  // Bind all toolbar buttons
  // ─────────────────────────────────────────────────────────────

  function bindToolbar() {
    const q = window.quill;

    // ── Simple toggles
    document.getElementById('btn-bold')?.addEventListener('click', () => toggleFormat('bold'));
    document.getElementById('btn-italic')?.addEventListener('click', () => toggleFormat('italic'));
    document.getElementById('btn-underline')?.addEventListener('click', () => toggleFormat('underline'));
    document.getElementById('btn-strike')?.addEventListener('click', () => toggleFormat('strike'));
    document.getElementById('btn-blockquote')?.addEventListener('click', () => toggleFormat('blockquote'));
    document.getElementById('btn-code-block')?.addEventListener('click', () => toggleFormat('code-block'));

    // ── Alignment
    document.getElementById('btn-align-left')?.addEventListener('click', () => setFormat('align', false));
    document.getElementById('btn-align-center')?.addEventListener('click', () => setFormat('align', 'center'));
    document.getElementById('btn-align-right')?.addEventListener('click', () => setFormat('align', 'right'));
    document.getElementById('btn-align-justify')?.addEventListener('click', () => setFormat('align', 'justify'));

    // ── Lists
    document.getElementById('btn-list-ordered')?.addEventListener('click', () => {
      const fmt = q.getFormat();
      setFormat('list', fmt.list === 'ordered' ? false : 'ordered');
    });
    document.getElementById('btn-list-bullet')?.addEventListener('click', () => {
      const fmt = q.getFormat();
      setFormat('list', fmt.list === 'bullet' ? false : 'bullet');
    });

    // ── Indent
    document.getElementById('btn-indent-in')?.addEventListener('click', () => setFormat('indent', '+1'));
    document.getElementById('btn-indent-out')?.addEventListener('click', () => setFormat('indent', '-1'));

    // ── Heading select
    document.getElementById('heading-select')?.addEventListener('change', function () {
      const val = this.value;
      setFormat('header', val ? parseInt(val, 10) : false);
      q.focus();
    });

    // ── Font select
    document.getElementById('font-select')?.addEventListener('change', function () {
      setFormat('font', this.value || false);
      q.focus();
    });

    // ── Size select
    document.getElementById('size-select')?.addEventListener('change', function () {
      setFormat('size', this.value || false);
      q.focus();
    });

    // ── Text color
    const textColorBtn   = document.getElementById('btn-text-color');
    const textColorInput = document.getElementById('text-color-input');
    textColorBtn?.addEventListener('click', () => textColorInput?.click());
    textColorInput?.addEventListener('input', function () {
      setFormat('color', this.value);
      const bar = document.getElementById('text-color-bar');
      if (bar) bar.style.background = this.value;
    });

    // ── Background / Highlight color
    const bgColorBtn   = document.getElementById('btn-bg-color');
    const bgColorInput = document.getElementById('bg-color-input');
    bgColorBtn?.addEventListener('click', () => bgColorInput?.click());
    bgColorInput?.addEventListener('input', function () {
      setFormat('background', this.value);
      const bar = document.getElementById('bg-color-bar');
      if (bar) bar.style.background = this.value;
    });

    // ── Link
    document.getElementById('btn-link')?.addEventListener('click', openLinkModal);
    document.getElementById('btn-image')?.addEventListener('click', openImagePicker);
    document.getElementById('link-cancel')?.addEventListener('click', closeLinkModal);
    document.getElementById('link-confirm')?.addEventListener('click', confirmLink);
    document.getElementById('link-url-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); confirmLink(); }
      if (e.key === 'Escape') closeLinkModal();
    });

    // ── Horizontal Rule
    document.getElementById('btn-hr')?.addEventListener('click', () => {
      const range = q.getSelection(true);
      if (!range) return;
      q.insertText(range.index, '\n', 'user');
      q.insertEmbed(range.index + 1, 'hr', true, 'user');
      q.insertText(range.index + 2, '\n', 'user');
      q.setSelection(range.index + 3, 0, 'user');
    });

    // ── Clear formatting
    document.getElementById('btn-clear-format')?.addEventListener('click', () => {
      const range = q.getSelection();
      if (range && range.length > 0) {
        q.removeFormat(range.index, range.length, 'user');
      }
    });

    // ── Undo / Redo
    document.getElementById('btn-undo')?.addEventListener('click', () => q.history.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => q.history.redo());
  }

  // ─────────────────────────────────────────────────────────────
  // Register Quill HR blot
  // ─────────────────────────────────────────────────────────────

  function registerHRBlot() {
    // Already registered in editor.js — nothing to do here
  }

  // ─────────────────────────────────────────────────────────────
  // Focus Mode
  // ─────────────────────────────────────────────────────────────

  let focusModeOn = false;

  function toggleFocusMode() {
    focusModeOn = !focusModeOn;
    document.body.classList.toggle('focus-mode', focusModeOn);
    const btn = document.getElementById('focus-mode-btn');
    if (btn) {
      btn.innerHTML = focusModeOn
        ? '<i class="fas fa-compress"></i>'
        : '<i class="fas fa-expand"></i>';
      btn.title = focusModeOn ? 'Exit focus mode (F11)' : 'Focus mode (F11)';
    }
    window.showToast(focusModeOn ? 'Focus mode on — hover edges to reveal UI' : 'Focus mode off', 'info', 2000);
  }

  // ─────────────────────────────────────────────────────────────
  // Export dropdown
  // ─────────────────────────────────────────────────────────────

  // Sanitize document title into a safe filename (mirrors export.js getFilename)
  function getSafeFilename() {
    const raw = document.getElementById('doc-title')?.value || 'Untitled_Document';
    return raw.trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 80) || 'document';
  }

    function exportTXT() {
    try {
      const filename = getSafeFilename() + '.txt';
      const text     = window.quill.getText();
      const blob     = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url      = URL.createObjectURL(blob);
      const a        = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      window.showToast('Plain text file downloaded', 'success');
    } catch (err) {
      console.error('TXT export error:', err);
      window.showToast('Could not export text file', 'error');
    }
  }

  function exportHTML() {
    try {
      const filename  = getSafeFilename() + '.html';
      const safeTitle = escapeHtml(document.getElementById('doc-title')?.value || 'document');
      const rawContent = document.querySelector('.ql-editor')?.innerHTML || '';
      const content    = window.ExportPDF?.sanitizeHtml
        ? window.ExportPDF.sanitizeHtml(rawContent)
        : rawContent;
      const html      = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<style>
  body { font-family: Inter, -apple-system, sans-serif; max-width: 794px; margin: 40px auto; padding: 0 40px; line-height: 1.7; color: #202124; }
  h1,h2,h3,h4 { margin: 1em 0 0.4em; }
  blockquote { border-left: 4px solid #1a73e8; margin: 1em 0; padding: 0.6em 1.2em; color: #5f6368; font-style: italic; }
  pre { background: #1e1e2e; color: #cdd6f4; padding: 16px; border-radius: 8px; overflow-x: auto; }
  a { color: #1a73e8; }
</style>
</head>
<body>${content}</body>
</html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      window.showToast('HTML file downloaded', 'success');
    } catch (err) {
      console.error('HTML export error:', err);
      window.showToast('Could not export HTML file', 'error');
    }
  }

  function bindExportDropdown() {
    const btn     = document.getElementById('export-pdf-btn');
    const menu    = document.getElementById('export-menu');

    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      menu?.classList.toggle('hidden');
    });

    document.addEventListener('click', () => menu?.classList.add('hidden'));
    menu?.addEventListener('click', e => e.stopPropagation());

    document.getElementById('export-pdf-item')?.addEventListener('click', () => {
      menu?.classList.add('hidden');
      window.ExportPDF.export();
    });
    document.getElementById('export-txt-item')?.addEventListener('click', () => {
      menu?.classList.add('hidden');
      exportTXT();
    });
    document.getElementById('export-html-item')?.addEventListener('click', () => {
      menu?.classList.add('hidden');
      exportHTML();
    });
    document.getElementById('print-btn')?.addEventListener('click', () => {
      menu?.classList.add('hidden');
      window.ExportPDF.print();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Keyboard shortcuts
  // ─────────────────────────────────────────────────────────────

  function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      // F11 = focus mode
      if (e.key === 'F11') { e.preventDefault(); toggleFocusMode(); return; }
      if (e.key === 'Escape' && focusModeOn) { toggleFocusMode(); return; }

      if (!e.ctrlKey && !e.metaKey) return;

      // Don't hijack shortcuts while the user is typing in a non-editor input.
      // The Quill editor (contenteditable) still gets shortcuts; native <input>/
      // <textarea> (title bar, link URL, find, replace, etc.) do not.
      const ae = document.activeElement;
      if (ae) {
        const tag = ae.tagName;
        const inEditor = ae.classList && ae.classList.contains('ql-editor');
        if (!inEditor && (tag === 'INPUT' || tag === 'TEXTAREA' || ae.isContentEditable)) {
          return;
        }
      }

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          document.dispatchEvent(new CustomEvent('doc:save'));
          break;
        case 'e':
          e.preventDefault();
          window.ExportPDF.export();
          break;
        case 'p':
          e.preventDefault();
          window.ExportPDF.print();
          break;
        case 'k':
          e.preventDefault();
          openLinkModal();
          break;
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Public init
  // ─────────────────────────────────────────────────────────────

  window.UI = {
    resetImageTools() {
      hideImageTools();
      dragImageIndex = null;
    },
    init() {
      registerHRBlot();

      // Selection → toolbar sync
      window.quill.on('selection-change', function (range) {
        if (range) syncToolbarToFormats(window.quill.getFormat(range));
      });
      window.quill.on('text-change', function (_delta, _old, source) {
        updateWordCount();
        // Only re-normalize when the user (or a paste) actually changed the DOM.
        // Skipping 'silent'/'api' avoids fighting Quill during find/replace, autosave
        // restore, and format-tinting done by other subsystems.
        if (source === 'user') normalizeAllImages();
        const range = window.quill.getSelection();
        if (range) syncToolbarToFormats(window.quill.getFormat(range));
      });

      // Belt-and-braces: also normalize on any native input event, so images
      // pasted or drag-dropped from other apps get made interactive even if
      // Quill's clipboard module reports a non-user source.
      window.quill.root?.addEventListener('input', function () {
        normalizeAllImages();
      });

      // Image tools first so ensureImageInput() and the click listener are
      // wired before anything else can throw and skip them.
      initImageTools();

      bindToolbar();
      bindKeyboard();
      bindExportDropdown();

      // Find button in toolbar
      document.getElementById('btn-find')?.addEventListener('click', () => window.FindReplace?.open());

      // Zoom
      document.getElementById('zoom-select')?.addEventListener('change', function () {
        applyZoom(parseFloat(this.value));
      });

      // Theme
      loadTheme();
      document.getElementById('theme-toggle')?.addEventListener('click', function () {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        setTheme(!isDark);
      });

      // Focus mode
      document.getElementById('focus-mode-btn')?.addEventListener('click', toggleFocusMode);

      // New document
      document.getElementById('new-doc-btn')?.addEventListener('click', openNewDocModal);
      document.getElementById('modal-cancel')?.addEventListener('click', closeNewDocModal);
      document.getElementById('modal-confirm')?.addEventListener('click', confirmNewDoc);
      document.getElementById('new-doc-modal')?.addEventListener('click', function (e) {
        if (e.target === this) closeNewDocModal();
      });

      // Grammar refresh button — runs an immediate check (not the 3s debounced one)
      document.getElementById('grammar-refresh-btn')?.addEventListener('click', async () => {
        const text = window.quill.getText();
        window.showToast('Checking grammar…', 'info', 2000);
        window.StatsPanel?.open();
        // Cancel any pending debounced check so its stale result doesn't overwrite ours.
        window.Analysis?.cancelGrammarCheck();
        const issues = await window.Analysis.checkGrammar(text);
        window.StatsPanel?.renderGrammar(issues);
        const badge = document.getElementById('grammar-status-badge');
        if (badge) {
          badge.textContent = issues.length > 0 ? `${issues.length} issue${issues.length !== 1 ? 's' : ''}` : '✓';
          badge.className   = 'badge ' + (issues.length > 0 ? 'badge-warn' : 'badge-ok');
        }
      });

      // Initial word count
      updateWordCount();
      setTimeout(normalizeAllImages, 250);
      setTimeout(normalizeAllImages, 1000);
    },
  };

  function escapeHtml(str) {
    return (str||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
})();
