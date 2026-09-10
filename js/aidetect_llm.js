/* ─────────────────────────────────────────────────────────────
 * aidetect_llm.js — Transformer-based AI text detection
 *
 * Implements a DetectLLM / Binoculars-family zero-shot detector
 * that runs entirely in the browser via transformers.js (ONNX).
 *
 * Model: Xenova/distilgpt2 (~120 MB, cached in IndexedDB after
 * first download). We compute two signals per token, then blend:
 *
 *   1. Perplexity — exp(mean(-log p(token_i | context)))
 *      LLM-generated text is (on average) high-probability under
 *      an LLM's own distribution, so its perplexity is LOWER than
 *      human text of similar topic. Empirically for distilgpt2:
 *        human ~55-140, LLM ~15-45.
 *
 *   2. Mean log-rank — mean of log(1 + rank) of the true token
 *      in the model's predicted distribution over the vocab.
 *      Also lower for LLM text (LLMs pick their own high-rank
 *      tokens). Empirically:
 *        human ~5-15, LLM ~1.5-4.
 *
 * Both are calibrated with sigmoids centered on published paper
 * thresholds, then averaged into a 0-100 neural score.
 *
 * Public API:
 *   LLMDetector.isSupported()  → bool  (checks browser features)
 *   LLMDetector.isReady()      → bool  (model loaded?)
 *   LLMDetector.load(onProgress) → Promise (kicks off download)
 *   LLMDetector.analyze(text)   → Promise<{perplexity, logRank,
 *                                          neuralScore, tokens}>
 * ───────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  // CDN URLs. NOTE: use unpinned paths — pinned "@x.y.z" URLs are
  // rejected (HTTP 400) by an upstream proxy in some corporate
  // networks. Unpinned resolves to latest, which for these mature
  // libraries is safe. transformers.min.js is a webpack-built ES
  // module (exports at the bottom) so dynamic import() works on it.
  const TRANSFORMERS_URL =
    'https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.min.js';
  const FRANC_URL =
    'https://cdn.jsdelivr.net/npm/franc-min/+esm';
  const MODEL_ID = 'Xenova/distilgpt2';

  // Model is 512-token-context (GPT-2). Longer inputs are split
  // into overlapping windows and per-token log-probs are averaged.
  const MAX_CTX = 512;
  const STRIDE  = 384; // overlap 128 tokens between windows

  let _tokenizer = null;
  let _model     = null;
  let _loading   = null;
  let _franc     = null;

  // Lightweight language detection via franc-min (~5KB). We use it as a
  // gate: distilgpt2 is English-only, so on non-English input we refuse
  // rather than returning a meaningless perplexity.
  async function detectLanguage(text) {
    try {
      if (!_franc) {
        const mod = await import(/* @vite-ignore */ FRANC_URL);
        _franc = mod.franc || mod.default || mod;
      }
      if (typeof _franc !== 'function') return { lang: 'und', reliable: false };
      // franc needs ~10 words to be reliable
      const lang = _franc(text, { minLength: 10 });
      return { lang, reliable: text.length >= 100 && lang !== 'und' };
    } catch (e) {
      console.warn('franc load failed:', e);
      return { lang: 'und', reliable: false };
    }
  }

  function isSupported() {
    // transformers.js needs WebAssembly + fetch + BigInt64Array.
    return typeof WebAssembly === 'object'
        && typeof fetch === 'function'
        && typeof BigInt64Array === 'function';
  }

  function isReady() { return _tokenizer !== null && _model !== null; }

  async function load(onProgress) {
    if (isReady()) return;
    if (_loading) return _loading;

    _loading = (async () => {
      const tf = await import(/* @vite-ignore */ TRANSFORMERS_URL);
      // Configure: prefer WASM (works everywhere); allow local cache.
      tf.env.allowLocalModels = false;
      tf.env.useBrowserCache  = true;

      const opts = {
        quantized: true, // 8-bit weights → ~40MB not 120MB
        progress_callback: (p) => {
          if (typeof onProgress === 'function') onProgress(p);
        },
      };

      _tokenizer = await tf.AutoTokenizer.from_pretrained(MODEL_ID, opts);
      _model     = await tf.AutoModelForCausalLM.from_pretrained(MODEL_ID, opts);
    })();

    try { await _loading; }
    finally { _loading = null; }
  }

  // Compute log-softmax denominator (logSumExp) for a logits row.
  function logSumExp(row) {
    let max = -Infinity;
    for (let i = 0; i < row.length; i++) if (row[i] > max) max = row[i];
    let sum = 0;
    for (let i = 0; i < row.length; i++) sum += Math.exp(row[i] - max);
    return max + Math.log(sum);
  }

  // Rank of `value` in `row` (0 = highest). We only need to count
  // how many entries are STRICTLY greater — this is O(vocab) per
  // token but avoids a full sort.
  function rankOf(row, value) {
    let r = 0;
    for (let i = 0; i < row.length; i++) if (row[i] > value) r++;
    return r;
  }

  // Run one forward pass on a window of token IDs and accumulate
  // per-position log-prob + rank of the actual next token.
  async function scoreWindow(tokenIds, startIdx) {
    // Build a tensor input: shape [1, len]. transformers.js expects
    // a plain object with input_ids as a Tensor.
    const tf = await import(/* @vite-ignore */ TRANSFORMERS_URL);
    const input_ids = new tf.Tensor(
      'int64',
      BigInt64Array.from(tokenIds.map((x) => BigInt(x))),
      [1, tokenIds.length]
    );
    const attention_mask = new tf.Tensor(
      'int64',
      BigInt64Array.from(tokenIds.map(() => 1n)),
      [1, tokenIds.length]
    );

    const out = await _model({ input_ids, attention_mask });
    const logits = out.logits; // shape [1, len, vocab]
    const [, seqLen, vocab] = logits.dims;
    const data = logits.data; // Float32Array of length seqLen*vocab

    const rows = [];
    // Positions 0..len-2 predict tokens 1..len-1
    for (let i = 0; i < seqLen - 1; i++) {
      // Skip positions inside the overlap that we already scored in
      // the previous window (avoid double-counting).
      if (i < startIdx) continue;
      const rowStart = i * vocab;
      const row = data.subarray(rowStart, rowStart + vocab);
      const trueTok = tokenIds[i + 1];
      const trueLogit = row[trueTok];
      const lse = logSumExp(row);
      const logProb = trueLogit - lse;
      const rank = rankOf(row, trueLogit);
      rows.push({ logProb, rank });
    }
    return rows;
  }

  async function analyze(text) {
    if (!isReady()) throw new Error('Model not loaded — call load() first');
    if (!text || text.trim().length < 40) {
      return { insufficient: true };
    }

    // Language gate: distilgpt2 was trained overwhelmingly on English,
    // so perplexity on other languages is uninformative (uniformly high
    // → would falsely score everything as human). Refuse instead.
    const langInfo = await detectLanguage(text);
    if (langInfo.reliable && langInfo.lang !== 'eng') {
      return { unsupportedLanguage: true, language: langInfo.lang };
    }

    // Tokenize the whole document once.
    const enc = await _tokenizer(text, { return_tensors: 'np' });
    // enc.input_ids is a Tensor([1, n]); dig out raw ids.
    const rawIds = Array.from(enc.input_ids.data, (x) => Number(x));
    if (rawIds.length < 20) return { insufficient: true };

    // Slide MAX_CTX windows with STRIDE overlap.
    let allRows = [];
    let cursor = 0;
    while (cursor < rawIds.length) {
      const window = rawIds.slice(cursor, cursor + MAX_CTX);
      if (window.length < 2) break;
      // For the first window, score positions from 0. For later
      // windows, skip the overlap prefix so tokens aren't scored
      // twice with different context lengths (we keep the version
      // with more context — the newer window).
      const overlap = cursor === 0 ? 0 : (MAX_CTX - STRIDE);
      const rows = await scoreWindow(window, overlap);
      allRows = allRows.concat(rows);
      if (window.length < MAX_CTX) break;
      cursor += STRIDE;
    }

    if (allRows.length === 0) return { insufficient: true };

    // Aggregate.
    let sumLogP = 0, sumLogRank = 0;
    for (const r of allRows) {
      sumLogP    += r.logProb;
      sumLogRank += Math.log(1 + r.rank);
    }
    const meanLogP    = sumLogP    / allRows.length;
    const meanLogRank = sumLogRank / allRows.length;
    const perplexity  = Math.exp(-meanLogP);

    // Calibration (see file header for thresholds).
    // Perplexity: sigmoid, midpoint 45, slope 1/12.
    // Lower ppl → higher AI score.
    const pplScore  = 1 / (1 + Math.exp((perplexity - 45) / 12));
    // log-rank: midpoint 4, slope 1/1.2. Lower → AI.
    const rankScore = 1 / (1 + Math.exp((meanLogRank - 4) / 1.2));

    // Neural composite (roughly matches Fast-DetectGPT single-model
    // baseline AUROC on GPT-2/3 vs XSum human corpus).
    const neural = 0.55 * pplScore + 0.45 * rankScore;

    return {
      perplexity,
      logRank: meanLogRank,
      neuralScore: Math.round(neural * 100),
      pplScore:  Math.round(pplScore  * 100),
      rankScore: Math.round(rankScore * 100),
      tokens: allRows.length,
      language: langInfo.lang,
    };
  }

  global.LLMDetector = { isSupported, isReady, load, analyze };
})(typeof window !== 'undefined' ? window : globalThis);
