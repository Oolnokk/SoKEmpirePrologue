// namegen.js
// ES Module version - exports at bottom for reuse in browser

/**
 * @typedef {"male"|"female"} Gender
 * @typedef {{ first: string, middle?: string, last?: string }} NameParts
 * @typedef {{ label: string, data?: any }} DebugStep
 *
 * Pattern language:
 * - Variable patterns: "V", "Vn", "Vng", "CV", "CVn", "CVng", "CVr"
 * - Fixed syllables: anything without "V" (e.g. "jei", "ji", "jo")
 * - NEW: vowel-fixed variants for CV/V:
 *    - "CV{a}" forces vowel nucleus to "a"
 *    - "CV{i}" forces vowel nucleus to "i"
 *    - (also supports "CV{a|i}" if you ever want it)
 */

/**
 * @typedef {{ patterns: string[] }} PatternSet
 *
 * @typedef {{
 *   id: string,
 *   displayName: string,
 *   casing?: "title"|"lower"|"upper",
 *   positionedSyllables?: {
 *     pools: {
 *       consonants: string[],
 *       clusters: string[],
 *       vowels: string[],
 *       diphthongs?: string[]
 *     },
 *     firstName: {
 *       syllables: { min: number, max: number, weightsByCount?: Record<number, number> },
 *       first: { male: PatternSet, female: PatternSet },
 *       middle: { male: PatternSet, female: PatternSet },
 *       last: { male: PatternSet, female: PatternSet },
 *       conditionalLast?: {
 *         male?: { ifPrevEndsWith?: string, addFixedOptions?: string[] },
 *         female?: { ifPrevEndsWith?: string, addFixedOptions?: string[] },
 *       }
 *     },
 *     lastName: {
 *       syllables: { exact: number },
 *       deriveFromFirstNameMaleRules: true
 *     }
 *   },
 *   birthRules?: {
 *     surnameFromParent?: boolean,
 *     maleFirstInitialMatchesSurnameFirstLetter?: boolean
 *   },
 *   marriageRules?: {
 *     wifeTakesHusbandSurname?: boolean,
 *     wifePrefixesHusbandFirstInitial?: boolean
 *   }
 * }} CultureSpec
 *
 * @typedef {{
 *  gender: Gender,
 *  seed?: number,
 *  debug?: boolean,
 *  parentSurname?: string,
 *  spouseName?: string,
 *  spouseGender?: Gender
 * }} GenerateOptions
 */

/// ----------------------------- RNG (seedable) -----------------------------
function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) {
  if (!arr || arr.length === 0) throw new Error("pick() called with empty array");
  return arr[Math.floor(rng() * arr.length)];
}
function clampInt(n, min, max) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}
function titleCase(s) {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}
function applyCasing(s, casing) {
  if (!casing) return s;
  if (casing === "lower") return s.toLowerCase();
  if (casing === "upper") return s.toUpperCase();
  return titleCase(s);
}
function parseName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "" };
  if (parts.length === 1) return { first: parts[0] };
  if (parts.length === 2) return { first: parts[0], last: parts[1] };
  return { first: parts[0], middle: parts.slice(1, -1).join(" "), last: parts[parts.length - 1] };
}
function initialOf(first) {
  const c = String(first || "").trim().slice(0, 1);
  return c ? c.toUpperCase() : "";
}
function formatPatronymicSurname(prefix, fatherFirstName, casing) {
  const formattedFather = applyCasing(fatherFirstName, casing);
  return `${String(prefix || "").toLowerCase()} ${formattedFather}`;
}

/// ------------------------- Syllable count helpers -------------------------
function pickSyllableCount(rng, cfg, debugSteps, label) {
  const min = cfg.min, max = cfg.max;
  if (min > max) throw new Error(`Invalid syllable range: min ${min} > max ${max}`);
  if (min === max) {
    debugSteps && debugSteps.push({ label, data: { count: min, mode: "exact" } });
    return min;
  }
  const count = clampInt(Math.floor(rng() * (max - min + 1)) + min, min, max);
  debugSteps && debugSteps.push({ label, data: { count, mode: "uniform", min, max } });
  return count;
}

