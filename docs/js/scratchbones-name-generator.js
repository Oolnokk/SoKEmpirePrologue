(function initScratchbonesNameGenerator(global) {
  const root = global || window;

  function pickFromRng(rng, arr) {
    if (!arr || arr.length === 0) throw new Error('pickFromRng() called with empty array');
    return arr[Math.floor(rng() * arr.length)];
  }

  function titleCase(text) {
    if (!text) return text;
    return text[0].toUpperCase() + text.slice(1).toLowerCase();
  }

  function applyCasing(text, casing) {
    if (!casing) return text;
    if (casing === 'lower') return text.toLowerCase();
    if (casing === 'upper') return text.toUpperCase();
    return titleCase(text);
  }

  function clampInt(value, min, max) {
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  function tokenListSortedLongestFirst(tokens) {
    return (tokens || []).slice().sort((a, b) => b.length - a.length);
  }

  function startsWithAnyToken(text, tokens) {
    for (const token of tokens) if (text.startsWith(token)) return token;
    return null;
  }

  function endsWithAnyToken(text, tokens) {
    for (const token of tokens) if (text.endsWith(token)) return token;
    return null;
  }

  function joinSyllablesWithHiatus(syllables, pools) {
    if (syllables.length <= 1) return syllables.join('');
    const vowelTokens = tokenListSortedLongestFirst(pools.vowels);
    let out = syllables[0];
    for (let i = 1; i < syllables.length; i++) {
      let next = syllables[i];
      if (out.endsWith('n') && next.startsWith('n') && !next.startsWith('ng')) {
        next = next.slice(1);
      }
      const prevEndsVowel = !!endsWithAnyToken(out, vowelTokens);
      const nextStartsVowel = !!startsWithAnyToken(next, vowelTokens);
      out += (prevEndsVowel && nextStartsVowel) ? "'" + next : next;
    }
    return out;
  }

  function isVariablePattern(pattern) {
    return pattern.includes('V');
  }

  function isOnsetlessVPattern(pattern) {
    return isVariablePattern(pattern) && pattern.startsWith('V');
  }

  function parseForcedVowel(pattern) {
    const match = pattern.match(/^(.*)\{([^}]+)\}$/);
    if (!match) return { basePattern: pattern, forcedVowels: null };
    return {
      basePattern: match[1],
      forcedVowels: match[2].split('|').map((s) => s.trim()).filter(Boolean),
    };
  }

  function syllableEndsWithN(syllable) {
    return /n$/i.test(syllable || '') && !/ng$/i.test(syllable || '');
  }

  function syllableHasDiphthong(syllable, pools) {
    if (!syllable) return false;
    const diphthongs = [...(pools.diphthongs || []), 'ei'];
    return diphthongs.some((d) => syllable.includes(d));
  }

  function patternHasDiphthong(pattern) {
    return pattern.includes('{ai}') || pattern.includes('{ao}') || pattern.includes('ei');
  }

  function constrainLastPatterns(patterns, previousSyllable, ctx = {}) {
    return patterns.filter((pattern) => {
      if (pattern.includes('{ai}') && !syllableEndsWithN(previousSyllable)) return false;
      if (/^j/.test(pattern) && !(ctx.allowInitialJ || syllableEndsWithN(previousSyllable))) return false;
      if (ctx.usedDiphthong && patternHasDiphthong(pattern)) return false;
      return true;
    });
  }

  function getVowelPoolForPattern(pools, hasConsonantEnding, forcedVowels, ctx = {}) {
    let pool = pools.vowels.slice();
    const diphthongs = pools.diphthongs || [];
    if (ctx.position === 'middle') pool = pool.filter((v) => !diphthongs.includes(v));
    if (ctx.usedDiphthong) pool = pool.filter((v) => !diphthongs.includes(v));
    if (ctx.nameType === 'last' && ctx.position === 'first') pool = pool.filter((v) => v !== 'ai');
    if (forcedVowels && forcedVowels.length) pool = pool.filter((v) => forcedVowels.includes(v));
    if (!hasConsonantEnding || diphthongs.length === 0) return pool;
    const monophthongs = pool.filter((v) => !diphthongs.includes(v));
    return monophthongs.length ? monophthongs : pool;
  }

  function buildSyllableFromPattern(rng, pools, pattern, opts = {}) {
    if (!isVariablePattern(pattern)) return pattern;
    const { basePattern, forcedVowels } = parseForcedVowel(pattern);
    const onsetPool = pools.consonants.concat(pools.clusters);
    const startsWithCV = basePattern.startsWith('CV');
    const startsWithV = basePattern.startsWith('V');
    if (!startsWithCV && !startsWithV) throw new Error(`Unsupported pattern "${pattern}".`);
    const coda = basePattern.slice(startsWithCV ? 2 : 1);
    const vowelPool = getVowelPoolForPattern(pools, coda.length > 0, forcedVowels, opts);
    const nucleus = pickFromRng(rng, vowelPool);
    if (startsWithCV) {
      const forcedOnset = opts.forceOnsetInitialLetter ? String(opts.forceOnsetInitialLetter).toLowerCase() : '';
      const onset = forcedOnset && pools.consonants.includes(forcedOnset) ? forcedOnset : pickFromRng(rng, onsetPool);
      return onset + nucleus + coda;
    }
    return nucleus + coda;
  }

  function pickPattern(rng, patterns, { allowOnsetlessV }) {
    const filtered = allowOnsetlessV ? patterns : patterns.filter((p) => !isOnsetlessVPattern(parseForcedVowel(p).basePattern));
    if (!filtered.length) throw new Error('No valid patterns after filtering.');
    return pickFromRng(rng, filtered);
  }

  function buildPositionedFirstName(rng, positioned, gender, options = {}) {
    const pools = positioned.pools;
    const rules = positioned.firstName;
    const syllables = [];
    let usedDiphthong = false;
    const firstSet = gender === 'male' ? rules.first.male : rules.first.female;
    const middleSet = gender === 'male' ? rules.middle.male : rules.middle.female;
    const lastSetBase = gender === 'male' ? rules.last.male : rules.last.female;
    const syllableCount = clampInt(rules.syllables.min, rules.syllables.min, rules.syllables.max);

    const firstPattern = pickPattern(rng, firstSet.patterns, { allowOnsetlessV: gender === 'female' });
    const firstSyllable = buildSyllableFromPattern(rng, pools, firstPattern, {
      forceOnsetInitialLetter: gender === 'male' ? options.forceFirstNameInitialLetter : undefined,
      position: 'first',
      nameType: 'first',
      usedDiphthong,
    });
    syllables.push(firstSyllable);
    usedDiphthong = usedDiphthong || syllableHasDiphthong(firstSyllable, pools);

    const middleCount = Math.max(0, syllableCount - 2);
    for (let i = 0; i < middleCount; i++) {
      const middlePattern = pickPattern(rng, middleSet.patterns, { allowOnsetlessV: false });
      const middleSyllable = buildSyllableFromPattern(rng, pools, middlePattern, {
        position: 'middle',
        nameType: 'first',
        usedDiphthong,
      });
      syllables.push(middleSyllable);
      usedDiphthong = usedDiphthong || syllableHasDiphthong(middleSyllable, pools);
    }

    const lastPatternOptions = constrainLastPatterns(lastSetBase.patterns, syllables[syllables.length - 1] || '', {
      usedDiphthong,
      allowInitialJ: false,
    });
    const lastPattern = pickPattern(rng, lastPatternOptions, { allowOnsetlessV: false });
    const lastSyllable = buildSyllableFromPattern(rng, pools, lastPattern, {
      position: 'last',
      nameType: 'first',
      usedDiphthong,
    });
    syllables.push(lastSyllable);

    return joinSyllablesWithHiatus(syllables, pools);
  }

  function buildMaoAoSurname(rng, positioned) {
    const pools = positioned.pools;
    const firstNameRules = positioned.firstName;
    const syllables = [];
    let usedDiphthong = false;

    const firstPattern = pickPattern(rng, firstNameRules.first.male.patterns, { allowOnsetlessV: false });
    const firstSyllable = buildSyllableFromPattern(rng, pools, firstPattern, {
      position: 'first',
      nameType: 'last',
      usedDiphthong,
    });
    syllables.push(firstSyllable);
    usedDiphthong = usedDiphthong || syllableHasDiphthong(firstSyllable, pools);

    const lastPatternOptions = constrainLastPatterns(firstNameRules.last.male.patterns, syllables[0] || '', {
      usedDiphthong,
      allowInitialJ: false,
    });
    const lastPattern = pickPattern(rng, lastPatternOptions, { allowOnsetlessV: false });
    const lastSyllable = buildSyllableFromPattern(rng, pools, lastPattern, {
      position: 'last',
      nameType: 'last',
      usedDiphthong,
    });
    syllables.push(lastSyllable);

    return joinSyllablesWithHiatus(syllables, pools);
  }

  function hashStringToSeed(text) {
    let h = 2166136261 >>> 0;
    const input = String(text || '');
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function rand() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function generateMaoAoNameFromSeed(seedString, gender = 'male', culture) {
    const resolvedCulture = culture || {};
    const numericSeed = hashStringToSeed(seedString);
    const rng = mulberry32(numericSeed);
    const surname = buildMaoAoSurname(rng, resolvedCulture.positionedSyllables);
    const forceInitial = resolvedCulture.birthRules?.maleFirstInitialMatchesSurnameFirstLetter && gender === 'male' && surname
      ? String(surname[0]).toLowerCase()
      : undefined;
    const firstName = buildPositionedFirstName(rng, resolvedCulture.positionedSyllables, gender, {
      forceFirstNameInitialLetter: forceInitial,
    });
    return [applyCasing(firstName, resolvedCulture.casing), applyCasing(surname, resolvedCulture.casing)].filter(Boolean).join(' ');
  }

  function resolveConfig() {
    const gameConfig = root.SCRATCHBONES_CONFIG?.game || {};
    const generationConfig = gameConfig.nameGeneration || {};
    const cultures = generationConfig.cultures || {};
    const defaultCultureId = generationConfig.defaultCultureId || 'mao_ao';
    const defaultCulture = cultures[defaultCultureId] || cultures.mao_ao;
    return {
      defaultCulture,
      seedPrefix: generationConfig.seedPrefix || 'madiao-player',
    };
  }

  function generateIdentityFromSeed(seedString, gender = 'male') {
    const { defaultCulture } = resolveConfig();
    if (!defaultCulture) throw new Error('Missing scratchbones name generation culture configuration.');
    return generateMaoAoNameFromSeed(seedString, gender, defaultCulture);
  }

  root.SCRATCHBONES_NAME_GENERATOR = {
    hashStringToSeed,
    generateIdentityFromSeed,
  };
})(window);
