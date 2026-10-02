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
      contentHeight: Math.max(1, pageHeight - paddingTop - paddingBottom),
    };
  }

  function renderPageNavigation(pageCount, metrics) {
    const markers = document.getElementById('page-markers');
    const thumbnails = document.getElementById('page-thumbnail-list');
    if (!markers || !thumbnails) return;

    const markerFragment = document.createDocumentFragment();
    const thumbnailFragment = document.createDocumentFragment();
    const pitch = metrics.pageHeight + metrics.pageGap;

    for (let page = 1; page <= pageCount; page += 1) {
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
      thumbnailFragment.appendChild(thumbnail);
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
    if (prev) prev.disabled = activePage <= 1;
    if (next) next.disabled = activePage >= pageCount;
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

  function updatePagination() {
    const canvas = document.getElementById('page-canvas');
    const editor = quill.root;
    if (!canvas || !editor) return;

    syncPaperMetrics(canvas);
    const metrics = pageMetrics(canvas);
    const contentHeight = Math.max(editor.scrollHeight, metrics.contentHeight);

    // Only rendered content determines a new page. Canvas height and visual gaps
    // never feed back into this measurement, preventing duplicate blank pages.
    const pageCount = Math.max(1, Math.ceil((contentHeight - 0.5) / metrics.contentHeight));
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
    setActivePage(Math.floor(bounds.top / metrics.contentHeight) + 1, pageCount);
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
    const thumb = event.target.closest('.page-thumbnail');
    if (thumb) goToPage(Number(thumb.dataset.page));
  });
  document.getElementById('page-prev-btn')?.addEventListener('click', function () { goToPage(activePage - 1); });
  document.getElementById('page-next-btn')?.addEventListener('click', function () { goToPage(activePage + 1); });
  document.getElementById('page-status')?.addEventListener('click', function () { goToPage(activePage); });
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
  window.PagePagination = { refresh: schedulePaginationUpdate, goToPage };
})();