/// --------------------- Vowel hiatus joiner ("...a'ey...") ------------------
function tokenListSortedLongestFirst(tokens) {
  return (tokens || []).slice().sort((a, b) => b.length - a.length);
}
function startsWithAnyToken(str, tokens) {
  for (const t of tokens) if (str.startsWith(t)) return t;
  return null;
}
function endsWithAnyToken(str, tokens) {
  for (const t of tokens) if (str.endsWith(t)) return t;
  return null;
}
function joinSyllablesWithHiatus(syllables, pools) {
  if (syllables.length <= 1) return syllables.join("");
  const tokens = tokenListSortedLongestFirst(pools.vowels);
  let out = syllables[0];
  for (let i = 1; i < syllables.length; i++) {
    const prevEndsVowel = !!endsWithAnyToken(out, tokens);
    const nextStartsVowel = !!startsWithAnyToken(syllables[i], tokens);
    out += (prevEndsVowel && nextStartsVowel) ? "'" + syllables[i] : syllables[i];
  }
  return out;
}

/// --------------------- Pattern parsing helpers ----------------------------
function isVariablePattern(pat) {
  return pat.includes("V");
}
function isOnsetlessVPattern(pattern) {
  return isVariablePattern(pattern) && pattern.startsWith("V");
}

/**
 * Extracts an optional vowel constraint from patterns like "CV{a}" or "CV{a|i}".
 * Returns { basePattern, forcedVowels|null }.
 */
function parseForcedVowel(pattern) {
  const m = pattern.match(/^(.*)\{([^}]+)\}$/);
  if (!m) return { basePattern: pattern, forcedVowels: null };
  const basePattern = m[1];
  const forcedVowels = m[2].split("|").map(s => s.trim()).filter(Boolean);
  return { basePattern, forcedVowels: forcedVowels.length ? forcedVowels : null };
}

/**
 * Diphthong restriction: if syllable has a consonant ending (n/ng/r), exclude diphthongs.
 */
function getVowelPoolForPattern(pools, hasConsonantEnding, forcedVowels) {
  let pool = pools.vowels.slice();

  // Apply forced vowel constraint first (if any)
  if (forcedVowels && forcedVowels.length) {
    pool = pool.filter(v => forcedVowels.includes(v));
    if (!pool.length) {
      throw new Error(`Forced vowels {${forcedVowels.join("|")}} not present in culture vowel pool.`);
    }
  }

  const dip = pools.diphthongs || [];
  if (!hasConsonantEnding || dip.length === 0) return pool;

  const mono = pool.filter(v => !dip.includes(v));
  return mono.length ? mono : pool;
}

/**
 * Build one syllable from a pattern.
 * Enforces diphthong rule. Supports forced vowels via {...}.
 */
function buildSyllableFromPattern(rng, pools, pattern, opts) {
  // Fixed syllable (no "V")
  if (!isVariablePattern(pattern)) return pattern;

  const { basePattern, forcedVowels } = parseForcedVowel(pattern);

  const onsetPool = pools.consonants.concat(pools.clusters);

  const startsWithCV = basePattern.startsWith("CV");
  const startsWithV = basePattern.startsWith("V");
  if (!startsWithCV && !startsWithV) {
    throw new Error(`Unsupported pattern "${pattern}". Expected to start with "V" or "CV".`);
  }

  if (startsWithCV) {
    const forced = (opts && opts.forceOnsetInitialLetter) ? String(opts.forceOnsetInitialLetter).toLowerCase() : "";
    const onset = forced && pools.consonants.includes(forced) ? forced : pick(rng, onsetPool);

    const coda = basePattern.slice(2); // "", "n", "ng", "r"
    const vowelPool = getVowelPoolForPattern(pools, coda.length > 0, forcedVowels);
    const nucleus = pick(rng, vowelPool);

    opts?.debugSteps?.push?.({
      label: `${opts.debugLabel || "syllable"}.vowelChoice`,
      data: {
        nucleus,
        excludedDiphthongs: coda.length > 0,
        forcedVowels: forcedVowels || null
      }
    });

    return onset + nucleus + coda;
  }

  // startsWithV (onsetless)
  const coda = basePattern.slice(1); // "", "n", "ng"
  const vowelPool = getVowelPoolForPattern(pools, coda.length > 0, forcedVowels);
  const nucleus = pick(rng, vowelPool);

  opts?.debugSteps?.push?.({
    label: `${opts.debugLabel || "syllable"}.vowelChoice`,
    data: {
      nucleus,
      excludedDiphthongs: coda.length > 0,
      forcedVowels: forcedVowels || null
    }
  });

  return nucleus + coda;
}

