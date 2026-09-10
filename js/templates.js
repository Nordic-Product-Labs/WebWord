/* ================================================================
   templates.js — Document templates modal
   ================================================================ */

(function () {
  'use strict';

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // ── Template definitions (Quill Delta format) ─────────────────
  const TEMPLATES = [
    {
      id:          'blank',
      name:        'Blank Document',
      icon:        'fa-file',
      color:       '#9aa0a6',
      description: 'Start fresh with an empty document',
      title:       'Untitled Document',
      delta:       { ops: [{ insert: '\n' }] },
    },
    {
      id:          'report',
      name:        'Business Report',
      icon:        'fa-chart-bar',
      color:       '#1a73e8',
      description: 'Formal report with executive summary and sections',
      title:       'Business Report',
      delta: { ops: [
        { insert: 'Business Report', attributes: { header: 1 } },
        { insert: '\n' },
        { insert: `Prepared by: [Your Name]   ·   ${today}`, attributes: { color: '#5f6368' } },
        { insert: '\n\n' },
        { insert: 'Executive Summary', attributes: { header: 2 } },
        { insert: '\nProvide a concise overview of the report, key findings, and your main recommendations.\n\n' },
        { insert: 'Background & Objectives', attributes: { header: 2 } },
        { insert: '\nDescribe the context, purpose, and scope of this report. What problem does it address?\n\n' },
        { insert: 'Methodology', attributes: { header: 2 } },
        { insert: '\nExplain how the research or analysis was conducted. Include data sources and methods.\n\n' },
        { insert: 'Key Findings', attributes: { header: 2 } },
        { insert: '\nFinding 1', attributes: { bold: true } },
        { insert: '\nDetail your first major finding here.\n\n' },
        { insert: 'Finding 2', attributes: { bold: true } },
        { insert: '\nDetail your second major finding here.\n\n' },
        { insert: 'Recommendations', attributes: { header: 2 } },
        { insert: '\nList actionable recommendations based on your findings:\n' },
        { insert: 'Recommendation one — brief description.\n', attributes: { list: 'ordered' } },
        { insert: 'Recommendation two — brief description.\n', attributes: { list: 'ordered' } },
        { insert: 'Recommendation three — brief description.\n', attributes: { list: 'ordered' } },
        { insert: '\nConclusion', attributes: { header: 2 } },
        { insert: '\nSummarize the report and reinforce the importance of acting on the recommendations.\n' },
      ]},
    },
    {
      id:          'letter',
      name:        'Cover Letter',
      icon:        'fa-envelope',
      color:       '#34a853',
      description: 'Professional job application cover letter',
      title:       'Cover Letter',
      delta: { ops: [
        { insert: '[Your Name]\n[Your Address]\n[City, State ZIP]\n[Email] · [Phone]\n' },
        { insert: today + '\n\n' },
        { insert: '[Hiring Manager\'s Name]\n[Title]\n[Company Name]\n[Company Address]\n\n' },
        { insert: 'Dear [Hiring Manager\'s Name],\n\n' },
        { insert: 'I am writing to express my strong interest in the [Position Title] role at [Company Name]. With [X years] of experience in [relevant field], I am confident in my ability to contribute meaningfully to your team.\n\n' },
        { insert: 'In my previous role at [Previous Company], I [describe a key achievement with a measurable result]. This experience has equipped me with [relevant skills] that align directly with what you are looking for.\n\n' },
        { insert: 'I am particularly drawn to [Company Name] because [reason — culture, mission, product, growth]. I believe my background in [relevant area] would allow me to [specific contribution you can make].\n\n' },
        { insert: 'I would welcome the opportunity to discuss how my skills and experience can benefit [Company Name]. Thank you for your time and consideration.\n\n' },
        { insert: 'Sincerely,\n\n[Your Name]\n' },
      ]},
    },
    {
      id:          'meeting',
      name:        'Meeting Notes',
      icon:        'fa-users',
      color:       '#fa7b17',
      description: 'Structured meeting minutes with action items',
      title:       'Meeting Notes',
      delta: { ops: [
        { insert: 'Meeting Notes', attributes: { header: 1 } },
        { insert: '\n' },
        { insert: `Date: ${today}`, attributes: { bold: true } },
        { insert: '   ·   ' },
        { insert: 'Time: [HH:MM AM/PM]', attributes: { bold: true } },
        { insert: '   ·   ' },
        { insert: 'Location: [Room / Video Link]', attributes: { bold: true } },
        { insert: '\n\n' },
        { insert: 'Attendees', attributes: { header: 3 } },
        { insert: '\n[Name, Role]\n', attributes: { list: 'bullet' } },
        { insert: '[Name, Role]\n', attributes: { list: 'bullet' } },
        { insert: '\nAgenda', attributes: { header: 3 } },
        { insert: '\nAgenda item 1\n', attributes: { list: 'ordered' } },
        { insert: 'Agenda item 2\n', attributes: { list: 'ordered' } },
        { insert: 'Agenda item 3\n', attributes: { list: 'ordered' } },
        { insert: '\nDiscussion & Notes', attributes: { header: 2 } },
        { insert: '\nTopic 1: [Title]', attributes: { header: 3 } },
        { insert: '\nNotes from the discussion on this topic.\n\n' },
        { insert: 'Topic 2: [Title]', attributes: { header: 3 } },
        { insert: '\nNotes from the discussion on this topic.\n\n' },
        { insert: 'Action Items', attributes: { header: 2 } },
        { insert: '\n' },
        { insert: '[ ] ', attributes: { bold: true } },
        { insert: '[Owner] — Action item description — Due: [Date]\n' },
        { insert: '[ ] ', attributes: { bold: true } },
        { insert: '[Owner] — Action item description — Due: [Date]\n' },
        { insert: '\nNext Meeting', attributes: { header: 3 } },
        { insert: '\nDate: [Date]   ·   Time: [HH:MM]\n' },
      ]},
    },
    {
      id:          'essay',
      name:        'Academic Essay',
      icon:        'fa-graduation-cap',
      color:       '#a142f4',
      description: 'Five-paragraph essay with thesis structure',
      title:       'Academic Essay',
      delta: { ops: [
        { insert: '[Essay Title]', attributes: { header: 1 } },
        { insert: '\n' },
        { insert: `[Student Name]   ·   [Course]   ·   ${today}`, attributes: { color: '#5f6368' } },
        { insert: '\n\n' },
        { insert: 'Introduction', attributes: { header: 2 } },
        { insert: '\nBegin with a hook — an interesting fact, quote, or question that draws the reader in. Provide background context, then end the paragraph with a clear ', attributes: {} },
        { insert: 'thesis statement', attributes: { bold: true, underline: true } },
        { insert: ' that states your main argument.\n\n' },
        { insert: 'Body Paragraph 1 — [Main Point]', attributes: { header: 3 } },
        { insert: '\nState your first supporting argument. Present evidence, examples, or data. Explain how this evidence supports your thesis.\n\n' },
        { insert: 'Body Paragraph 2 — [Main Point]', attributes: { header: 3 } },
        { insert: '\nState your second supporting argument. Present evidence, examples, or data. Explain how this evidence supports your thesis.\n\n' },
        { insert: 'Body Paragraph 3 — [Main Point]', attributes: { header: 3 } },
        { insert: '\nState your third supporting argument. Present evidence, examples, or data. Explain how this evidence supports your thesis.\n\n' },
        { insert: 'Conclusion', attributes: { header: 2 } },
        { insert: '\nRestate your thesis in new words. Briefly summarize the main supporting points. End with a broader implication or call to action.\n\n' },
        { insert: 'References', attributes: { header: 2 } },
        { insert: '\n[Author Last, First. Title. Publisher, Year.]\n', attributes: { list: 'ordered' } },
      ]},
    },
    {
      id:          'invoice',
      name:        'Invoice',
      icon:        'fa-file-invoice-dollar',
      color:       '#e37400',
      description: 'Simple professional invoice template',
      title:       'Invoice',
      delta: { ops: [
        { insert: 'INVOICE', attributes: { header: 1 } },
        { insert: '\n\n' },
        { insert: 'From:', attributes: { bold: true } },
        { insert: '\n[Your Name / Company]\n[Address]\n[Email · Phone]\n\n' },
        { insert: 'Bill To:', attributes: { bold: true } },
        { insert: '\n[Client Name / Company]\n[Client Address]\n[Client Email]\n\n' },
        { insert: 'Invoice #: ', attributes: { bold: true } },
        { insert: `INV-001   ·   ` },
        { insert: 'Date: ', attributes: { bold: true } },
        { insert: `${today}   ·   ` },
        { insert: 'Due Date: ', attributes: { bold: true } },
        { insert: '[Due Date]\n\n' },
        { insert: 'Services / Items', attributes: { header: 3 } },
        { insert: '\nDescription                                    Qty    Rate       Amount\n', attributes: { bold: true } },
        { insert: '──────────────────────────────────────────────────────────────────────\n' },
        { insert: '[Service or Item Description]                    1    $[rate]    $[amount]\n' },
        { insert: '[Service or Item Description]                    1    $[rate]    $[amount]\n\n' },
        { insert: '──────────────────────────────────────────────────────────────────────\n' },
        { insert: 'Subtotal:', attributes: { bold: true } },
        { insert: '                                                           $[subtotal]\n' },
        { insert: 'Tax (0%):', attributes: { bold: true } },
        { insert: '                                                           $0.00\n' },
        { insert: 'TOTAL DUE:', attributes: { bold: true } },
        { insert: '                                                          $[total]\n\n' },
        { insert: 'Payment Methods', attributes: { header: 3 } },
        { insert: '\nBank Transfer: [Bank name, Account #, Routing #]\nPayPal: [email]\n\n' },
        { insert: 'Notes:', attributes: { bold: true } },
        { insert: '\nPayment is due within [30] days. Thank you for your business!\n' },
      ]},
    },
  ];

  // ── Render template cards ─────────────────────────────────────
  function renderTemplateCards() {
    const grid = document.getElementById('template-grid');
    if (!grid) return;

    grid.innerHTML = TEMPLATES.map(t => `
      <button class="template-card" data-template-id="${t.id}" type="button">
        <div class="template-icon" style="background: ${t.color}20; color: ${t.color}">
          <i class="fas ${t.icon}"></i>
        </div>
        <div class="template-info">
          <span class="template-name">${t.name}</span>
          <span class="template-desc">${t.description}</span>
        </div>
      </button>
    `).join('');

    grid.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => {
        applyTemplate(card.dataset.templateId);
        closeTemplates();
      });
    });
  }

  // ── Apply template ────────────────────────────────────────────
  function applyTemplate(id) {
    const tpl = TEMPLATES.find(t => t.id === id);
    if (!tpl || !window.quill) return;

    const isEmpty = window.quill.getText().trim().length === 0;

    if (!isEmpty && !confirm('Replace the current document with this template?')) return;

    window.quill.setContents(tpl.delta, 'user');
    window.quill.history.clear();
    window.UI?.resetImageTools?.();

    const titleInput = document.getElementById('doc-title');
    if (titleInput) titleInput.value = tpl.title;

    window.quill.setSelection(window.quill.getLength(), 0, 'user');
    window.AutoSave?.clear();
    window.showToast(`Template "${tpl.name}" applied`, 'success');
  }

  // ── Modal open/close ──────────────────────────────────────────
  function openTemplates() {
    renderTemplateCards();
    document.getElementById('templates-modal')?.classList.remove('hidden');
  }

  function closeTemplates() {
    document.getElementById('templates-modal')?.classList.add('hidden');
  }

  function init() {
    document.getElementById('templates-btn')?.addEventListener('click', openTemplates);
    document.getElementById('templates-close')?.addEventListener('click', closeTemplates);
    document.getElementById('templates-modal')?.addEventListener('click', function (e) {
      if (e.target === this) closeTemplates();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeTemplates();
    });
  }

  window.Templates = { init, open: openTemplates, close: closeTemplates };
})();
