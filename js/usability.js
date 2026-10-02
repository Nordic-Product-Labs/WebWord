/* Keyboard navigation and accessible names for the existing editor controls. */
(function () {
  'use strict';
  function init() {
    document.querySelectorAll('button[title], select[title], input[title]').forEach(el => {
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.title);
    });
    document.getElementById('btn-text-color').setAttribute('aria-label', 'Text color');
    document.getElementById('btn-bg-color').setAttribute('aria-label', 'Highlight color');
    document.getElementById('templates-close').setAttribute('aria-label', 'Close templates');
    window.quill.root.setAttribute('role', 'textbox');
    window.quill.root.setAttribute('aria-label', 'Document content');
    window.quill.root.setAttribute('aria-multiline', 'true');

    const help = document.getElementById('help-dialog');
    document.getElementById('help-btn').addEventListener('click', () => help.showModal());

    const title = document.getElementById('doc-title');
    const updateTitle = () => { document.title = (title.value.trim() || 'Untitled Document') + ' — WordWeb'; };
    title.addEventListener('input', updateTitle);
    window.quill.on('text-change', updateTitle);
    updateTitle();

    document.querySelectorAll('.modal-overlay').forEach(modal => {
      let returnFocus;
      const focusables = () => [...modal.querySelectorAll('button, input, select, [tabindex="0"]')]
        .filter(el => !el.disabled && el.getClientRects().length);
      new MutationObserver(() => {
        if (!modal.classList.contains('hidden')) {
          returnFocus = document.activeElement;
          (modal.querySelector('[id$="cancel"]') || focusables()[0])?.focus();
        } else if (modal.contains(document.activeElement)) {
          returnFocus?.focus();
        }
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
      modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          modal.querySelector('[id$="cancel"], #templates-close')?.click();
        }
        if (event.key === 'Tab') {
          const items = focusables();
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      });
    });

    const menu = document.getElementById('export-menu');
    const trigger = document.getElementById('export-pdf-btn');
    trigger.setAttribute('aria-controls', menu.id);
    trigger.setAttribute('aria-expanded', 'false');
    new MutationObserver(() => trigger.setAttribute('aria-expanded', String(!menu.classList.contains('hidden'))))
      .observe(menu, { attributes: true, attributeFilter: ['class'] });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        menu.classList.remove('hidden');
        menu.querySelector('button')?.focus();
      }
    });
    menu.addEventListener('keydown', event => {
      const items = [...menu.querySelectorAll('button:not(:disabled)')];
      const index = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        menu.classList.add('hidden');
        trigger.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    });
    menu.parentElement.addEventListener('focusout', event => {
      if (!menu.parentElement.contains(event.relatedTarget)) menu.classList.add('hidden');
    });

    document.querySelectorAll('[data-format], [data-align]').forEach(button => {
      const sync = () => button.setAttribute('aria-pressed', String(button.classList.contains('active')));
      sync();
      new MutationObserver(sync).observe(button, { attributes: true, attributeFilter: ['class'] });
    });
  }
  window.Usability = { init };
})();
