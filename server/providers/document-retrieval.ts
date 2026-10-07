/**
 * Retrieval for the Document Center Q&A.
 *
 * It is deliberately deterministic: no model, no embeddings, no network. The
 * question is tokenized, a document body is split into paragraphs, and a
 * paragraph scores by how many of the question's tokens it contains. A
 * paragraph is only cited when it matches enough distinct question terms, so a
 * question about something the documents do not cover says it has no basis
 * instead of citing an unrelated paragraph that happened to share one word.
 * The same
 * question over the same documents always cites the same paragraphs, which is
 * what lets the answer be tested and what lets the server guarantee that only
 * paragraphs of documents the asker may read are ever cited: `retrieve` is
 * handed the already filtered documents and nothing else.
 *
 * The module is pure — it takes text in and returns citations — so it runs in a
 * unit test without a database.
 */

/** One document as retrieval sees it: its current body and the version that body belongs to. */
export interface RetrievalDocument {
  readonly id: string;
  readonly title: string;
  readonly version: number;
  readonly content: string;
}

/** One paragraph of a document body, with the heading it was under. */
export interface RetrievalParagraph {
  readonly heading: string;
  readonly text: string;
}

/** One cited paragraph: where it came from, which version, and why it matched. */
export interface RetrievalCitation {
  readonly documentId: string;
  readonly title: string;
  readonly version: number;
  readonly heading: string;
  readonly snippet: string;
  readonly score: number;
}

export interface RetrievalResult {
  readonly hasAnswer: boolean;
  readonly citations: readonly RetrievalCitation[];
}

export interface RetrievalOptions {
  /** How many citations to return in total. */
  readonly limit?: number;
  /** How many paragraphs one document may contribute. */
  readonly perDocument?: number;
  /** A paragraph must score at least this much to be cited. */
  readonly minScore?: number;
  /**
   * How many of a multi-term question's distinct terms a paragraph must
   * match. A question of one or two terms is answered by one matching term.
   */
  readonly minMatchedTerms?: number;
  /** How many characters of the paragraph a citation carries. */
  readonly snippetLength?: number;
}

/** A paragraph must match at least one weighted token, and a weighted token is worth at least one. */
export const MIN_SCORE = 2;
/**
 * A question of three or more terms must match at least this many distinct
 * terms. Sharing one common word is not enough: it is what makes a question
 * about something the documents do not cover (a company annual meeting, a
 * patent) cite an unrelated paragraph instead of saying it has no basis.
 */
export const MIN_MATCHED_TERMS = 2;
export const DEFAULT_LIMIT = 5;
export const DEFAULT_PER_DOCUMENT = 2;
export const DEFAULT_SNIPPET_LENGTH = 240;

const ASCII_STOPWORDS = new Set([
  'how',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'the',
  'and',
  'for',
  'are',
  'was',
  'were',
  'with',
  'that',
  'this',
  'from',
  'have',
  'has',
  'had',
  'can',
  'could',
  'would',
  'should',
  'you',
  'your',
  'not',
  'but',
  'all',
  'any',
  'our',
  'out',
  'get',
  'use',
  'using',
  'per',
  'does',
  'do',
  'to',
  'of',
  'in',
  'on',
  'at',
  'is',
  'it',
  'as',
  'by',
  'an',
  'a',
  'be',
  'or',
  'if',
  'we',
  'i',
  'me',
  'my',
]);

/** Function words are dropped, including the question words a Chinese question is built from. */
const CJK_STOPWORDS = new Set([
  '的',
  '了',
  '是',
  '我',
  '你',
  '他',
  '她',
  '它',
  '们',
  '在',
  '有',
  '和',
  '与',
  '及',
  '或',
  '就',
  '都',
  '也',
  '很',
  '把',
  '被',
  '对',
  '这',
  '那',
  '哪',
  '吗',
  '呢',
  '吧',
  '请',
  '要',
  '会',
  '能',
  '可以',
  '一个',
  '我们',
  '你们',
  '他们',
  '怎么',
  '如何',
  '什么',
  '为什么',
  '怎样',
]);

/**
 * Characters that never carry a searchable meaning on their own — function
 * words and the interrogative/quantity characters a question is built from. A
 * two-character token touching one of these straddles a word boundary
 * (`年假有几天` yields `假有`, `有几`; `年假多少天` yields `假多`, `多少`), so it is
 * not a term and is dropped. Characters that word compounds are built on —
 * `请` in `请假`, `要` in `要求`, `会` in `会议` — are deliberately absent, so
 * their bigrams survive.
 */
const CJK_FUNCTION_CHARS = new Set([
  '的',
  '了',
  '是',
  '在',
  '有',
  '就',
  '都',
  '也',
  '很',
  '把',
  '被',
  '对',
  '这',
  '那',
  '哪',
  '吗',
  '呢',
  '吧',
  '我',
  '你',
  '他',
  '她',
  '它',
  '们',
  '怎',
  '么',
  '什',
  '如',
  '何',
  '几',
  '多',
  '谁',
  '些',
]);