/**
 * Picks pattern from list, optionally filtering out onsetless V-patterns ("V", "Vn", "Vng").
 */
function pickPattern(rng, patterns, { allowOnsetlessV, debugSteps, debugLabel }) {
  const filtered = allowOnsetlessV ? patterns : patterns.filter(p => !isOnsetlessVPattern(parseForcedVowel(p).basePattern));
  if (!filtered.length) {
    throw new Error(`No valid patterns after filtering (allowOnsetlessV=${allowOnsetlessV}).`);
  }
  const chosen = pick(rng, filtered);
  debugSteps && debugSteps.push({ label: debugLabel, data: chosen });
  return chosen;
}

function weightedPick(rng, entries) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}
function weightedPickValue(rng, values, weightMap) {
  const entries = values
    .map(value => ({ value, weight: Number((weightMap || {})[value] ?? 1) }))
    .filter(entry => entry.weight > 0);
  if (!entries.length) throw new Error('weightedPickValue() received no positive-weight values.');
  return weightedPick(rng, entries).value;
}

function getKenkariVowelPool(phonology, opts = {}) {
  const isFinal = !!opts.isFinal;
  const allowMarked = !!opts.allowMarked;
  let pool = phonology.vowels.slice();
  if (!allowMarked) {
    pool = pool.filter(v => v !== "ai" && v !== "ey");
  }
  if (isFinal) {
    return pool
      .filter(v => v !== "e")
      .concat((phonology.finalOnlyVowels || []).filter(v => v !== "e" && (allowMarked || v !== "ao")));
  }
  return pool.filter(v => !(phonology.finalOnlyVowels || []).includes(v));
}

function chooseKenkariTemplate(rng, phonology, debugSteps) {
  const entry = weightedPick(rng, phonology.templateWeights);
  debugSteps && debugSteps.push({ label: "firstName.template", data: { label: entry.label, pattern: entry.pattern } });
  return entry.pattern.slice();
}

function buildKenkariPhonemeByType(rng, phonology, type, opts = {}) {
  const vowelPool = getKenkariVowelPool(phonology, opts);
  const vowelWeightMap = opts.isFinal ? (phonology.finalVowelWeights || phonology.vowelWeights) : phonology.vowelWeights;
  const vowel = weightedPickValue(rng, vowelPool, vowelWeightMap);
  const position = Number.isFinite(opts.position) ? opts.position : 0;
  let consonant = null;
  let phoneme = "";

  if (type === "V") {
    if (position > 0) throw new Error('Kenkari lone vowels may only appear at the beginning of a name.');
    phoneme = vowel;
  } else if (type === "CV") {
    const consonantWeightMap = opts.afterGlottal && opts.isFinal
      ? (phonology.postGlottalFinalConsonantWeights || phonology.finalConsonantWeights || phonology.consonantWeights)
      : (opts.isFinal ? (phonology.finalConsonantWeights || phonology.consonantWeights) : phonology.consonantWeights);
    consonant = weightedPickValue(rng, phonology.consonants, consonantWeightMap);
    phoneme = consonant + vowel;
  } else if (type === "'V") {
    phoneme = "'" + vowel;
  } else {
    throw new Error(`Unsupported Kenkari phoneme type: ${type}`);
  }

  return { type, consonant, vowel, phoneme };
}

