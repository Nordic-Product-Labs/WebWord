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

  // Expose globally so other modules can access
  window.quill = quill;
})();
