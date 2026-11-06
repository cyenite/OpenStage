/**
 * The 66 books in canonical order. `usfm` is the id used everywhere in OpenStage; `osis` and the
 * index (Zefania's bnumber) are only for reading Bible files. Names and abbreviations feed the
 * reference parser, in English and Swahili from day one.
 */
export const bibleBooks = [
  { usfm: 'GEN', osis: 'Gen', chapters: 50, en: 'Genesis', sw: 'Mwanzo', abbreviations: ['gen', 'ge', 'gn', 'mwa'] },
  { usfm: 'EXO', osis: 'Exod', chapters: 40, en: 'Exodus', sw: 'Kutoka', abbreviations: ['exo', 'ex', 'exod', 'kut'] },
  { usfm: 'LEV', osis: 'Lev', chapters: 27, en: 'Leviticus', sw: 'Mambo ya Walawi', abbreviations: ['lev', 'lv', 'law', 'walawi'] },
  { usfm: 'NUM', osis: 'Num', chapters: 36, en: 'Numbers', sw: 'Hesabu', abbreviations: ['num', 'nm', 'nb', 'hes'] },
  { usfm: 'DEU', osis: 'Deut', chapters: 34, en: 'Deuteronomy', sw: 'Kumbukumbu la Torati', abbreviations: ['deut', 'deu', 'dt', 'kum'] },
  { usfm: 'JOS', osis: 'Josh', chapters: 24, en: 'Joshua', sw: 'Yoshua', abbreviations: ['josh', 'jos', 'yos'] },
  { usfm: 'JDG', osis: 'Judg', chapters: 21, en: 'Judges', sw: 'Waamuzi', abbreviations: ['judg', 'jdg', 'jg', 'amu', 'waam'] },
  { usfm: 'RUT', osis: 'Ruth', chapters: 4, en: 'Ruth', sw: 'Ruthu', abbreviations: ['ruth', 'rut', 'ru', 'rth'] },
  { usfm: '1SA', osis: '1Sam', chapters: 31, en: '1 Samuel', sw: '1 Samweli', abbreviations: ['1sam', '1sa', '1sm', '1 sam'] },
  { usfm: '2SA', osis: '2Sam', chapters: 24, en: '2 Samuel', sw: '2 Samweli', abbreviations: ['2sam', '2sa', '2sm', '2 sam'] },
  { usfm: '1KI', osis: '1Kgs', chapters: 22, en: '1 Kings', sw: '1 Wafalme', abbreviations: ['1kgs', '1ki', '1kg', '1fal', '1 kgs'] },
  { usfm: '2KI', osis: '2Kgs', chapters: 25, en: '2 Kings', sw: '2 Wafalme', abbreviations: ['2kgs', '2ki', '2kg', '2fal', '2 kgs'] },
  { usfm: '1CH', osis: '1Chr', chapters: 29, en: '1 Chronicles', sw: '1 Mambo ya Nyakati', abbreviations: ['1chr', '1ch', '1nya', '1 chr'] },
  { usfm: '2CH', osis: '2Chr', chapters: 36, en: '2 Chronicles', sw: '2 Mambo ya Nyakati', abbreviations: ['2chr', '2ch', '2nya', '2 chr'] },
  { usfm: 'EZR', osis: 'Ezra', chapters: 10, en: 'Ezra', sw: 'Ezra', abbreviations: ['ezra', 'ezr'] },
  { usfm: 'NEH', osis: 'Neh', chapters: 13, en: 'Nehemiah', sw: 'Nehemia', abbreviations: ['neh', 'ne'] },
  { usfm: 'EST', osis: 'Esth', chapters: 10, en: 'Esther', sw: 'Esta', abbreviations: ['esth', 'est', 'es'] },
  { usfm: 'JOB', osis: 'Job', chapters: 42, en: 'Job', sw: 'Ayubu', abbreviations: ['job', 'jb', 'ayu'] },
  { usfm: 'PSA', osis: 'Ps', chapters: 150, en: 'Psalms', sw: 'Zaburi', abbreviations: ['ps', 'psa', 'psalm', 'pss', 'zab'] },
  { usfm: 'PRO', osis: 'Prov', chapters: 31, en: 'Proverbs', sw: 'Mithali', abbreviations: ['prov', 'pro', 'prv', 'pr', 'mit', 'methali'] },
  { usfm: 'ECC', osis: 'Eccl', chapters: 12, en: 'Ecclesiastes', sw: 'Mhubiri', abbreviations: ['eccl', 'ecc', 'ec', 'qoh', 'mhu'] },
  { usfm: 'SNG', osis: 'Song', chapters: 8, en: 'Song of Songs', sw: 'Wimbo Ulio Bora', abbreviations: ['song', 'sng', 'sos', 'song of solomon', 'canticles', 'wim', 'wimbo'] },
  { usfm: 'ISA', osis: 'Isa', chapters: 66, en: 'Isaiah', sw: 'Isaya', abbreviations: ['isa', 'is'] },
  { usfm: 'JER', osis: 'Jer', chapters: 52, en: 'Jeremiah', sw: 'Yeremia', abbreviations: ['jer', 'je', 'jr', 'yer'] },
  { usfm: 'LAM', osis: 'Lam', chapters: 5, en: 'Lamentations', sw: 'Maombolezo', abbreviations: ['lam', 'la', 'omb'] },
  { usfm: 'EZK', osis: 'Ezek', chapters: 48, en: 'Ezekiel', sw: 'Ezekieli', abbreviations: ['ezek', 'eze', 'ezk'] },
  { usfm: 'DAN', osis: 'Dan', chapters: 12, en: 'Daniel', sw: 'Danieli', abbreviations: ['dan', 'da', 'dn'] },
  { usfm: 'HOS', osis: 'Hos', chapters: 14, en: 'Hosea', sw: 'Hosea', abbreviations: ['hos', 'ho'] },
  { usfm: 'JOL', osis: 'Joel', chapters: 3, en: 'Joel', sw: 'Yoeli', abbreviations: ['joel', 'jol', 'jl', 'yoe'] },
  { usfm: 'AMO', osis: 'Amos', chapters: 9, en: 'Amos', sw: 'Amosi', abbreviations: ['amos', 'amo', 'am'] },
  { usfm: 'OBA', osis: 'Obad', chapters: 1, en: 'Obadiah', sw: 'Obadia', abbreviations: ['obad', 'oba', 'ob'] },
  { usfm: 'JON', osis: 'Jonah', chapters: 4, en: 'Jonah', sw: 'Yona', abbreviations: ['jonah', 'jon', 'jnh', 'yon'] },
  { usfm: 'MIC', osis: 'Mic', chapters: 7, en: 'Micah', sw: 'Mika', abbreviations: ['mic', 'mi', 'mik'] },
  { usfm: 'NAM', osis: 'Nah', chapters: 3, en: 'Nahum', sw: 'Nahumu', abbreviations: ['nah', 'na', 'nam'] },
  { usfm: 'HAB', osis: 'Hab', chapters: 3, en: 'Habakkuk', sw: 'Habakuki', abbreviations: ['hab', 'hb'] },
  { usfm: 'ZEP', osis: 'Zeph', chapters: 3, en: 'Zephaniah', sw: 'Sefania', abbreviations: ['zeph', 'zep', 'zp', 'sef'] },
  { usfm: 'HAG', osis: 'Hag', chapters: 2, en: 'Haggai', sw: 'Hagai', abbreviations: ['hag', 'hg'] },
  { usfm: 'ZEC', osis: 'Zech', chapters: 14, en: 'Zechariah', sw: 'Zekaria', abbreviations: ['zech', 'zec', 'zc', 'zek'] },
  { usfm: 'MAL', osis: 'Mal', chapters: 4, en: 'Malachi', sw: 'Malaki', abbreviations: ['mal', 'ml'] },
  { usfm: 'MAT', osis: 'Matt', chapters: 28, en: 'Matthew', sw: 'Mathayo', abbreviations: ['matt', 'mat', 'mt', 'mth'] },
  { usfm: 'MRK', osis: 'Mark', chapters: 16, en: 'Mark', sw: 'Marko', abbreviations: ['mark', 'mrk', 'mk', 'mr', 'mar'] },
  { usfm: 'LUK', osis: 'Luke', chapters: 24, en: 'Luke', sw: 'Luka', abbreviations: ['luke', 'luk', 'lk', 'lu'] },
  { usfm: 'JHN', osis: 'John', chapters: 21, en: 'John', sw: 'Yohana', abbreviations: ['john', 'jhn', 'jn', 'joh', 'yn', 'yoh'] },
  { usfm: 'ACT', osis: 'Acts', chapters: 28, en: 'Acts', sw: 'Matendo ya Mitume', abbreviations: ['acts', 'act', 'ac', 'mdo', 'matendo'] },
  { usfm: 'ROM', osis: 'Rom', chapters: 16, en: 'Romans', sw: 'Warumi', abbreviations: ['rom', 'ro', 'rm', 'rum'] },
  { usfm: '1CO', osis: '1Cor', chapters: 16, en: '1 Corinthians', sw: '1 Wakorintho', abbreviations: ['1cor', '1co', '1kor', '1 cor'] },
  { usfm: '2CO', osis: '2Cor', chapters: 13, en: '2 Corinthians', sw: '2 Wakorintho', abbreviations: ['2cor', '2co', '2kor', '2 cor'] },
  { usfm: 'GAL', osis: 'Gal', chapters: 6, en: 'Galatians', sw: 'Wagalatia', abbreviations: ['gal', 'ga'] },
  { usfm: 'EPH', osis: 'Eph', chapters: 6, en: 'Ephesians', sw: 'Waefeso', abbreviations: ['eph', 'ep', 'efe', 'efeso'] },
  { usfm: 'PHP', osis: 'Phil', chapters: 4, en: 'Philippians', sw: 'Wafilipi', abbreviations: ['phil', 'php', 'pp', 'flp', 'fil'] },
  { usfm: 'COL', osis: 'Col', chapters: 4, en: 'Colossians', sw: 'Wakolosai', abbreviations: ['col', 'co', 'kol'] },
  { usfm: '1TH', osis: '1Thess', chapters: 5, en: '1 Thessalonians', sw: '1 Wathesalonike', abbreviations: ['1thess', '1th', '1the', '1 thess'] },
  { usfm: '2TH', osis: '2Thess', chapters: 3, en: '2 Thessalonians', sw: '2 Wathesalonike', abbreviations: ['2thess', '2th', '2the', '2 thess'] },
  { usfm: '1TI', osis: '1Tim', chapters: 6, en: '1 Timothy', sw: '1 Timotheo', abbreviations: ['1tim', '1ti', '1tm', '1 tim'] },
  { usfm: '2TI', osis: '2Tim', chapters: 4, en: '2 Timothy', sw: '2 Timotheo', abbreviations: ['2tim', '2ti', '2tm', '2 tim'] },
  { usfm: 'TIT', osis: 'Titus', chapters: 3, en: 'Titus', sw: 'Tito', abbreviations: ['titus', 'tit', 'ti'] },
  { usfm: 'PHM', osis: 'Phlm', chapters: 1, en: 'Philemon', sw: 'Filemoni', abbreviations: ['phlm', 'phm', 'philem', 'flm', 'filemon'] },
  { usfm: 'HEB', osis: 'Heb', chapters: 13, en: 'Hebrews', sw: 'Waebrania', abbreviations: ['heb', 'he', 'ebr', 'waeb'] },
  { usfm: 'JAS', osis: 'Jas', chapters: 5, en: 'James', sw: 'Yakobo', abbreviations: ['jas', 'jm', 'jam', 'yak'] },
  { usfm: '1PE', osis: '1Pet', chapters: 5, en: '1 Peter', sw: '1 Petro', abbreviations: ['1pet', '1pe', '1pt', '1 pet'] },
  { usfm: '2PE', osis: '2Pet', chapters: 3, en: '2 Peter', sw: '2 Petro', abbreviations: ['2pet', '2pe', '2pt', '2 pet'] },
  { usfm: '1JN', osis: '1John', chapters: 5, en: '1 John', sw: '1 Yohana', abbreviations: ['1john', '1jn', '1jo', '1yoh', '1 jn'] },
  { usfm: '2JN', osis: '2John', chapters: 1, en: '2 John', sw: '2 Yohana', abbreviations: ['2john', '2jn', '2jo', '2yoh', '2 jn'] },
  { usfm: '3JN', osis: '3John', chapters: 1, en: '3 John', sw: '3 Yohana', abbreviations: ['3john', '3jn', '3jo', '3yoh', '3 jn'] },
  { usfm: 'JUD', osis: 'Jude', chapters: 1, en: 'Jude', sw: 'Yuda', abbreviations: ['jude', 'jud', 'jd', 'yud'] },
  { usfm: 'REV', osis: 'Rev', chapters: 22, en: 'Revelation', sw: 'Ufunuo', abbreviations: ['rev', 're', 'rv', 'apoc', 'ufu', 'ufunuo wa yohana'] },
] as const

export type BookId = (typeof bibleBooks)[number]['usfm']

export type BibleBook = (typeof bibleBooks)[number]

export function bookById(id: string): BibleBook | undefined {
  return bibleBooks.find((b) => b.usfm === id)
}

/** The book's name in a language the catalogue knows, else English. */
export function bookName(id: string, language: string): string {
  const book = bookById(id)
  if (!book) return id
  return language === 'sw' ? book.sw : book.en
}