function countApostrophes(s) {
  return (String(s || "").match(/'/g) || []).length;
}
function countMarkedVowels(s) {
  return (String(s || "").match(/ai|ey|ao/g) || []).length;
}
function getKenkariGenderConflict(name, gender, phonemes = []) {
  const lower = String(name || '').toLowerCase();
  const firstPhoneme = String(phonemes[0] || '').toLowerCase();
  const firstConsonant = /^[bgkhmnprt]/.test(firstPhoneme) ? firstPhoneme[0] : '';
  const hasMaleOnlyP = lower.includes('p');
  const hasMaleOnlyInitial = firstConsonant === 'r' || firstConsonant === 't';
  const hasFemaleOnlyEnding = /(?:mi|mey)$/i.test(lower);

  if (gender === 'female' && hasMaleOnlyP) return { code: 'female_has_male_only_p' };
  if (gender === 'female' && hasMaleOnlyInitial) return { code: 'female_has_male_only_initial' };
  if (gender === 'male' && hasFemaleOnlyEnding) return { code: 'male_has_female_only_ending' };
  return null;
}
function phonemeHasIVowel(phoneme) {
  return /i/.test(String(phoneme || '').toLowerCase());
}
function phonemeHasAVowel(phoneme) {
  return /a/.test(String(phoneme || '').toLowerCase());
}
function hasIVowelBeforeAVowel(phonemes) {
  let seenI = false;
  for (const phoneme of phonemes || []) {
    if (seenI && phonemeHasAVowel(phoneme)) return true;
    if (phonemeHasIVowel(phoneme)) seenI = true;
  }
  return false;
}

function buildKenkariGivenName(rng, culture, gender, debugSteps) {
  const phonology = culture.kenkariRules.phonology;
  let lastAttempt = null;

  for (let attempt = 1; attempt <= 40; attempt++) {
    const template = chooseKenkariTemplate(rng, phonology, debugSteps);
    const phonemes = [];
    const localDebug = [];
    let apostropheCount = 0;

    for (let i = 0; i < template.length; i++) {
      const type = template[i];
      const isFinal = i === template.length - 1;
      const usedMarkedEarlier = phonemes.some(p => /ai|ey|ao/.test(p));
      const previousType = i > 0 ? template[i - 1] : null;
      const allowMarked = isFinal ? (rng() < 0.28) : (!usedMarkedEarlier && rng() < 0.18);
      const built = buildKenkariPhonemeByType(rng, phonology, type, {
        isFinal,
        allowMarked,
        position: i,
        afterGlottal: previousType === "'V"
      });
      if (type === "'V") apostropheCount += 1;
      phonemes.push(built.phoneme);
      localDebug.push({
        label: `firstName.phoneme[${i}]`,
        data: { position: i, totalCount: template.length, isFinal, allowMarked, ...built }
      });
    }

    let name = phonemes.join("");
    name = name.replace(/e(?=')/g, 'ey');
    const markedCount = countMarkedVowels(name);
    const validLength = phonemes.length >= phonology.minPhonemes && phonemes.length <= phonology.maxPhonemes;
    const validFinal = !/e$/i.test(name);
    const validApostrophes = apostropheCount <= 1;
    const validMarked = markedCount <= 1;
    const validInternalLoneVowels = template.every((part, index) => index === 0 || part !== 'V');
    const validEndingShape = !/(pey|ora)$/i.test(name);
    const validIVowelSequence = !hasIVowelBeforeAVowel(phonemes);
    const genderConflict = getKenkariGenderConflict(name, gender, phonemes);
    const validGenderMarkers = !genderConflict;

    lastAttempt = { attempt, template, phonemes, name, apostropheCount, markedCount, validLength, validFinal, validApostrophes, validMarked, validInternalLoneVowels, validEndingShape, validIVowelSequence, validGenderMarkers, genderConflict };

    if (validLength && validFinal && validApostrophes && validMarked && validInternalLoneVowels && validEndingShape && validIVowelSequence && validGenderMarkers) {
      debugSteps && debugSteps.push({ label: "firstName.phonemeCount", data: { count: phonemes.length, gender, min: phonology.minPhonemes, max: phonology.maxPhonemes, attempt } });
      if (debugSteps) debugSteps.push(...localDebug);
      debugSteps && debugSteps.push({ label: "firstName.compound", data: { template, phonemes, name, apostropheCount, markedCount, genderConflict: null } });
      return name;
    }
  }

  throw new Error(`Could not generate a Kenkari name within the current template rules. Last attempt: ${JSON.stringify(lastAttempt)}`);
}

function buildKenkariPatronymicSurname(culture, gender, fatherFirstName, debugSteps) {
  const prefix = gender === "female"
    ? culture.kenkariRules.surnameRules.femalePrefix
    : culture.kenkariRules.surnameRules.malePrefix;
  const surname = formatPatronymicSurname(prefix, fatherFirstName, culture.casing);
  debugSteps && debugSteps.push({ label: "lastName.patronymic", data: { prefix, fatherFirstName, surname } });
  return surname;
}

/// --------------------- Mao-ao name construction ---------------------------

function buildPositionedFirstName(rng, positioned, gender, opt) {
  const debugSteps = opt.debugSteps;
  const pools = positioned.pools;
  const rules = positioned.firstName;

  const syllCount = pickSyllableCount(rng, rules.syllables, debugSteps, "firstName.syllableCount");

  const firstSet = gender === "male" ? rules.first.male : rules.first.female;
  const midSet = gender === "male" ? rules.middle.male : rules.middle.female;
  const lastSetBase = gender === "male" ? rules.last.male : rules.last.female;

  const enc = [];

  // FIRST syllable:
  // Only female first syllable may be onsetless ("V*")
  const firstPat = pickPattern(rng, firstSet.patterns, {
    allowOnsetlessV: (gender === "female"),
    debugSteps,
    debugLabel: "firstName.first.pattern"
  });

  const firstSyl = buildSyllableFromPattern(rng, pools, firstPat, {
    forceOnsetInitialLetter: (gender === "male" ? opt.forceFirstNameInitialLetter : undefined),
    debugSteps,
    debugLabel: "firstName.first"
  });
  enc.push(firstSyl);

  // MIDDLE syllables: onsetless forbidden
  const middleCount = Math.max(0, syllCount - 2);
  for (let i = 0; i < middleCount; i++) {
    const midPat = pickPattern(rng, midSet.patterns, {
      allowOnsetlessV: false,
      debugSteps,
      debugLabel: `firstName.middle[${i}].pattern`
    });
    enc.push(buildSyllableFromPattern(rng, pools, midPat, { debugSteps, debugLabel: `firstName.middle[${i}]` }));
  }

  // LAST syllable:
  let lastPatterns = lastSetBase.patterns.slice();

  const cond = rules.conditionalLast && (gender === "male" ? rules.conditionalLast.male : rules.conditionalLast.female);
  if (cond?.ifPrevEndsWith && cond.addFixedOptions?.length) {
    const prev = enc[enc.length - 1] || "";
    if (prev.endsWith(cond.ifPrevEndsWith)) {
      lastPatterns = lastPatterns.concat(cond.addFixedOptions);
      debugSteps && debugSteps.push({
        label: "firstName.last.conditionalApplied",
        data: { prev, ifPrevEndsWith: cond.ifPrevEndsWith, added: cond.addFixedOptions }
      });
    }
  }

  const lastPat = pickPattern(rng, lastPatterns, {
    allowOnsetlessV: false,
    debugSteps,
    debugLabel: "firstName.last.pattern"
  });
  enc.push(buildSyllableFromPattern(rng, pools, lastPat, { debugSteps, debugLabel: "firstName.last" }));

  return joinSyllablesWithHiatus(enc, pools);
}

function buildMaoAoSurname(rng, positioned, opt) {
  const debugSteps = opt.debugSteps;
  const pools = positioned.pools;
  const rules = positioned.firstName;

  const syls = [];

  const firstPat = pickPattern(rng, rules.first.male.patterns, {
    allowOnsetlessV: false,
    debugSteps,
    debugLabel: "lastName.first.pattern"
  });
  syls.push(buildSyllableFromPattern(rng, pools, firstPat, { debugSteps, debugLabel: "lastName.first" }));

  let lastPatterns = rules.last.male.patterns.slice();
  const cond = rules.conditionalLast && rules.conditionalLast.male;
  if (cond?.ifPrevEndsWith && cond.addFixedOptions?.length) {
    if (syls[0].endsWith(cond.ifPrevEndsWith)) {
      lastPatterns = lastPatterns.concat(cond.addFixedOptions);
      debugSteps && debugSteps.push({
        label: "lastName.last.conditionalApplied",
        data: { prev: syls[0], ifPrevEndsWith: cond.ifPrevEndsWith, added: cond.addFixedOptions }
      });
    }
  }

  const lastPat = pickPattern(rng, lastPatterns, {
    allowOnsetlessV: false,
    debugSteps,
    debugLabel: "lastName.last.pattern"
  });
  syls.push(buildSyllableFromPattern(rng, pools, lastPat, { debugSteps, debugLabel: "lastName.last" }));

  return joinSyllablesWithHiatus(syls, pools);
}

/// -------------------------- Birth + marriage rules -------------------------
function applyBirthRules(culture, parts, opts, debugSteps) {
  const rules = culture.birthRules || {};
  const out = { ...parts };

  if (rules.surnameFromParent && opts.parentSurname) {
    out.last = String(opts.parentSurname).trim();
    debugSteps && debugSteps.push({ label: "birth.surnameFromParent", data: out.last });
  }

  if (rules.maleFirstInitialMatchesSurnameFirstLetter && opts.gender === "male" && out.first && out.last) {
    debugSteps && debugSteps.push({
      label: "birth.maleFirstInitialCheck",
      data: { firstInitial: out.first[0], surnameFirstLetter: out.last[0] }
    });
  }

  return out;
}

function applyMarriageRules(culture, parts, opts, debugSteps) {
  const rules = culture.marriageRules || {};
  if (!opts.spouseName) return parts;

  const spouse = parseName(opts.spouseName);
  const spouseIsMale = opts.spouseGender ? opts.spouseGender === "male" : true;

  const out = { ...parts };

  if (opts.gender === "female" && spouseIsMale) {
    if (rules.wifePrefixesHusbandFirstInitial && spouse.first) {
      const ini = initialOf(spouse.first);
      if (ini) {
        out.first = ini + out.first;
        debugSteps && debugSteps.push({ label: "marriage.wifePrefixesHusbandFirstInitial", data: ini });
      }
    }
    if (rules.wifeTakesHusbandSurname && spouse.last) {
      out.last = spouse.last;
      debugSteps && debugSteps.push({ label: "marriage.wifeTakesHusbandSurname", data: spouse.last });
    }
  }

  return out;
}

/// ------------------------------ Public API --------------------------------
export function generateName(culture, opts) {
  const seed = ((opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31)) >>> 0);
  const rng = mulberry32(seed);
  const debugSteps = opts.debug ? [] : undefined;

  if (culture.kenkariRules) {
    const firstName = buildKenkariGivenName(rng, culture, opts.gender, debugSteps);
    const suppliedFather = String(opts.fatherFirstName || "").trim();
    const fatherFirstName = suppliedFather
      ? (parseName(suppliedFather).first || suppliedFather)
      : buildKenkariGivenName(rng, culture, "male", debugSteps);
    debugSteps && debugSteps.push({ label: suppliedFather ? "lastName.father.supplied" : "lastName.father.generated", data: fatherFirstName });

    const surname = buildKenkariPatronymicSurname(culture, opts.gender, fatherFirstName, debugSteps);
    const parts = {
      first: applyCasing(firstName, culture.casing),
      last: surname,
    };
    return { name: [parts.first, parts.last].filter(Boolean).join(" "), parts, seed, debug: debugSteps };
  }

  if (!culture.positionedSyllables) throw new Error(`Culture "${culture.id}" has no positionedSyllables rules.`);

  // surname inherited or generated
  let surname = "";
  if (culture.birthRules?.surnameFromParent && opts.parentSurname) {
    surname = String(opts.parentSurname).trim();
    debugSteps && debugSteps.push({ label: "lastName.inherited", data: surname });
  } else {
    surname = buildMaoAoSurname(rng, culture.positionedSyllables, { debugSteps });
    debugSteps && debugSteps.push({ label: "lastName.generated", data: surname });
  }

  // male birth rule: first letter matches surname first letter (forced as onset initial)
  const forceInitial =
    (culture.birthRules?.maleFirstInitialMatchesSurnameFirstLetter && opts.gender === "male" && surname)
      ? String(surname[0]).toLowerCase()
      : undefined;

  const firstName = buildPositionedFirstName(rng, culture.positionedSyllables, opts.gender, {
    forceFirstNameInitialLetter: forceInitial,
    debugSteps
  });

  /** @type {NameParts} */
  let parts = { first: firstName, last: surname };

  parts = applyBirthRules(culture, parts, opts, debugSteps);
  parts = applyMarriageRules(culture, parts, opts, debugSteps);

  parts.first = applyCasing(parts.first, culture.casing);
  if (parts.last) parts.last = applyCasing(parts.last, culture.casing);

  return { name: [parts.first, parts.last].filter(Boolean).join(" "), parts, seed, debug: debugSteps };
}

export function generateMany(culture, opts, count) {
  const out = [];
  const baseSeed = opts.seed ?? 12345;
  for (let i = 0; i < count; i++) out.push(generateName(culture, { ...opts, seed: baseSeed + i }));
  return out;
}

/// --------------------------- Mao-ao culture data ---------------------------

/** @type {Record<string, CultureSpec>} */
export const CULTURES = {
  mao_ao: {
    id: "mao_ao",
    displayName: "Mao-ao",
    casing: "title",

    birthRules: { surnameFromParent: true, maleFirstInitialMatchesSurnameFirstLetter: true },
    marriageRules: { wifeTakesHusbandSurname: true, wifePrefixesHusbandFirstInitial: true },

    positionedSyllables: {
      pools: {
        consonants: ["w", "r", "t", "y", "p", "s", "f", "g", "h", "b", "n", "m", "k"],
        clusters: ["sh", "zh", "ng", "hy"],
        vowels: ["a", "e", "i", "o", "u", "ai", "ao", "ey"],
        diphthongs: ["ai", "ao", "ey"], // excluded when a syllable has a consonant ending
      },

      firstName: {
        syllables: { min: 3, max: 3 }, // exactly 3 for BOTH genders

        // Female first syllable is the only place we allow V/Vn/Vng
        first: {
          female: { patterns: ["V", "Vn", "Vng"] },
          male: { patterns: ["CV", "CVn", "CVng", "CVr"] },
        },

        // Middle syllables must start with consonant/cluster (no V*)
        middle: {
          female: { patterns: ["CV", "CVn", "CVng"] },
          male: { patterns: ["CV", "CVn", "CVng", "CVr"] },
        },

        // Last syllables MUST also start with consonant/cluster now.
        last: {
          male: { patterns: ["jei", "ji", "jo"] },
          female: { patterns: ["CV{a}", "CV{i}"] },
        },

        conditionalLast: {},
      },

      lastName: {
        syllables: { exact: 2 },
        deriveFromFirstNameMaleRules: true,
      },
    },
  },
  kenkari: {
    id: "kenkari",
    displayName: "Kenkari",
    casing: "title",
    kenkariRules: {
      phonology: {
        consonants: ["b", "g", "h", "k", "m", "n", "p", "r", "t"],
        consonantWeights: { b: 1, g: 7, h: 7, k: 11, m: 10, n: 10, p: 8, r: 8, t: 8 },
        finalConsonantWeights: { b: 1, g: 4, h: 3, k: 12, m: 12, n: 13, p: 5, r: 3, t: 4 },
        postGlottalFinalConsonantWeights: { b: 1, g: 3, h: 2, k: 12, m: 12, n: 14, p: 3, r: 1, t: 2 },
        vowels: ["a", "e", "i", "o", "u", "ai", "ey"],
        vowelWeights: { a: 11, e: 4, i: 11, o: 8, u: 10, ai: 4, ey: 4 },
        finalVowelWeights: { a: 12, i: 13, o: 4, u: 11, ai: 5, ey: 0, ao: 5 },
        finalOnlyVowels: ["ao"],
        minPhonemes: 2,
        maxPhonemes: 4,
        templateWeights: [
          { pattern: ["V", "'V", "CV"], weight: 18, label: "V'CV" },
          { pattern: ["CV", "'V"], weight: 18, label: "CV'V" },
          { pattern: ["CV", "CV"], weight: 18, label: "CVCV" },
          { pattern: ["CV", "'V", "CV"], weight: 16, label: "CV'VCV" },
          { pattern: ["CV", "CV", "CV"], weight: 12, label: "CVCVCV" },
          { pattern: ["V", "'V", "CV", "CV"], weight: 8, label: "V'VCVCV" }
        ],
      },
      surnameRules: {
        malePrefix: "ao",
        femalePrefix: "u",
      },
    },
  },
};

// Export default for convenience
export default { CULTURES, generateName, generateMany };
