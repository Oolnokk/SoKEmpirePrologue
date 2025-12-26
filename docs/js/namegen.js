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
};

// Export default for convenience
export default { CULTURES, generateName, generateMany };
