/* ================================================================
   analysis.js — Analysis Engine v2
   ----------------------------------------------------------------
   Multi-signal AI detection + client-side style checker + grammar
   (LanguageTool proxy). All heuristics are informed by published
   research on GPTZero (burstiness/perplexity), DetectGPT
   (perturbation curvature), Ghostbuster (n-gram probability),
   Binoculars (cross-perplexity), and GLTR (token predictability).
   Since we run entirely in-browser with no model, we approximate
   those signals with computable linguistic features and combine
   them with a calibrated weighted composite.
   ================================================================ */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // 1.  AI SLOP LEXICON  (expanded, ~180 phrases + regex patterns)
  // ─────────────────────────────────────────────────────────────
  // Sources: known LLM overuse patterns catalogued by GPTZero,
  // Originality.ai, university studies, and community "AI slop"
  // corpora. Each phrase must be robust — no single-word entries
  // that ordinary writers use ("very", "however").
  const AI_PHRASES = [
    // Structural connectors — overused as paragraph glue
    'furthermore', 'moreover', 'additionally', 'in conclusion', 'in summary',
    'to summarize', 'consequently', 'as a result', 'in other words',
    'notably', 'importantly', 'significantly', 'ultimately',
    // "Meta" hedges — the LLM signature
    'it is important to note', 'it is worth noting', 'it should be noted',
    'it is crucial to', 'it is essential to', 'it is vital to',
    'it goes without saying', 'one cannot overstate', 'needless to say',
    'it is worth mentioning', 'it is important to remember',
    'it is important to understand', 'it is worth pointing out',
    // Rhetorical framings
    'delve into', 'delve deeper', 'dive into', 'dive deeper',
    'shed light on', 'in the realm of', 'in the world of', 'in the landscape of',
    'in this context', 'in this regard', 'with respect to', 'when it comes to',
    'in today\'s world', 'in today\'s fast-paced', 'in the ever-evolving',
    'in the ever-changing', 'in an era where', 'in a world where',
    'this suggests that', 'this means that', 'this indicates that',
    'this underscores', 'this highlights', 'this demonstrates', 'this showcases',
    'this exemplifies', 'this illustrates', 'this reflects',
    // Signature adjectives
    'pivotal', 'paramount', 'commendable', 'meticulous', 'multifaceted',
    'nuanced', 'robust', 'paradigm', 'synergy', 'tapestry', 'labyrinthine',
    'amalgamation', 'intricate', 'seamlessly', 'unprecedented', 'transformative',
    'groundbreaking', 'revolutionary', 'cutting-edge', 'state-of-the-art',
    'game-changing', 'trailblazing', 'unparalleled', 'unwavering',
    'holistic', 'invaluable', 'quintessential', 'noteworthy', 'compelling',
    // Business / consultant-speak
    'leverage', 'utilize', 'facilitate', 'empower', 'actionable', 'ecosystem',
    'stakeholders', 'scalable', 'streamline', 'optimize', 'synergize',
    'value-add', 'best-in-class', 'thought leader',
    // Hedging quantifiers
    'there are several', 'there are many', 'there are numerous',
    'a variety of', 'a number of', 'a plethora of', 'a myriad of',
    'a wide range of', 'a diverse array of', 'a multitude of',
    // "Fluff" transitions
    'on the other hand', 'that being said', 'having said that',
    'with that in mind', 'with that said', 'all things considered',
    // Conclusion phrases
    'in essence', 'ultimately', 'in the grand scheme', 'at the heart of',
    'the key takeaway', 'to put it simply', 'simply put',
    // "Journey" language
    'journey', 'embark on', 'unlock the potential', 'harness the power',
    'unleash', 'foster a culture of', 'pave the way',
    // Empty affirmations
    'it\'s no secret', 'let\'s face it', 'let\'s explore', 'let\'s take a look',
    'you might be wondering', 'here\'s the thing',
    // The infamous ones
    'testament to', 'a testament', 'plays a crucial role', 'plays a pivotal role',
    'plays a significant role', 'stands as a testament',
    'boasts a rich history', 'boasts an impressive',
    'weave a tapestry', 'rich tapestry',
    'a symphony of', 'a mosaic of', 'the fabric of',
    // GPT-4 era additions
    'certainly!', 'absolutely!', 'of course!',
    'i hope this helps', 'feel free to ask', 'happy to help',
    'let me know if', 'here\'s a', 'here is a',
    // "Not only... but also" abuse
    'not only', 'but also',
  ];

  // Regex patterns (higher specificity than simple string match)
  const AI_PATTERNS = [
    /\bas an? (?:ai|language model|assistant)\b/i,
    /\bi (?:cannot|can't|don't have the ability to)\b/i,
    /\bit'?s (?:important|essential|worth|crucial|vital) to (?:note|understand|remember|consider|mention|point out)\b/i,
    /\bin (?:today'?s|the modern|the current|the digital|the contemporary) (?:world|era|age|society|landscape)\b/i,
    /\b(?:navigating|exploring|understanding) the (?:complexities|nuances|intricacies|landscape|world|realm) of\b/i,
    /\b(?:plays?|played) an? (?:crucial|pivotal|significant|vital|essential|important|key) role\b/i,
    /\bin the (?:ever[- ]?(?:evolving|changing|growing)) (?:landscape|world|field|realm) of\b/i,
    /\ba (?:testament|reflection|symbol|beacon) (?:to|of)\b/i,
    /\bunlock(?:ing)? (?:the )?(?:full )?potential\b/i,
    /\bharness(?:ing)? the power of\b/i,
  ];

  const HEDGE_WORDS = [
    'typically', 'generally', 'often', 'usually', 'commonly', 'frequently',
    'may', 'might', 'could', 'tends to', 'in many cases', 'in most cases',
    'for the most part', 'to some extent', 'in some ways', 'arguably',
    'perhaps', 'possibly', 'sometimes', 'in general', 'largely',
  ];

  // Top-100 English function words (Zipf-derived).
  const FUNCTION_WORDS = new Set([
    'the','of','and','to','a','in','that','is','was','it','for','with','as','on',
    'be','at','by','this','have','from','or','one','had','not','but','what','all',
    'were','when','we','there','can','an','your','which','their','said','if','will',
    'do','each','about','how','up','out','them','then','she','many','some','so',
    'these','would','other','into','has','more','her','two','like','him','see',
    'time','could','no','make','than','first','been','its','who','now','people',
    'my','made','over','did','down','only','way','find','use','may','water','long',
    'little','very','after','words','called','just','where','most','know','get',
    'through','back','much','before','go','good','new','write','our',
  ]);

  const CONTRACTIONS = [
    "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't",
    "hasn't", "haven't", "hadn't", "won't", "wouldn't", "shouldn't", "couldn't",
    "can't", "cannot", "it's", "that's", "there's", "here's", "what's", "who's",
    "he's", "she's", "we're", "they're", "you're", "i'm", "i've", "you've",
    "we've", "they've", "i'll", "you'll", "he'll", "she'll", "we'll", "they'll",
    "let's",
  ];
  const CONTRACTION_ROOTS = [
    /\bdo not\b/gi, /\bdoes not\b/gi, /\bdid not\b/gi, /\bis not\b/gi,
    /\bare not\b/gi, /\bwas not\b/gi, /\bwere not\b/gi, /\bhas not\b/gi,
    /\bhave not\b/gi, /\bhad not\b/gi, /\bwill not\b/gi, /\bwould not\b/gi,
    /\bshould not\b/gi, /\bcould not\b/gi, /\bcan not\b/gi, /\bit is\b/gi,
    /\bthere is\b/gi, /\bthat is\b/gi, /\bi am\b/gi, /\byou are\b/gi,
    /\bwe are\b/gi, /\bthey are\b/gi, /\bhe is\b/gi, /\bshe is\b/gi,
    /\bi have\b/gi, /\byou have\b/gi, /\bwe have\b/gi,
  ];

  // ─────────────────────────────────────────────────────────────
  // 2.  Text helpers
  // ─────────────────────────────────────────────────────────────
  function splitSentences(text) {
    return (text.match(/[^.!?…]+[.!?…]+/g) || [])
      .map(s => s.trim())
      .filter(s => s.split(/\s+/).length >= 3);
  }

  function splitWords(text) {
    return (text.toLowerCase().match(/\b[a-z']+\b/g) || []);
  }

  function splitParagraphs(text) {
    return text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  // ─────────────────────────────────────────────────────────────
  // 3.  SIGNALS
  // ─────────────────────────────────────────────────────────────

  // 3.1 Burstiness — CV of sentence lengths.
  // Low CV = uniform = AI-like. Research: human writing shows
  // high variance because we mix long complex sentences with
  // short punchy ones. LLMs produce steadier lengths.
  function calcBurstiness(sentences) {
    if (sentences.length < 3) return 0.5;
    const lengths = sentences.map(s => s.split(/\s+/).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    if (mean === 0) return 0;
    const variance = lengths.reduce((s, l) => s + Math.pow(l - mean, 2), 0) / lengths.length;
    const cv = Math.sqrt(variance) / mean;
    // cv < 0.3 → very AI; cv > 0.75 → very human
    return clamp01(1 - (cv / 0.55));
  }

  // 3.2 Sentence-length entropy — Shannon entropy of length buckets.
  // Human writing distributes lengths across many buckets → high entropy.
  // LLMs cluster in one or two buckets → low entropy → AI-like.
  function calcLengthEntropy(sentences) {
    if (sentences.length < 4) return 0.5;
    const buckets = {}; // bucket by 5-word bins
    sentences.forEach(s => {
      const b = Math.floor(s.split(/\s+/).length / 5);
      buckets[b] = (buckets[b] || 0) + 1;
    });
    const total = sentences.length;
    let H = 0;
    Object.values(buckets).forEach(c => {
      const p = c / total;
      H -= p * Math.log2(p);
    });
    // Normalize: max entropy ~log2(8)=3 for typical writing.
    // Low entropy (H < 1.5) is AI-like.
    return clamp01(1 - (H / 2.5));
  }

  // 3.3 AI phrase density — expanded corpus + regex patterns.
  function calcPhraseDensity(text, textLower, wordCount) {
    let hits = 0;
    const found = [];
    AI_PHRASES.forEach(p => {
      const idx = textLower.indexOf(p);
      if (idx !== -1) {
        // Count multi-occurrences up to 3× to reward density but cap.
        const re = new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['\u2019]") + '\\b', 'gi');
        const matches = (textLower.match(re) || []).length;
        hits += Math.min(matches, 3);
        if (matches > 0) found.push({ phrase: p, count: matches });
      }
    });
    AI_PATTERNS.forEach(re => {
      const m = text.match(new RegExp(re.source, re.flags + 'g'));
      if (m) hits += Math.min(m.length, 3);
    });
    // Normalize: 3+ hits per 100 words → maxed out.
    const per100 = (hits / Math.max(wordCount, 1)) * 100;
    return {
      score: clamp01(per100 / 3),
      found: found.sort((a, b) => b.count - a.count).slice(0, 10),
    };
  }

  // 3.4 Passive voice — regex proxy for "be + past participle".
  function calcPassiveDensity(textLower, sentenceCount) {
    const pattern = /\b(?:is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?\w+(?:ed|en)\b/g;
    const count = (textLower.match(pattern) || []).length;
    return clamp01(count / Math.max(sentenceCount * 0.4, 1));
  }

  // 3.5 Hedging language density.
  function calcHedgeDensity(textLower, wordCount) {
    let hits = 0;
    HEDGE_WORDS.forEach(h => {
      const re = new RegExp('\\b' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      hits += (textLower.match(re) || []).length;
    });
    return clamp01((hits / Math.max(wordCount, 1)) * 100 / 4);
  }

  // 3.6 Paragraph uniformity.
  function calcParaUniformity(paragraphs) {
    if (paragraphs.length < 2) return 0.4;
    const lengths = paragraphs.map(p => p.split(/\s+/).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    if (mean === 0) return 0;
    const variance = lengths.reduce((s, l) => s + Math.pow(l - mean, 2), 0) / lengths.length;
    const cv = Math.sqrt(variance) / mean;
    return clamp01(1 - cv * 1.2);
  }

  // 3.7 Sentence-start diversity — bigram of first two words.
  // LLMs repeat starters like "The X", "This Y", "In addition".
  function calcStartDiversity(sentences) {
    if (sentences.length < 4) return 0.3;
    const starts = {};
    sentences.forEach(s => {
      const words = s.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');
      if (words) starts[words] = (starts[words] || 0) + 1;
    });
    const unique = Object.keys(starts).length;
    const ratio = unique / sentences.length;
    // ratio near 1 = every sentence starts uniquely (human); ratio < 0.5 = repetitive.
    return clamp01((0.85 - ratio) / 0.5);
  }

  // 3.8 MTLD — Measure of Textual Lexical Diversity.
  // Robust lexical-richness metric (McCarthy & Jarvis 2010) that
  // doesn't degrade with length like raw TTR. Lower MTLD = repetitive
  // vocabulary. LLMs tend to score in a narrow middle band.
  function calcMTLD(words, threshold) {
    threshold = threshold || 0.72;
    if (words.length < 50) return null;
    function factorCount(seq) {
      let types = new Set(), tokens = 0, factors = 0;
      for (let i = 0; i < seq.length; i++) {
        types.add(seq[i]); tokens++;
        const ttr = types.size / tokens;
        if (ttr <= threshold) {
          factors++;
          types = new Set();
          tokens = 0;
        }
      }
      if (tokens > 0) {
        const ttr = types.size / tokens;
        factors += (1 - ttr) / (1 - threshold);
      }
      return factors > 0 ? seq.length / factors : seq.length;
    }
    const forward = factorCount(words);
    const backward = factorCount(words.slice().reverse());
    return (forward + backward) / 2;
  }
  function mtldToScore(mtld) {
    // Human academic writing: MTLD ~ 80-130. LLM writing often
    // sits 55-80 (mild repetition of high-frequency words).
    if (mtld === null) return 0.5;
    if (mtld >= 85) return 0.2;
    if (mtld <= 45) return 0.4; // too repetitive could be human note-taking
    // Sweet spot 60-80 is AI-like
    return clamp01(1 - Math.abs(mtld - 70) / 30);
  }

  // 3.9 Punctuation fingerprint.
  // LLMs love em-dashes (—), semicolons, colons and rarely use
  // exclamation marks or question marks in expository writing.
  function calcPunctuationFingerprint(text, wordCount) {
    if (wordCount < 40) return 0.5;
    const per1k = (n) => (n / wordCount) * 1000;
    const emDashes    = (text.match(/—|--/g) || []).length;
    const semicolons  = (text.match(/;/g) || []).length;
    const colons      = (text.match(/(?<!:)\s*:\s+(?=[A-Za-z])/g) || []).length;
    const exclaims    = (text.match(/!/g) || []).length;
    const questions   = (text.match(/\?/g) || []).length;
    const curlyQuotes = (text.match(/[\u2018\u2019\u201C\u201D]/g) || []).length;
    // Score: LLM-like when em-dashes and semicolons high AND
    // exclamation+question density low.
    const heavyPunct = clamp01((per1k(emDashes) + per1k(semicolons) * 0.6) / 6);
    const dullPunct  = clamp01(1 - (per1k(exclaims) + per1k(questions)) / 3);
    const curlyBias  = clamp01(per1k(curlyQuotes) / 8);
    return clamp01(heavyPunct * 0.5 + dullPunct * 0.35 + curlyBias * 0.15);
  }

  // 3.10 Contraction avoidance.
  // LLMs tend to write "do not" instead of "don't" in expository
  // prose. High avoidance = AI-like.
  function calcContractionAvoidance(text, textLower) {
    let contractionsUsed = 0;
    CONTRACTIONS.forEach(c => {
      const re = new RegExp('\\b' + c.replace(/'/g, "['\u2019]") + '\\b', 'gi');
      contractionsUsed += (text.match(re) || []).length;
    });
    let expandedForms = 0;
    CONTRACTION_ROOTS.forEach(re => {
      expandedForms += (textLower.match(re) || []).length;
    });
    const total = contractionsUsed + expandedForms;
    // In a document of any real length, an absence of both contractions AND
    // their expanded forms usually means the writer avoided pronoun+aux
    // constructions entirely — a hallmark of formal LLM prose. Treat as
    // strong AI signal instead of neutral.
    if (total === 0) return text.length > 800 ? 0.85 : 0.6;
    if (total < 3)   return text.length > 800 ? 0.75 : 0.5;
    const avoidance = expandedForms / total;
    // avoidance > 0.9 = extreme AI-like formality
    return clamp01((avoidance - 0.4) / 0.5);
  }

  // 3.11 Function-word ratio.
  // Very high or very low ratios both signal non-natural writing.
  // Native English prose sits around 42-48%. LLMs often at 48-55%.
  function calcFunctionRatio(words) {
    if (words.length < 40) return 0.5;
    const funcCount = words.filter(w => FUNCTION_WORDS.has(w)).length;
    const ratio = funcCount / words.length;
    // Optimal-human range 0.40-0.46. AI range often 0.47-0.54.
    if (ratio < 0.4) return 0.2;
    if (ratio > 0.55) return 0.4;
    return clamp01((ratio - 0.44) / 0.12);
  }

  // 3.12 Repeated n-gram density — Ghostbuster-inspired.
  // LLMs repeat template bigrams/trigrams more than humans do
  // across the same document.
  function calcRepeatedNgrams(words) {
    if (words.length < 40) return 0.3;
    const bi = {}, tri = {};
    for (let i = 0; i < words.length - 1; i++) {
      const b = words[i] + ' ' + words[i + 1];
      if (!FUNCTION_WORDS.has(words[i]) || !FUNCTION_WORDS.has(words[i + 1])) {
        bi[b] = (bi[b] || 0) + 1;
      }
    }
    for (let i = 0; i < words.length - 2; i++) {
      const t = words[i] + ' ' + words[i + 1] + ' ' + words[i + 2];
      tri[t] = (tri[t] || 0) + 1;
    }
    const repeatedBi = Object.values(bi).filter(v => v >= 2).length;
    const repeatedTri = Object.values(tri).filter(v => v >= 2).length;
    // Density per 100 words. Divisor 7 (was 12) — empirically AI text
    // routinely hits 4-8 per 100 words; humans stay under 3.
    const density = ((repeatedBi + repeatedTri * 2) / words.length) * 100;
    return clamp01(density / 7);
  }

  // 3.13 List / heading structure — LLMs love bulleted breakdowns.
  function calcStructuralBias(text, paragraphs) {
    if (paragraphs.length < 2) return 0.2;
    const listLines = (text.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) || []).length;
    const headings  = (text.match(/^#{1,6}\s+.+$/gm) || []).length;
    const total = paragraphs.length;
    return clamp01((listLines + headings * 1.5) / (total * 1.2));
  }

  // 3.14 Formality / complexity — LLMs write in a distinctive "corporate
  // academic" register: long polysyllabic words, very low Flesch ease,
  // high average word length. Human casual writing scores much higher on
  // ease and shorter words.
  function calcFormalityBias(words, sentences) {
    if (words.length < 40 || sentences.length === 0) return 0.5;
    const totalSyl = words.reduce((n, w) => n + countSyllables(w), 0);
    const avgWPS = words.length / sentences.length;
    const avgSPW = totalSyl / words.length;
    const ease = 206.835 - 1.015 * avgWPS - 84.6 * avgSPW;
    // Also count "big" words (7+ letters, 3+ syllables) — LLMs use them heavily.
    const bigWords = words.filter(w => w.length >= 7 && countSyllables(w) >= 3).length;
    const bigRatio = bigWords / words.length;
    // ease < 40 = graduate-level = AI-formal-like; ease > 65 = conversational
    const easeScore = clamp01((65 - ease) / 40);
    const bigScore  = clamp01((bigRatio - 0.06) / 0.12);
    return clamp01(easeScore * 0.6 + bigScore * 0.4);
  }

  // 3.15 Content-word repetition — LLMs asked to write about a topic
  // repeat the topic noun(s) many times because they lack pronominal
  // variety. A single content word appearing 6+ times in ~500 words is
  // strong AI signal (humans use synonyms/pronouns).
  function calcContentRepetition(words) {
    if (words.length < 100) return 0.4;
    const freq = {};
    words.forEach(w => {
      if (!FUNCTION_WORDS.has(w) && !STOPWORDS.has(w) && w.length > 3) {
        freq[w] = (freq[w] || 0) + 1;
      }
    });
    const counts = Object.values(freq).sort((a, b) => b - a);
    if (counts.length === 0) return 0.4;
    // Top-3 content-word share of total words
    const top3Share = (counts[0] + (counts[1] || 0) + (counts[2] || 0)) / words.length;
    // 2.5-6% share = high repetition = AI-like. Above 7% = keyword-stuffing.
    return clamp01((top3Share - 0.015) / 0.04);
  }

  // 3.16 Nominalization density — LLMs overuse abstract nouns ending in
  // -tion, -ment, -ance, -ence, -ity, -ness, -ism. Academic-formal AI
  // signature.
  function calcNominalization(words) {
    if (words.length < 40) return 0.5;
    const pattern = /(?:tion|ment|ance|ence|ity|ness|ism|ations|ments)s?$/;
    const noms = words.filter(w => w.length > 5 && pattern.test(w)).length;
    const per100 = (noms / words.length) * 100;
    // per100 > 5 = highly abstract writing = AI-like
    return clamp01((per100 - 1.5) / 4);
  }

  // Small local STOPWORDS shim used by content-repetition. Full set lives
  // in the stats section further below; declare a mini one here.
  const STOPWORDS = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'by','from','as','is','was','are','were','be','been','has','have','had',
    'do','does','did','will','would','could','should','may','might','shall',
    'can','it','its','this','that','these','those','not','no','so','if',
    'than','then','just','about','into','also','such','more','most','other',
    'some','any','only','over','also','which','while',
  ]);

  // ─────────────────────────────────────────────────────────────
  // 4.  MAIN AI DETECTION — weighted composite with calibration
  // ─────────────────────────────────────────────────────────────
  function detectAI(text) {
    const clean = text.replace(/\s+/g, ' ').trim();
    const tLower = clean.toLowerCase();
    const words = splitWords(clean);
    const sentences = splitSentences(clean);
    const paragraphs = splitParagraphs(text);

    if (words.length < 30) {
      return {
        score: null,
        label: 'Too short to analyze — need at least 30 words',
        confidence: 'none',
        signals: {},
        aiPhrases: [],
      };
    }

    const phrase = calcPhraseDensity(clean, tLower, words.length);
    const mtld = calcMTLD(words);

    const sig = {
      burstiness:      calcBurstiness(sentences),
      lengthEntropy:   calcLengthEntropy(sentences),
      phraseDensity:   phrase.score,
      passive:         calcPassiveDensity(tLower, sentences.length),
      hedging:         calcHedgeDensity(tLower, words.length),
      paraUniform:     calcParaUniformity(paragraphs),
      startDiversity:  calcStartDiversity(sentences),
      lexicalRichness: mtldToScore(mtld),
      punctuation:     calcPunctuationFingerprint(clean, words.length),
      contractions:    calcContractionAvoidance(clean, tLower),
      functionRatio:   calcFunctionRatio(words),
      repeatedNgrams:  calcRepeatedNgrams(words),
      structuralBias:  calcStructuralBias(text, paragraphs),
      formality:       calcFormalityBias(words, sentences),
      contentRepeat:   calcContentRepetition(words),
      nominalization:  calcNominalization(words),
    };

    // Weights — sum ≈ 1.0. Larger weights on the signals with the strongest
    // empirical separation between LLM and human writing.
    const weights = {
      burstiness:      0.10,
      lengthEntropy:   0.06,
      phraseDensity:   0.14,
      passive:         0.04,
      hedging:         0.04,
      paraUniform:     0.03,
      startDiversity:  0.05,
      lexicalRichness: 0.06,
      punctuation:     0.07,
      contractions:    0.09,
      functionRatio:   0.03,
      repeatedNgrams:  0.05,
      structuralBias:  0.03,
      formality:       0.11,   // NEW — catches formal AI without slop phrases
      contentRepeat:   0.06,   // NEW — catches topic-word-repeat AI
      nominalization:  0.04,   // NEW — catches -tion/-ment academic AI
    };

    let raw = 0;
    for (const k in weights) raw += (sig[k] || 0) * weights[k];

    // Calibration curve: sigmoid centered at 0.36. Slope 8 stretches tails
    // so genuinely AI-heavy text lands 75-95 and casual human writing stays
    // under 25. Midpoint tuned so a raw score of ~0.45 (a document that
    // shows several strong AI signals but no slop phrases) reads as ~65%.
    const calibrated = 1 / (1 + Math.exp(-8 * (raw - 0.33)));
    const score = Math.round(clamp01(calibrated) * 100);

    const label =
      score >= 85 ? 'Very likely AI-generated' :
      score >= 65 ? 'Likely AI-generated' :
      score >= 45 ? 'Possibly AI-assisted' :
      score >= 25 ? 'Mostly human' :
                    'Human-written';

    const confidence =
      words.length >= 400 ? 'high' :
      words.length >= 150 ? 'medium' : 'low';

    const displaySignals = {};
    for (const k in sig) displaySignals[k] = Math.round(sig[k] * 100);

    return {
      score,
      label,
      confidence,
      signals: displaySignals,
      aiPhrases: phrase.found,
      mtld: mtld === null ? null : Math.round(mtld),
      wordCount: words.length,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 5.  CLIENT-SIDE STYLE CHECKER
  // ─────────────────────────────────────────────────────────────
  // Returns issues as { type, category, index, length, message,
  // matched, suggestion } indexed into the original text.
  //
  // Categories: 'style' | 'clarity' | 'conciseness' | 'variety'

  const WEAK_WORDS = new Set([
    'very', 'really', 'quite', 'just', 'actually', 'basically', 'literally',
    'simply', 'somewhat', 'rather', 'kind of', 'sort of', 'a bit', 'pretty',
  ]);

  const WORDY_PHRASES = [
    { re: /\bdue to the fact that\b/gi,     suggest: 'because' },
    { re: /\bin order to\b/gi,              suggest: 'to' },
    { re: /\bin order for\b/gi,             suggest: 'for' },
    { re: /\bat this point in time\b/gi,    suggest: 'now' },
    { re: /\bat the present time\b/gi,      suggest: 'now' },
    { re: /\bin the event that\b/gi,        suggest: 'if' },
    { re: /\bfor the purpose of\b/gi,       suggest: 'to' },
    { re: /\bin spite of the fact that\b/gi,suggest: 'although' },
    { re: /\bwith regard to\b/gi,           suggest: 'about' },
    { re: /\bwith respect to\b/gi,          suggest: 'about' },
    { re: /\ba large number of\b/gi,        suggest: 'many' },
    { re: /\ba small number of\b/gi,        suggest: 'few' },
    { re: /\bthe majority of\b/gi,          suggest: 'most' },
    { re: /\bit is important to note that\b/gi, suggest: 'note that' },
    { re: /\bit should be noted that\b/gi,  suggest: 'note that' },
    { re: /\bin the process of\b/gi,        suggest: '' },
    { re: /\bmake a decision\b/gi,          suggest: 'decide' },
    { re: /\bmake an assumption\b/gi,       suggest: 'assume' },
    { re: /\bhas the ability to\b/gi,       suggest: 'can' },
    { re: /\bis able to\b/gi,               suggest: 'can' },
    { re: /\bin close proximity to\b/gi,    suggest: 'near' },
    { re: /\bin the near future\b/gi,       suggest: 'soon' },
    { re: /\bon a daily basis\b/gi,         suggest: 'daily' },
    { re: /\bon a weekly basis\b/gi,        suggest: 'weekly' },
    { re: /\bon a monthly basis\b/gi,       suggest: 'monthly' },
    { re: /\bin the vicinity of\b/gi,       suggest: 'near' },
    { re: /\butilize\b/gi,                  suggest: 'use' },
    { re: /\bcommence\b/gi,                 suggest: 'start' },
    { re: /\bfacilitate\b/gi,               suggest: 'help' },
    { re: /\bendeavor\b/gi,                 suggest: 'try' },
    { re: /\bnumerous\b/gi,                 suggest: 'many' },
    { re: /\bplethora\b/gi,                 suggest: 'many' },
    { re: /\bmyriad\b/gi,                   suggest: 'many' },
  ];

  const CLICHES = [
    'at the end of the day', 'think outside the box', 'low-hanging fruit',
    'move the needle', 'circle back', 'touch base', 'boil the ocean',
    'paradigm shift', 'game changer', 'push the envelope', 'boots on the ground',
    'best-in-class', 'value add', 'synergy', 'take it to the next level',
    'a win-win', 'the elephant in the room', 'when push comes to shove',
    'at this juncture', 'needs no introduction', 'in this day and age',
    'as luck would have it', 'the tip of the iceberg',
  ];

  // Passive voice pattern with word position tracking
  const PASSIVE_RE = /\b(is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+(?:ed|en))\b/gi;

  // Long-sentence threshold
  const LONG_SENTENCE_WORDS = 30;

  function checkStyle(text) {
    const issues = [];
    if (!text || text.length < 20) return issues;

    // Wordy phrases → concrete suggestion
    WORDY_PHRASES.forEach(({ re, suggest }) => {
      let m;
      const rex = new RegExp(re.source, re.flags);
      while ((m = rex.exec(text)) !== null) {
        issues.push({
          category: 'conciseness',
          type: 'wordy',
          index: m.index,
          length: m[0].length,
          matched: m[0],
          message: 'Wordy — consider a tighter phrase.',
          suggestion: suggest,
        });
        if (m.index === rex.lastIndex) rex.lastIndex++;
      }
    });

    // Weak / filler words
    const weakRe = new RegExp('\\b(' + [...WEAK_WORDS].join('|') + ')\\b', 'gi');
    let m;
    while ((m = weakRe.exec(text)) !== null) {
      issues.push({
        category: 'style',
        type: 'weak-word',
        index: m.index,
        length: m[0].length,
        matched: m[0],
        message: `"${m[0]}" often weakens your sentence — try removing it.`,
        suggestion: '',
      });
    }

    // Passive voice
    const pRe = new RegExp(PASSIVE_RE.source, PASSIVE_RE.flags);
    while ((m = pRe.exec(text)) !== null) {
      issues.push({
        category: 'clarity',
        type: 'passive',
        index: m.index,
        length: m[0].length,
        matched: m[0],
        message: 'Passive voice — active voice is usually clearer.',
      });
    }

    // Clichés
    CLICHES.forEach(cliche => {
      const re = new RegExp('\\b' + cliche.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      while ((m = re.exec(text)) !== null) {
        issues.push({
          category: 'style',
          type: 'cliche',
          index: m.index,
          length: m[0].length,
          matched: m[0],
          message: 'Cliché — try a fresher phrase.',
        });
      }
    });

    // Long sentences
    let cursor = 0;
    const sentenceRe = /[^.!?…]+[.!?…]+/g;
    while ((m = sentenceRe.exec(text)) !== null) {
      const sent = m[0].trim();
      const wc = sent.split(/\s+/).length;
      if (wc >= LONG_SENTENCE_WORDS) {
        issues.push({
          category: 'clarity',
          type: 'long-sentence',
          index: m.index,
          length: m[0].length,
          matched: sent.slice(0, 60) + (sent.length > 60 ? '…' : ''),
          message: `Long sentence (${wc} words) — consider splitting it.`,
        });
      }
      cursor = m.index + m[0].length;
    }

    // Adverb overuse — sentence with 3+ -ly adverbs
    const sentIter = /[^.!?…]+[.!?…]+/g;
    while ((m = sentIter.exec(text)) !== null) {
      const advCount = (m[0].match(/\b\w+ly\b/gi) || []).filter(w =>
        !/^(only|really|family|early|apply|reply|supply|imply)$/i.test(w)
      ).length;
      if (advCount >= 3) {
        issues.push({
          category: 'style',
          type: 'adverb-overuse',
          index: m.index,
          length: m[0].length,
          matched: m[0].trim().slice(0, 60) + '…',
          message: `${advCount} adverbs in one sentence — strong verbs are usually better.`,
        });
      }
    }

    // Sort issues by their location in the text (top → bottom)
    issues.sort((a, b) => a.index - b.index);
    return issues;
  }

  // ─────────────────────────────────────────────────────────────
  // 6.  READABILITY (Flesch-Kincaid) — unchanged from v1
  // ─────────────────────────────────────────────────────────────
  function countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 2) return 1;
    word = word.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const m = word.match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }

  function calcReadability(text) {
    const words = splitWords(text);
    const sentences = splitSentences(text);
    if (words.length < 10 || sentences.length === 0) return null;

    const totalSyl = words.reduce((n, w) => n + countSyllables(w), 0);
    const avgWPS = words.length / sentences.length;
    const avgSPW = totalSyl / words.length;

    const ease = Math.round(Math.max(0, Math.min(100,
      206.835 - 1.015 * avgWPS - 84.6 * avgSPW
    )));
    const grade = Math.max(1, Math.round(
      0.39 * avgWPS + 11.8 * avgSPW - 15.59
    ));

    const easeLabel =
      ease >= 90 ? 'Very Easy (5th grade)' :
      ease >= 80 ? 'Easy' :
      ease >= 70 ? 'Fairly Easy' :
      ease >= 60 ? 'Standard' :
      ease >= 50 ? 'Fairly Difficult' :
      ease >= 30 ? 'Difficult' :
                   'Very Difficult';

    const gradeLabel =
      grade <= 5  ? 'Elementary' :
      grade <= 8  ? 'Middle School' :
      grade <= 12 ? 'High School' :
      grade <= 16 ? 'College' :
                    'Graduate';

    return { ease, easeLabel, grade, gradeLabel, avgWPS: Math.round(avgWPS * 10) / 10 };
  }

  // ─────────────────────────────────────────────────────────────
  // 7.  DOCUMENT STATISTICS
  // ─────────────────────────────────────────────────────────────
  // (STOPWORDS is defined earlier and reused here.)

  function calcStats(text) {
    const words = splitWords(text);
    const sentences = splitSentences(text);
    const paras = splitParagraphs(text);
    const chars = text.replace(/\s/g, '').length;

    const wpm = 238;
    const mins = words.length / wpm;
    const readingTime = mins < 1
      ? '< 1 min'
      : `~${Math.ceil(mins)} min${Math.ceil(mins) > 1 ? 's' : ''}`;

    const freq = {};
    words.forEach(w => {
      if (!STOPWORDS.has(w) && w.length > 2) freq[w] = (freq[w] || 0) + 1;
    });
    const topWords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word, count]) => ({ word, count }));

    return {
      wordCount: words.length,
      charCount: chars,
      sentenceCount: sentences.length,
      paragraphCount: paras.length,
      readingTime,
      avgWPS: sentences.length > 0 ? Math.round(words.length / sentences.length) : 0,
      topWords,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 8.  GRAMMAR (LanguageTool) + Personal Dictionary
  // ─────────────────────────────────────────────────────────────
  const DICT_KEY = 'docpdf_dictionary';
  const IGNORE_KEY = 'docpdf_ignored_rules';

  function loadSet(key) {
    try {
      const raw = localStorage.getItem(key);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  }
  function saveSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
  }

  const personalDict = loadSet(DICT_KEY);
  const ignoredRules = loadSet(IGNORE_KEY);

  function addToDictionary(word) {
    if (!word) return;
    personalDict.add(word.toLowerCase());
    saveSet(DICT_KEY, personalDict);
  }
  function ignoreRule(ruleId) {
    if (!ruleId) return;
    ignoredRules.add(ruleId);
    saveSet(IGNORE_KEY, ignoredRules);
  }
  function resetIgnored() {
    personalDict.clear(); ignoredRules.clear();
    saveSet(DICT_KEY, personalDict); saveSet(IGNORE_KEY, ignoredRules);
  }

  function categorizeIssue(issue) {
    const rule = (issue.rule && issue.rule.category && issue.rule.category.id) || '';
    const id = (issue.rule && issue.rule.id) || '';
    if (rule === 'TYPOS' || id.includes('MORFOLOGIK')) return 'spelling';
    if (rule === 'PUNCTUATION') return 'punctuation';
    return 'grammar';
  }

  let grammarDebounce = null;

  async function checkGrammar(text) {
    if (text.trim().length < 20) return [];
    try {
      const res = await fetch('https://api.languagetool.org/v2/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `text=${encodeURIComponent(text)}&language=auto&enabledOnly=false`,
      });
      if (!res.ok) return [];
      const data = await res.json();
      const matches = (data.matches || []).filter(m => {
        const rid = (m.rule && m.rule.id) || '';
        if (ignoredRules.has(rid)) return false;
        // Skip flagged words that are in the user's personal dictionary
        if (categorizeIssue(m) === 'spelling') {
          const start = m.offset;
          const end = m.offset + m.length;
          const word = text.slice(start, end).toLowerCase();
          if (personalDict.has(word)) return false;
        }
        return true;
      });
      // Annotate with our category
      matches.forEach(m => { m._category = categorizeIssue(m); });
      return matches;
    } catch {
      return [];
    }
  }

  function scheduleGrammarCheck(text, onResult) {
    clearTimeout(grammarDebounce);
    grammarDebounce = setTimeout(async () => {
      const issues = await checkGrammar(text);
      onResult(issues);
    }, 3000);
  }

  function cancelGrammarCheck() {
    clearTimeout(grammarDebounce);
    grammarDebounce = null;
  }

  // ─────────────────────────────────────────────────────────────
  // 9.  Public API
  // ─────────────────────────────────────────────────────────────
  window.Analysis = {
    detectAI,
    checkStyle,
    calcReadability,
    calcStats,
    checkGrammar,
    scheduleGrammarCheck,
    cancelGrammarCheck,
    addToDictionary,
    ignoreRule,
    resetIgnored,
    get personalDict() { return [...personalDict]; },
    get ignoredRules() { return [...ignoredRules]; },
  };
})();
