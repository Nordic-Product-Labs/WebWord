/* ================================================================
   editor.js — Quill rich text editor initialization
   Registers custom fonts, sizes, HR, and rich image embed formats
   ================================================================ */

(function () {
  'use strict';

  // ── Register HR block embed blot ─────────────────────────────
  const BlockEmbed = Quill.import('blots/block/embed');
  class HrBlot extends BlockEmbed {
    static create() {
      const node = super.create();
      node.setAttribute('style', 'border:none;border-top:2px solid #dadce0;margin:1.5em 0;');
      return node;
    }
  }
  HrBlot.blotName = 'hr';
  HrBlot.tagName  = 'hr';
  Quill.register(HrBlot, true);

  // ── Register custom image blot with width/alignment persistence ─
  const BaseImage = Quill.import('formats/image');

  function clampImageWidth(v) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return 75;
    return Math.max(15, Math.min(100, n));
  }

  function sanitizeImageAlign(v) {
    return ['left', 'center', 'right'].includes(v) ? v : 'center';
  }

  function applyImageLayout(node) {
    const width = clampImageWidth(node.getAttribute('data-image-width') || '75');
    const align = sanitizeImageAlign(node.getAttribute('data-image-align') || 'center');

    node.setAttribute('data-image-width', String(width));
    node.setAttribute('data-image-align', align);

    node.style.width = width + '%';
    node.style.maxWidth = '100%';
    node.style.height = 'auto';
    node.style.display = 'block';

    if (align === 'left') {
      node.style.margin = '0.8em auto 0.8em 0';
    } else if (align === 'right') {
      node.style.margin = '0.8em 0 0.8em auto';
    } else {
      node.style.margin = '0.8em auto';
    }
  }

  class DocImageBlot extends BaseImage {
    static create(value) {
      const src = typeof value === 'string' ? value : (value && value.src) || '';
      const node = super.create(src);
      node.classList.add('doc-image');
      node.setAttribute('draggable', 'true');

      const width = clampImageWidth(value && value.width ? value.width : '75');
      const align = sanitizeImageAlign(value && value.align ? value.align : 'center');
      node.setAttribute('data-image-width', String(width));
      node.setAttribute('data-image-align', align);
      applyImageLayout(node);
      return node;
    }

    static value(node) {
      return {
        src: node.getAttribute('src') || '',
        width: node.getAttribute('data-image-width') || '75',
        align: node.getAttribute('data-image-align') || 'center',
      };
    }

    static formats(node) {
      return {
        imageWidth: node.getAttribute('data-image-width') || '75',
        imageAlign: node.getAttribute('data-image-align') || 'center',
      };
    }

    format(name, value) {
      if (name === 'imageWidth') {
        this.domNode.setAttribute('data-image-width', String(clampImageWidth(value)));
        applyImageLayout(this.domNode);
        return;
      }
      if (name === 'imageAlign') {
        this.domNode.setAttribute('data-image-align', sanitizeImageAlign(value));
        applyImageLayout(this.domNode);
        return;
      }
      super.format(name, value);
    }
  }

  DocImageBlot.blotName = 'image';
  DocImageBlot.tagName = 'img';
  Quill.register(DocImageBlot, true);

  // ── Register custom font families (inline style attributor) ──
  const FontAttributor = Quill.import('attributors/style/font');
  FontAttributor.whitelist = [
    'Inter',
    'Libre Baskerville',
    'Arial',
    'Source Code Pro',
    'Georgia',
    'Times New Roman',
    'Courier New',
    'Verdana',
    'Trebuchet MS',
  ];
  Quill.register(FontAttributor, true);

  // ── Register custom point sizes (inline style attributor) ────
  const SizeAttributor = Quill.import('attributors/style/size');
  SizeAttributor.whitelist = [
    '8pt', '9pt', '10pt', '11pt', '12pt',
    '14pt', '16pt', '18pt', '24pt', '30pt',
    '36pt', '48pt', '60pt', '72pt',
  ];
  Quill.register(SizeAttributor, true);

  // ── Initialize Quill ─────────────────────────────────────────
  const quill = new Quill('#editor-container', {
    theme: 'snow',
    placeholder: 'Start typing your document…',
    modules: {
      toolbar: false,           // use our custom toolbar
      history: {
        delay: 1000,
        maxStack: 200,
        userOnly: true,
      },
      // Ctrl+S is handled exclusively by ui.js bindKeyboard()
    },
  });

  // Set default font size on the container so new text inherits it
  quill.root.style.fontSize = '12pt';
  quill.root.style.fontFamily = 'Inter, sans-serif';
  quill.root.style.lineHeight = '1.7';

  let paginationFrame = null;
  let activePage = 1;
  let lastLayoutSignature = '';

  function parsePx(value, fallback) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function syncPaperMetrics(canvas) {
    const rootStyles = window.getComputedStyle(document.documentElement);
    const baseWidth = parsePx(rootStyles.getPropertyValue('--page-width'), 794);
    const baseHeight = parsePx(rootStyles.getPropertyValue('--page-height'), 1123);
    const basePadding = parsePx(rootStyles.getPropertyValue('--page-padding'), 72);
    const visibleWidth = canvas.clientWidth || baseWidth;
    const scale = Math.min(1, visibleWidth / baseWidth);

    canvas.style.setProperty('--page-height', Math.round(baseHeight * scale) + 'px');
    canvas.style.setProperty('--page-padding', Math.max(20, Math.round(basePadding * scale)) + 'px');
  }

  function pageMetrics(canvas) {
    const styles = window.getComputedStyle(canvas);
    const pageHeight = parsePx(styles.getPropertyValue('--page-height'), 1123);
    const pageGap = parsePx(styles.getPropertyValue('--page-gap'), 12);
    const paddingTop = parsePx(styles.paddingTop, 0);
    const paddingBottom = parsePx(styles.paddingBottom, 0);
    return {
      pageHeight,
      pageGap,
      paddingTop,
      paddingBottom,
      contentHeight: Math.max(1, pageHeight - paddingTop - paddingBottom),
    };
  }

  function resetPageFlow(editor) {
    Array.from(editor.children).forEach(function (block) {
      if (!block.hasAttribute('data-page-flow-padding')) return;
      block.style.paddingTop = block.getAttribute('data-page-flow-padding') || '';
      block.removeAttribute('data-page-flow-padding');
    });
  }

  function applyPageFlow(editor, metrics) {
    resetPageFlow(editor);

    const pitch = metrics.pageHeight + metrics.pageGap;
    let currentPage = 0;
    let pageEnd = metrics.contentHeight;

    Array.from(editor.children).forEach(function (block) {
      const computed = window.getComputedStyle(block);
      const top = block.offsetTop;
      const height = block.offsetHeight + parsePx(computed.marginBottom, 0);

      // Very tall blocks (for example a large image or a long paragraph) remain
      // breakable. Normal blocks move as a unit, matching "keep lines together"
      // behavior and keeping the caret out of the page gutter.
      while (top >= pageEnd) {
        currentPage += 1;
        pageEnd = (currentPage * pitch) + metrics.contentHeight;
      }
      if (top + height <= pageEnd || height > metrics.contentHeight) return;

      currentPage += 1;
      const nextPageStart = currentPage * pitch;
      const existingPadding = parsePx(computed.paddingTop, 0);
      block.setAttribute('data-page-flow-padding', block.style.paddingTop || '');
      block.style.paddingTop = (existingPadding + Math.max(0, nextPageStart - top)) + 'px';
      pageEnd = nextPageStart + metrics.contentHeight;
    });
  }

  function renderPageNavigation(pageCount, metrics) {
    const markers = document.getElementById('page-markers');
    const thumbnails = document.getElementById('page-thumbnail-list');
    if (!markers || !thumbnails) return;

    const markerFragment = document.createDocumentFragment();
    const thumbnailFragment = document.createDocumentFragment();
    const pitch = metrics.pageHeight + metrics.pageGap;

    for (let page = 1; page <= pageCount; page += 1) {
      if (page > 1) {
        const gutter = document.createElement('span');
        gutter.className = 'page-gutter';
        gutter.style.top = (((page - 1) * pitch) - metrics.pageGap) + 'px';
        gutter.style.height = metrics.pageGap + 'px';
        markerFragment.appendChild(gutter);
      }

      const marker = document.createElement('span');
      marker.className = 'page-marker';
      marker.style.top = (12 + ((page - 1) * pitch)) + 'px';
      marker.textContent = 'Page ' + page;
      markerFragment.appendChild(marker);

      const thumbnail = document.createElement('button');
      thumbnail.type = 'button';
      thumbnail.className = 'page-thumbnail';
      thumbnail.dataset.page = String(page);
      thumbnail.setAttribute('aria-label', 'Go to page ' + page);
      thumbnail.innerHTML = '<span class="page-thumbnail-sheet"></span><span class="page-thumbnail-label">' + page + '</span>';
      const item = document.createElement('div');
      item.className = 'page-thumbnail-item';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'page-thumbnail-delete';
      remove.dataset.page = String(page);
      remove.title = 'Delete page ' + page;
      remove.setAttribute('aria-label', remove.title);
      remove.disabled = pageCount <= 1;
      remove.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i>';
      item.append(thumbnail, remove);
      thumbnailFragment.appendChild(item);
    }

    markers.replaceChildren(markerFragment);
    thumbnails.replaceChildren(thumbnailFragment);
  }

  function setActivePage(page, pageCount) {
    activePage = Math.max(1, Math.min(page, pageCount));
    const label = document.getElementById('page-status');
    if (label) label.textContent = 'Page ' + activePage + ' of ' + pageCount;
    const prev = document.getElementById('page-prev-btn');
    const next = document.getElementById('page-next-btn');
    const remove = document.getElementById('page-delete-btn');
    if (prev) prev.disabled = activePage <= 1;
    if (next) next.disabled = activePage >= pageCount;
    if (remove) remove.disabled = pageCount <= 1;
    document.querySelectorAll('.page-thumbnail').forEach(function (thumb) {
      const isActive = Number(thumb.dataset.page) === activePage;
      thumb.classList.toggle('active', isActive);
      if (isActive) thumb.setAttribute('aria-current', 'page');
      else thumb.removeAttribute('aria-current');
    });
  }

  function goToPage(page) {
    const canvas = document.getElementById('page-canvas');
    const pageArea = document.getElementById('page-area');
    if (!canvas || !pageArea) return;
    const metrics = pageMetrics(canvas);
    const pageCount = Number(canvas.style.getPropertyValue('--page-count')) || 1;
    const target = canvas.offsetTop + ((Math.max(1, Math.min(page, pageCount)) - 1) * (metrics.pageHeight + metrics.pageGap)) - 12;
    pageArea.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    setActivePage(page, pageCount);
  }

  function getPageRange(page) {
    const canvas = document.getElementById('page-canvas');
    if (!canvas) return null;
    const metrics = pageMetrics(canvas);
    const pitch = metrics.pageHeight + metrics.pageGap;
    let start = null;
    let end = null;

    quill.getLines().forEach(function (line) {
      const index = quill.getIndex(line);
      const bounds = quill.getBounds(index);
      if (Math.floor(bounds.top / pitch) + 1 !== page) return;
      if (start === null) start = index;
      end = index + line.length();
    });

    return start === null ? null : { start, end };
  }

  function deletePage(page) {
    const canvas = document.getElementById('page-canvas');
    if (!canvas) return;
    const pageCount = Number(canvas.style.getPropertyValue('--page-count')) || 1;
    if (pageCount <= 1) {
      window.showToast('The document must keep one page', 'info');
      return;
    }

    const range = getPageRange(page);
    if (!range || range.end <= range.start) {
      window.showToast('This automatic page has no separate content to remove', 'info');
      return;
    }

    const text = quill.getText(range.start, range.end - range.start).trim();
    if (!window.confirm('Delete all content on page ' + page + '? You can undo this with Ctrl+Z.')) return;

    quill.history.cutoff();
    quill.deleteText(range.start, range.end - range.start, 'user');
    quill.history.cutoff();
    quill.setSelection(Math.min(range.start, quill.getLength() - 1), 0, 'silent');
    schedulePaginationUpdate();
    window.showToast(text ? 'Page ' + page + ' deleted' : 'Blank page removed', 'success');
  }

  function updatePagination() {
    const canvas = document.getElementById('page-canvas');
    const editor = quill.root;
    if (!canvas || !editor) return;

    syncPaperMetrics(canvas);
    const metrics = pageMetrics(canvas);
    applyPageFlow(editor, metrics);
    const physicalContentHeight = Math.max(editor.scrollHeight, metrics.contentHeight);

    // The flow includes physical page gutters. Count by the complete page pitch,
    // not by printable height, so one spacer cannot be miscounted as another page.
    const pageCount = Math.max(1, Math.ceil(
      (physicalContentHeight + metrics.paddingTop + metrics.paddingBottom + metrics.pageGap - 0.5)
      / (metrics.pageHeight + metrics.pageGap)
    ));
    const canvasHeight = (pageCount * metrics.pageHeight) + ((pageCount - 1) * metrics.pageGap);

    canvas.style.setProperty('--page-count', String(pageCount));
    canvas.style.minHeight = canvasHeight + 'px';
    const layoutSignature = [pageCount, metrics.pageHeight, metrics.pageGap, metrics.contentHeight].join(':');
    if (layoutSignature !== lastLayoutSignature) {
      renderPageNavigation(pageCount, metrics);
      lastLayoutSignature = layoutSignature;
    }
    setActivePage(activePage, pageCount);
  }

  function schedulePaginationUpdate() {
    if (paginationFrame != null) cancelAnimationFrame(paginationFrame);
    paginationFrame = requestAnimationFrame(function () {
      paginationFrame = null;
      updatePagination();
    });
  }

  quill.on('text-change', schedulePaginationUpdate);
  quill.on('selection-change', function (range) {
    if (!range) return;
    const canvas = document.getElementById('page-canvas');
    if (!canvas) return;
    const metrics = pageMetrics(canvas);
    const pageCount = Number(canvas.style.getPropertyValue('--page-count')) || 1;
    const bounds = quill.getBounds(range.index);
    setActivePage(Math.floor(bounds.top / (metrics.pageHeight + metrics.pageGap)) + 1, pageCount);
  });
  window.addEventListener('resize', schedulePaginationUpdate);
  if ('ResizeObserver' in window) {
    const pageArea = document.getElementById('page-area');
    if (pageArea) new ResizeObserver(schedulePaginationUpdate).observe(pageArea);
  }
  quill.root.addEventListener('load', function (event) {
    if (event.target && event.target.tagName === 'IMG') schedulePaginationUpdate();
  }, true);
  quill.root.addEventListener('paste', schedulePaginationUpdate);
  document.getElementById('page-thumbnail-list')?.addEventListener('click', function (event) {
    const remove = event.target.closest('.page-thumbnail-delete');
    if (remove) { deletePage(Number(remove.dataset.page)); return; }
    const thumb = event.target.closest('.page-thumbnail');
    if (thumb) goToPage(Number(thumb.dataset.page));
  });
  document.getElementById('page-prev-btn')?.addEventListener('click', function () { goToPage(activePage - 1); });
  document.getElementById('page-next-btn')?.addEventListener('click', function () { goToPage(activePage + 1); });
  document.getElementById('page-status')?.addEventListener('click', function () { goToPage(activePage); });
  document.getElementById('page-delete-btn')?.addEventListener('click', function () { deletePage(activePage); });
  document.getElementById('page-area')?.addEventListener('scroll', function () {
    const canvas = document.getElementById('page-canvas');
    const pageArea = document.getElementById('page-area');
    if (!canvas || !pageArea) return;
    const metrics = pageMetrics(canvas);
    const pageCount = Number(canvas.style.getPropertyValue('--page-count')) || 1;
    const viewportMiddle = pageArea.scrollTop + (pageArea.clientHeight * 0.4) - canvas.offsetTop;
    setActivePage(Math.floor(Math.max(0, viewportMiddle) / (metrics.pageHeight + metrics.pageGap)) + 1, pageCount);
  }, { passive: true });
  schedulePaginationUpdate();

  // Expose globally so other modules can access
  window.quill = quill;
  window.PagePagination = {
    refresh: schedulePaginationUpdate,
    goToPage,
    deletePage,
    clearFlow: function () { resetPageFlow(quill.root); },
  };
})();
