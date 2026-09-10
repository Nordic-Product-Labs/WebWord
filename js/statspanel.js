/* ================================================================
   statspanel.js — Analysis Panel controller v2
   Renders AI detection · Readability · Statistics · Writing Issues
   (Grammar + Spelling + Style) with tabbed filter, click-to-jump,
   one-click Apply / Ignore / Add-to-dictionary.
   ================================================================ */

(function () {
  'use strict';

  let panelOpen = false;
  let grammarIssues = [];
  let styleIssues = [];
  let activeTab = 'all';
  let updateTimer = null;
  let lastHeuristicResult = null;   // last Analysis.detectAI() result
  let lastNeuralResult    = null;   // last LLMDetector.analyze() result
  let neuralBusy          = false;  // guard against overlapping neural runs
  let neuralAutoTimer     = null;   // debounce timer for background re-runs
  let neuralLastText      = '';     // text the last neural result was for

  const $ = id => document.getElementById(id);

  // ─────────────────────────────────────────────────────────────
  // AI Detection rendering
  // ─────────────────────────────────────────────────────────────
  const SIGNAL_IDS = [
    'burstiness', 'lengthEntropy', 'phraseDensity', 'passive',
    'hedging', 'startDiversity', 'lexicalRichness', 'punctuation',
    'contractions', 'functionRatio', 'repeatedNgrams', 'structuralBias',
    'formality', 'contentRepeat', 'nominalization',
  ];

  function renderAI(result) {
    lastHeuristicResult = result;
    const scoreEl = $('ai-score-value');
    const labelEl = $('ai-score-label');
    const barEl   = $('ai-score-bar-fill');
    const confEl  = $('ai-confidence');
    const phrasesEl = $('ai-phrases-list');
    const badgeEl = $('ai-status-badge');

    if (!result || result.score === null) {
      if (scoreEl) scoreEl.textContent = '—';
      if (labelEl) labelEl.textContent = result?.label || 'N/A';
      if (barEl)   barEl.style.width = '0%';
      if (confEl)  confEl.textContent = '';
      if (badgeEl) badgeEl.textContent = 'AI: —';
      SIGNAL_IDS.forEach(id => {
        const bar = document.getElementById('signal-' + id + '-fill');
        if (bar) { bar.style.width = '0%'; bar.style.background = 'var(--border)'; }
      });
      return;
    }

    const { score, label, confidence, aiPhrases } = result;
    const color = score >= 70 ? '#ea4335' : score >= 45 ? '#fbbc04' : '#34a853';

    if (scoreEl) { scoreEl.textContent = score + '%'; scoreEl.style.color = color; }
    if (labelEl) labelEl.textContent = label;
    if (barEl)   { barEl.style.width = score + '%'; barEl.style.background = color; }
    if (confEl)  confEl.textContent = `Confidence: ${confidence}` + (result.wordCount ? ` · ${result.wordCount} words` : '');

    if (badgeEl) {
      badgeEl.textContent = `AI: ${score}%`;
      badgeEl.style.color = color;
      badgeEl.title = `${label} — click for details`;
    }

    if (phrasesEl) {
      if (aiPhrases && aiPhrases.length > 0) {
        phrasesEl.innerHTML = aiPhrases.map(p => {
          const times = p.count > 1 ? ` <em>×${p.count}</em>` : '';
          return `<span class="phrase-tag" title="Detected LLM phrase">${escapeHTML(p.phrase)}${times}</span>`;
        }).join('');
      } else {
        phrasesEl.innerHTML = '<span class="phrase-empty">No common AI phrases detected</span>';
      }
    }

    const signals = result.signals || {};
    SIGNAL_IDS.forEach(id => {
      const bar = document.getElementById('signal-' + id + '-fill');
      const v = signals[id] || 0;
      if (bar) {
        bar.style.width = v + '%';
        bar.style.background = v >= 60 ? '#ea4335' : v >= 35 ? '#fbbc04' : '#34a853';
        // Show the numeric % on the row label for diagnostic transparency.
        const row = bar.closest('.signal-row');
        if (row) {
          let valEl = row.querySelector('.signal-val');
          if (!valEl) {
            valEl = document.createElement('span');
            valEl.className = 'signal-val';
            row.appendChild(valEl);
          }
          valEl.textContent = v + '%';
          valEl.style.color = v >= 60 ? '#ea4335' : v >= 35 ? '#b8860b' : '#137333';
        }
      }
    });

    // If a neural check ran earlier this session, re-blend so the
    // top score stays neural-weighted as the user edits (until the
    // text drifts enough that they re-run the deep check).
    if (lastNeuralResult && !lastNeuralResult.insufficient) {
      renderNeural(lastNeuralResult);
    }
  }
  function renderNeural(neural) {
    lastNeuralResult = neural;
    const statusEl  = $('neural-status');
    const metricsEl = $('neural-metrics');
    const pplEl     = $('neural-ppl');
    const pplHint   = $('neural-ppl-hint');
    const rankEl    = $('neural-rank');
    const rankHint  = $('neural-rank-hint');
    const nsEl      = $('neural-score');
    const styloEl   = $('neural-stylo');
    const blEl      = $('neural-blended');

    if (!neural || neural.insufficient) {
      if (statusEl)  statusEl.textContent  = 'Add more text (at least ~40 characters) to run the neural check.';
      if (metricsEl) metricsEl.hidden = true;
      setSourceLine('Stylometric only — text too short for neural pass', 'info');
      return;
    }
    if (neural.unsupportedLanguage) {
      if (statusEl)  statusEl.textContent  = `Detected language "${neural.language}" — neural check supports English only.`;
      if (metricsEl) metricsEl.hidden = true;
      setSourceLine(`Stylometric only — detected language: ${neural.language}`, 'warn');
      return;
    }

    if (statusEl)  statusEl.textContent  = `Analyzed ${neural.tokens} tokens with distilgpt2.`;
    if (metricsEl) {
      const toggle = $('neural-toggle-btn');
      metricsEl.hidden = !(toggle && toggle.getAttribute('aria-expanded') === 'true');
    }

    if (pplEl)  pplEl.textContent  = neural.perplexity.toFixed(1);
    if (rankEl) rankEl.textContent = neural.logRank.toFixed(2);
    if (pplHint) {
      pplHint.textContent = neural.perplexity < 30 ? 'very low → AI-like'
                          : neural.perplexity < 55 ? 'low → possibly AI'
                          :                          'human-typical range';
    }
    if (rankHint) {
      rankHint.textContent = neural.logRank < 3  ? 'very low → AI-like'
                           : neural.logRank < 5  ? 'low → possibly AI'
                           :                       'human-typical range';
    }
    if (nsEl) {
      nsEl.textContent = neural.neuralScore + '%';
      nsEl.style.color = neural.neuralScore >= 65 ? '#ea4335'
                       : neural.neuralScore >= 40 ? '#fbbc04' : '#34a853';
    }

    const heur = lastHeuristicResult?.score ?? 50;
    if (styloEl) styloEl.textContent = heur + '%';

    const blended = Math.round(0.7 * neural.neuralScore + 0.3 * heur);
    if (blEl) {
      blEl.textContent = blended + '%';
      blEl.style.color = blended >= 65 ? '#ea4335'
                       : blended >= 40 ? '#fbbc04' : '#34a853';
    }

    // Overwrite the top-of-panel score with the blended value.
    const scoreEl = $('ai-score-value');
    const labelEl = $('ai-score-label');
    const barEl   = $('ai-score-bar-fill');
    const confEl  = $('ai-confidence');
    const badgeEl = $('ai-status-badge');
    const color = blended >= 70 ? '#ea4335' : blended >= 45 ? '#fbbc04' : '#34a853';
    const label = blended >= 80 ? 'Very likely AI-generated'
                : blended >= 65 ? 'Likely AI-generated'
                : blended >= 45 ? 'Possibly AI-assisted'
                : blended >= 25 ? 'Mostly human'
                :                 'Human-written';
    if (scoreEl) { scoreEl.textContent = blended + '%'; scoreEl.style.color = color; }
    if (labelEl) labelEl.textContent = label;
    if (barEl)   { barEl.style.width = blended + '%'; barEl.style.background = color; }
    if (confEl)  confEl.textContent = `Confidence: high · ${lastHeuristicResult?.wordCount || 0} words`;
    if (badgeEl) { badgeEl.textContent = `AI: ${blended}%`; badgeEl.style.color = color; }
    setSourceLine(`Neural ${neural.neuralScore}% + stylometric ${heur}% = ${blended}% blended`, 'info');
  }

  function setSourceLine(text, tone) {
    const el = $('ai-source-line');
    if (!el) return;
    el.textContent = text || '';
    el.dataset.tone = tone || 'info';
  }

  // Debounced auto-runner. Called whenever the panel opens or text
  // changes; only kicks off a neural pass if the text is different
  // enough from the previous run to justify the ~2-5 s of compute.
  function scheduleNeuralAuto(delayMs) {
    clearTimeout(neuralAutoTimer);
    neuralAutoTimer = setTimeout(runNeuralAuto, delayMs != null ? delayMs : 400);
  }

  async function runNeuralAuto() {
    if (!panelOpen) return;
    if (neuralBusy)  return;
    if (!window.LLMDetector || !window.LLMDetector.isSupported()) {
      setSourceLine('Stylometric only — neural module unavailable', 'warn');
      return;
    }
    const text = (window.quill?.getText() || '').trim();
    if (text.length < 40) {
      renderNeural({ insufficient: true });
      return;
    }
    if (lastNeuralResult && !lastNeuralResult.insufficient && !lastNeuralResult.unsupportedLanguage) {
      if (text === neuralLastText) return;
      const l1 = neuralLastText.length, l2 = text.length;
      if (Math.abs(l1 - l2) < 30 && text.slice(0, 200) === neuralLastText.slice(0, 200)) {
        return;
      }
    }

    neuralBusy = true;
    const statusEl    = $('neural-status');
    const firstrunEl  = $('neural-firstrun');
    const progressEl  = $('neural-progress-fill');
    const progressTxt = $('neural-progress-text');
    const badgeEl     = $('neural-badge');

    // First-time-per-browser flag lives in localStorage so the banner
    // never nags returning users, even after full page reloads.
    const FIRSTRUN_KEY = 'docpdf_neural_model_ready';
    const modelAlreadyReady = !!localStorage.getItem(FIRSTRUN_KEY) || window.LLMDetector.isReady();

    try {
      if (!window.LLMDetector.isReady()) {
        if (!modelAlreadyReady && firstrunEl) {
          firstrunEl.hidden = false;
          if (badgeEl) { badgeEl.textContent = 'downloading'; badgeEl.classList.add('is-loading'); }
        }
        setSourceLine('Stylometric result shown — neural detector loading in the background…', 'info');
        if (statusEl) statusEl.textContent = 'Loading distilgpt2 (~40 MB, one-time)…';
        await window.LLMDetector.load((p) => {
          if (p.status !== 'progress' || !p.file) return;
          const pct = Math.round((p.loaded / (p.total || p.loaded || 1)) * 100);
          if (progressEl) progressEl.style.width = pct + '%';
          if (progressTxt) progressTxt.textContent = `${p.file} — ${pct}%`;
          if (statusEl)   statusEl.textContent   = `Downloading ${p.file}… ${pct}%`;
        });
        // Model loaded successfully — remember for next visit and hide banner.
        try { localStorage.setItem(FIRSTRUN_KEY, '1'); } catch (_) {}
        if (firstrunEl) firstrunEl.hidden = true;
        if (badgeEl)    { badgeEl.textContent = 'auto'; badgeEl.classList.remove('is-loading'); }
      }
      setSourceLine('Running neural detector…', 'info');
      if (statusEl) statusEl.textContent = 'Running distilgpt2 over your text…';
      const result = await window.LLMDetector.analyze(text);
      neuralLastText = text;
      renderNeural(result);
    } catch (err) {
      console.error('Auto neural detection failed:', err);
      if (firstrunEl) firstrunEl.hidden = true;
      if (badgeEl)    { badgeEl.textContent = 'unavailable'; badgeEl.classList.remove('is-loading'); }
      setSourceLine('Stylometric only — neural pass failed (see status below)', 'warn');
      if (statusEl) statusEl.textContent = 'Neural check failed: ' + (err.message || err);
    } finally {
      neuralBusy = false;
    }
  }

  function bindNeural() {
    const toggle = $('neural-toggle-btn');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const metricsEl = $('neural-metrics');
        if (!metricsEl) return;
        const open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        metricsEl.hidden = open;
        toggle.textContent = open ? 'Details' : 'Hide details';
      });
    }
  }
  function renderReadability(result) {
    const easeEl   = $('readability-ease');
    const easeBar  = $('readability-ease-fill');
    const gradeEl  = $('readability-grade');
    const gradeLbl = $('readability-grade-label');
    const wpsEl    = $('readability-wps');

    if (!result) {
      if (easeEl)  easeEl.textContent  = '—';
      if (gradeEl) gradeEl.textContent = '—';
      if (wpsEl)   wpsEl.textContent   = '—';
      return;
    }
    const { ease, easeLabel, grade, gradeLabel, avgWPS } = result;
    const color = ease >= 70 ? '#34a853' : ease >= 50 ? '#fbbc04' : '#ea4335';

    if (easeEl)   { easeEl.textContent = ease; easeEl.style.color = color; easeEl.title = easeLabel; }
    if (easeBar)  { easeBar.style.width = ease + '%'; easeBar.style.background = color; }
    if (gradeEl)  gradeEl.textContent = `Grade ${grade}`;
    if (gradeLbl) gradeLbl.textContent = gradeLabel;
    if (wpsEl)    wpsEl.textContent = `${avgWPS} words/sentence`;
  }

  // ─────────────────────────────────────────────────────────────
  // Statistics
  // ─────────────────────────────────────────────────────────────
  function renderStats(stats) {
    if (!stats) return;
    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    set('stat-words',      stats.wordCount.toLocaleString());
    set('stat-chars',      stats.charCount.toLocaleString());
    set('stat-sentences',  stats.sentenceCount.toLocaleString());
    set('stat-paragraphs', stats.paragraphCount.toLocaleString());
    set('stat-reading',    stats.readingTime);
    set('stat-avg-wps',    stats.avgWPS);
    set('reading-time-status', stats.readingTime);

    const listEl = $('top-words-list');
    if (listEl && stats.topWords.length > 0) {
      const max = stats.topWords[0].count;
      listEl.innerHTML = stats.topWords.map(({ word, count }) => {
        const pct = Math.round((count / max) * 100);
        return `
          <div class="word-freq-row">
            <span class="word-freq-word">${escapeHTML(word)}</span>
            <div class="word-freq-bar-wrap"><div class="word-freq-bar-fill" style="width:${pct}%"></div></div>
            <span class="word-freq-count">${count}</span>
          </div>`;
      }).join('');
    } else if (listEl) {
      listEl.innerHTML = '<span class="phrase-empty">No content yet</span>';
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Writing Issues (grammar + spelling + style)
  // ─────────────────────────────────────────────────────────────
  function normalizedGrammarIssues() {
    // Turn a LanguageTool match into our unified issue shape.
    return grammarIssues.map((m, i) => ({
      _id: 'g' + i,
      source: 'grammar',
      category: m._category || 'grammar',
      offset: m.offset,
      length: m.length,
      message: m.message,
      replacements: (m.replacements || []).slice(0, 4).map(r => r.value),
      ruleId: (m.rule && m.rule.id) || '',
      matched: m.context && m.context.text
        ? m.context.text.slice(m.context.offset, m.context.offset + m.context.length)
        : '',
    }));
  }

  function normalizedStyleIssues() {
    return styleIssues.map((s, i) => ({
      _id: 's' + i,
      source: 'style',
      category: 'style',
      offset: s.index,
      length: s.length,
      message: s.message,
      replacements: (s.suggestion !== undefined && s.suggestion !== null) ? [s.suggestion] : [],
      ruleId: s.type,
      matched: s.matched || '',
    }));
  }

  function allIssues() {
    return [...normalizedGrammarIssues(), ...normalizedStyleIssues()]
      .sort((a, b) => a.offset - b.offset);
  }

  function updateCounts() {
    const all = allIssues();
    const bySource = {
      spelling: all.filter(i => i.category === 'spelling').length,
      grammar:  all.filter(i => i.category === 'grammar' || i.category === 'punctuation').length,
      style:    all.filter(i => i.source === 'style').length,
    };
    const total = all.length;
    const set = (id, n) => { const el = $(id); if (el) el.textContent = n; };
    set('issue-count-all',      total);
    set('issue-count-spelling', bySource.spelling);
    set('issue-count-grammar',  bySource.grammar);
    set('issue-count-style',    bySource.style);

    // Status bar badges
    const gBadge = $('grammar-status-badge');
    if (gBadge) {
      const badCount = bySource.spelling + bySource.grammar;
      gBadge.textContent = badCount > 0 ? `✦ ${badCount}` : '✓';
      gBadge.style.color = badCount > 0 ? 'var(--danger)' : 'var(--saved-color)';
      gBadge.title = badCount > 0
        ? `${badCount} grammar/spelling issue${badCount !== 1 ? 's' : ''}`
        : 'No grammar/spelling issues';
    }

    const countEl = $('grammar-count');
    if (countEl) {
      countEl.textContent = total > 0
        ? `${total} issue${total !== 1 ? 's' : ''} found`
        : 'No issues found ✓';
      countEl.style.color = total > 0 ? 'var(--danger)' : 'var(--saved-color)';
    }
  }

  function filteredIssues() {
    const all = allIssues();
    if (activeTab === 'all')      return all;
    if (activeTab === 'spelling') return all.filter(i => i.category === 'spelling');
    if (activeTab === 'grammar')  return all.filter(i => i.category === 'grammar' || i.category === 'punctuation');
    if (activeTab === 'style')    return all.filter(i => i.source === 'style');
    return all;
  }

  const CATEGORY_ICON = {
    spelling:    'fa-spell-check',
    grammar:     'fa-language',
    punctuation: 'fa-comma',
    style:       'fa-pen-fancy',
  };
  const CATEGORY_COLOR = {
    spelling:    '#ea4335',
    grammar:     '#fbbc04',
    punctuation: '#fbbc04',
    style:       '#1a73e8',
  };

  function renderIssues() {
    const listEl = $('grammar-list');
    if (!listEl) return;
    updateCounts();

    const issues = filteredIssues();
    if (issues.length === 0) {
      listEl.innerHTML = '<p class="phrase-empty">' + (
        activeTab === 'all' ? 'Document looks good!' : `No ${activeTab} issues.`
      ) + '</p>';
      return;
    }

    listEl.innerHTML = issues.slice(0, 40).map(iss => {
      const iconClass = CATEGORY_ICON[iss.category] || 'fa-circle';
      const color     = CATEGORY_COLOR[iss.category] || 'var(--text-secondary)';
      const suggestions = iss.replacements.length > 0
        ? `<div class="grammar-suggestions">
             ${iss.replacements.map(r =>
               `<button class="issue-suggestion" data-id="${iss._id}" data-value="${escapeAttr(r)}" title="Apply this fix">${escapeHTML(r || '(delete)')}</button>`
             ).join('')}
           </div>`
        : '';
      const dictBtn = iss.category === 'spelling'
        ? `<button class="issue-action" data-action="dict" data-id="${iss._id}" title="Add to personal dictionary"><i class="fas fa-book"></i> Dictionary</button>`
        : '';
      const ignoreBtn = `<button class="issue-action" data-action="ignore" data-id="${iss._id}" title="Ignore this type of issue"><i class="fas fa-eye-slash"></i> Ignore</button>`;
      const jumpBtn = `<button class="issue-action" data-action="jump" data-id="${iss._id}" title="Jump to this text"><i class="fas fa-crosshairs"></i> Show</button>`;

      return `
        <div class="grammar-issue" data-id="${iss._id}">
          <div class="grammar-issue-head">
            <i class="fas ${iconClass}" style="color:${color}"></i>
            <span class="grammar-category">${iss.category}</span>
            ${iss.ruleId ? `<span class="grammar-rule">${escapeHTML(iss.ruleId)}</span>` : ''}
          </div>
          <div class="grammar-msg">${escapeHTML(iss.message)}</div>
          ${iss.matched ? `<div class="grammar-context">"${escapeHTML(iss.matched.slice(0, 80))}${iss.matched.length > 80 ? '…' : ''}"</div>` : ''}
          ${suggestions}
          <div class="grammar-actions">${jumpBtn}${dictBtn}${ignoreBtn}</div>
        </div>
      `;
    }).join('') + (issues.length > 40 ? `<p class="phrase-empty">…and ${issues.length - 40} more</p>` : '');
  }

  function findIssueById(id) {
    return allIssues().find(i => i._id === id) || null;
  }

  // ─────────────────────────────────────────────────────────────
  // Apply / Jump / Ignore / Dictionary
  // ─────────────────────────────────────────────────────────────
  function applySuggestion(issueId, value) {
    const iss = findIssueById(issueId);
    if (!iss || !window.quill) return;
    const q = window.quill;
    // Quill offsets equal our text-offsets because we compute them
    // from q.getText() in runAnalysis().
    try {
      q.deleteText(iss.offset, iss.length, 'user');
      if (value) q.insertText(iss.offset, value, 'user');
      window.showToast?.('Fix applied', 'success', 1500);
      // Re-run analysis so offsets stay accurate
      scheduleReanalyze(200);
    } catch {
      window.showToast?.('Could not apply that fix', 'warning');
    }
  }

  function jumpToIssue(issueId) {
    const iss = findIssueById(issueId);
    if (!iss || !window.quill) return;
    try {
      window.quill.setSelection(iss.offset, iss.length, 'user');
      // Scroll page-area so the selection is visible
      const bounds = window.quill.getBounds(iss.offset, iss.length);
      const pageArea = document.getElementById('page-area');
      const canvas = document.getElementById('page-canvas');
      if (pageArea && canvas && bounds) {
        const canvasTop = canvas.getBoundingClientRect().top
          - pageArea.getBoundingClientRect().top
          + pageArea.scrollTop;
        pageArea.scrollTop = canvasTop + bounds.top - pageArea.clientHeight / 3;
      }
    } catch {}
  }

  function ignoreIssue(issueId) {
    const iss = findIssueById(issueId);
    if (!iss) return;
    if (iss.source === 'grammar' && iss.ruleId) {
      window.Analysis.ignoreRule(iss.ruleId);
      window.showToast?.(`Rule "${iss.ruleId}" ignored`, 'info', 2000);
    } else if (iss.source === 'style') {
      // For style issues we can't persist per-rule without a bigger UI;
      // instead just drop this instance from the current list.
      styleIssues = styleIssues.filter(s =>
        !(s.index === iss.offset && s.length === iss.length && s.type === iss.ruleId)
      );
    }
    scheduleReanalyze(50);
  }

  function addToDictionary(issueId) {
    const iss = findIssueById(issueId);
    if (!iss || !iss.matched) return;
    const word = iss.matched.match(/\w[\w']*/)?.[0];
    if (word) {
      window.Analysis.addToDictionary(word);
      window.showToast?.(`"${word}" added to your dictionary`, 'success', 2000);
      scheduleReanalyze(50);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Event delegation for issue list
  // ─────────────────────────────────────────────────────────────
  function bindIssueList() {
    const listEl = $('grammar-list');
    if (!listEl) return;
    listEl.addEventListener('click', function (e) {
      const suggest = e.target.closest('.issue-suggestion');
      if (suggest) {
        applySuggestion(suggest.dataset.id, suggest.dataset.value);
        return;
      }
      const action = e.target.closest('.issue-action');
      if (action) {
        const id = action.dataset.id;
        if (action.dataset.action === 'jump') jumpToIssue(id);
        else if (action.dataset.action === 'ignore') ignoreIssue(id);
        else if (action.dataset.action === 'dict') addToDictionary(id);
      }
    });
  }

  function bindTabs() {
    const tabs = document.getElementById('issue-tabs');
    if (!tabs) return;
    tabs.addEventListener('click', function (e) {
      const btn = e.target.closest('.issue-tab');
      if (!btn) return;
      activeTab = btn.dataset.tab;
      tabs.querySelectorAll('.issue-tab').forEach(t => t.classList.toggle('active', t === btn));
      renderIssues();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Analysis passes
  // ─────────────────────────────────────────────────────────────
  function runAnalysis() {
    const text = window.quill?.getText() || '';

    const aiResult    = window.Analysis.detectAI(text);
    const readability = window.Analysis.calcReadability(text);
    const stats       = window.Analysis.calcStats(text);

    renderAI(aiResult);
    renderReadability(readability);
    renderStats(stats);

    // Client-side style is always synchronous
    styleIssues = window.Analysis.checkStyle(text);
    renderIssues();

    // Grammar check (async, debounced, only if panel is open)
    if (panelOpen) {
      window.Analysis.scheduleGrammarCheck(text, function (issues) {
        grammarIssues = issues;
        renderIssues();
      });
    }
  }

  function scheduleReanalyze(delay) {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(runAnalysis, delay || 800);
  }

  // ─────────────────────────────────────────────────────────────
  // Panel open/close
  // ─────────────────────────────────────────────────────────────
  function openPanel() {
    panelOpen = true;
    document.getElementById('stats-panel')?.classList.add('open');
    document.getElementById('page-area')?.classList.add('panel-open');
    document.getElementById('stats-panel-btn')?.classList.add('active');
    runAnalysis();
    // Kick off the neural pass automatically — user does not need to
    // click a button. The scheduler debounces / skips if the text is
    // unchanged or too short.
    scheduleNeuralAuto(200);
  }
  function closePanel() {
    panelOpen = false;
    window.Analysis.cancelGrammarCheck?.();
    clearTimeout(neuralAutoTimer);
    document.getElementById('stats-panel')?.classList.remove('open');
    document.getElementById('page-area')?.classList.remove('panel-open');
    document.getElementById('stats-panel-btn')?.classList.remove('active');
  }
  function togglePanel() { panelOpen ? closePanel() : openPanel(); }

  // ─────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────
  function escapeHTML(str) {
    return (str || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[c]);
  }
  function escapeAttr(str) {
    return escapeHTML(str).replace(/\n/g, ' ');
  }

  // ─────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────
  function init() {
    $('stats-panel-btn')?.addEventListener('click', togglePanel);
    $('ai-status-badge')?.addEventListener('click', openPanel);
    $('stats-panel-close')?.addEventListener('click', closePanel);

    bindTabs();
    bindIssueList();
    bindNeural();

    // Debounced re-analysis on text change
    window.quill.on('text-change', function (delta, old, source) {
      if (source !== 'user') return;
      clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        const text = window.quill.getText() || '';
        const stats = window.Analysis.calcStats(text);
        const ai    = window.Analysis.detectAI(text);
        renderStats(stats);
        renderAI(ai);
        if (panelOpen) {
          renderReadability(window.Analysis.calcReadability(text));
          styleIssues = window.Analysis.checkStyle(text);
          renderIssues();
          // Re-run neural after the user stops editing for a while.
          // Longer debounce than the heuristic pass because it takes
          // 1-3 s of compute.
          scheduleNeuralAuto(2500);
        }
      }, 800);
    });

    setTimeout(runAnalysis, 500);
  }

  window.StatsPanel = {
    init,
    open: openPanel,
    close: closePanel,
    refresh: runAnalysis,
    renderGrammar(issues) { grammarIssues = issues || []; renderIssues(); },
  };
})();