const HAS_CJK = /[\u4e00-\u9fff]/u;
const CJK_RUN = /[\u4e00-\u9fff]+/gu;
const ASCII_WORD = /[a-z0-9]+/gu;
const HEADING = /^(#{1,6})\s+(.*)$/u;

/**
 * Split a question or a paragraph into comparable tokens.
 *
 * ASCII runs become lowercase words of at least two characters. A run of CJK
 * characters becomes overlapping two-character tokens, which is what makes a
 * short Chinese question match a longer sentence; a single-character CJK word
 * is its own token. A token that is only a function word, or that straddles a
 * function character, is dropped.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.toLowerCase().matchAll(ASCII_WORD)) {
    const word = match[0];
    if (word.length >= 2 && !ASCII_STOPWORDS.has(word)) tokens.push(word);
  }
  for (const run of text.matchAll(CJK_RUN)) {
    if (run[0].length === 1) {
      if (!CJK_STOPWORDS.has(run[0])) tokens.push(run[0]);
      continue;
    }
    for (let index = 0; index < run[0].length - 1; index += 1) {
      const bigram = run[0].slice(index, index + 2);
      if (CJK_STOPWORDS.has(bigram)) continue;
      if (
        CJK_FUNCTION_CHARS.has(bigram[0]) ||
        CJK_FUNCTION_CHARS.has(bigram[1])
      ) {
        continue;
      }
      tokens.push(bigram);
    }
  }
  return tokens;
}

/** A CJK single character is worth half a two-character token; everything else is worth the same. */
function tokenWeight(token: string): number {
  return token.length === 1 && HAS_CJK.test(token) ? 1 : 2;
}

/**
 * Split a document body into paragraphs.
 *
 * A line of `#` markers starts a heading and applies to the paragraphs below it;
 * a blank line ends a paragraph. The heading is carried on the paragraph so a
 * citation can name the section it came from.
 */
export function splitParagraphs(content: string): RetrievalParagraph[] {
  const paragraphs: RetrievalParagraph[] = [];
  let heading = '';
  let buffer: string[] = [];
  const flush = (): void => {
    const text = buffer.join('\n').trim();
    if (text) paragraphs.push({ heading, text });
    buffer = [];
  };
  for (const raw of content.split(/\r?\n/u)) {
    const line = raw.trim();
    const headingMatch = HEADING.exec(line);
    if (headingMatch) {
      flush();
      heading = headingMatch[2].trim();
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return paragraphs;
}

interface ParagraphScore {
  /** Occurrence-weighted score, used to rank citations. */
  readonly score: number;
  /** How many distinct question terms the paragraph contains. */
  readonly matched: number;
}

function scoreParagraph(
  questionTokens: readonly string[],
  text: string,
): ParagraphScore {
  if (questionTokens.length === 0) return { score: 0, matched: 0 };
  const tokens = tokenize(text);
  if (tokens.length === 0) return { score: 0, matched: 0 };
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let score = 0;
  const matchedTokens = new Set<string>();
  for (const questionToken of questionTokens) {
    const count = counts.get(questionToken);
    if (count) {
      score += tokenWeight(questionToken) * count;
      matchedTokens.add(questionToken);
    }
  }
  return { score, matched: matchedTokens.size };
}

function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length).trimEnd()}…`;
}

/**
 * Cite the paragraphs that answer a question.
 *
 * Only the documents passed in are searched, so the caller decides what the
 * asker may read. A question that matches too few paragraphs scores nothing,
 * and the result says so with `hasAnswer: false` rather than guessing.
 */
export function retrieve(
  question: string,
  documents: readonly RetrievalDocument[],
  options: RetrievalOptions = {},
): RetrievalResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const perDocument = options.perDocument ?? DEFAULT_PER_DOCUMENT;
  const minScore = options.minScore ?? MIN_SCORE;
  const minMatchedTerms = options.minMatchedTerms ?? MIN_MATCHED_TERMS;
  const snippetLength = options.snippetLength ?? DEFAULT_SNIPPET_LENGTH;
  const questionTokens = tokenize(question);
  const distinctQuestionTokens = new Set(questionTokens).size;
  if (distinctQuestionTokens === 0 || documents.length === 0) {
    return { hasAnswer: false, citations: [] };
  }

  // A one- or two-term question is answerable by a single matching term. A
  // longer question has to match more than one of its terms, so a paragraph
  // sharing only one common word is not offered as the answer.
  const requiredMatches =
    distinctQuestionTokens <= 2
      ? 1
      : Math.min(minMatchedTerms, distinctQuestionTokens);

  const scored: RetrievalCitation[] = [];
  for (const document of documents) {
    const candidates: RetrievalCitation[] = [];
    for (const paragraph of splitParagraphs(document.content)) {
      const { score, matched } = scoreParagraph(
        questionTokens,
        `${paragraph.heading} ${paragraph.text}`,
      );
      if (score < minScore || matched < requiredMatches) continue;
      candidates.push({
        documentId: document.id,
        title: document.title,
        version: document.version,
        heading: paragraph.heading,
        snippet: truncate(paragraph.text, snippetLength),
        score,
      });
    }
    candidates.sort((left, right) => right.score - left.score);
    scored.push(...candidates.slice(0, perDocument));
  }

  scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.documentId.localeCompare(right.documentId) ||
      left.heading.localeCompare(right.heading),
  );
  const citations = scored.slice(0, limit);
  return { hasAnswer: citations.length > 0, citations };
}
