/**
 * RAG — retrieval over knowledge/ + interview transcripts.
 *
 * Two backends behind one `retrieve()` entry point:
 *
 *   - **lexical (default, 0-dependency, offline)** — BM25 ranking over text
 *     chunks. BM25 adds term-frequency saturation (k1) and length
 *     normalization (b), which is a real accuracy upgrade over the old
 *     TF-IDF cosine and needs no model/API.
 *   - **dense (opt-in)** — embeddings via an OpenAI-compatible endpoint
 *     (`AFTERGLOW_RAG_BACKEND=dense` + `AFTERGLOW_EMBED_ENDPOINT`). Chunk
 *     vectors are cached under `embeddings/`. Any failure (no endpoint,
 *     network error) transparently falls back to lexical, so the package
 *     stays weight-free and offline-safe by default.
 */
import { promises as fs } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { knowledgeDir, interviewsDir, embeddingsDir, agentExists, AgentNotFoundError } from './storage.js';
import { readTextMaybeEncrypted } from './privacy.js';

const ALLOWED_EXT = new Set(['.md', '.txt', '.json', '.jsonl', '.csv']);
// Interview transcripts are searchable, but the structural session.json /
// index.json files are NOT — indexing raw JSON state would pollute retrieval.
const TRANSCRIPT_EXT = new Set(['.md', '.txt']);
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 80;
const STOPWORDS = new Set([
  '그리고', '그러나', '하지만', '그래서', '근데', '이건', '그건', '저건',
  '입니다', '있어요', '있습니다', '해요', '합니다', '하다',
  '이', '그', '저', '의', '에', '를', '을', '은', '는', '가',
  'the', 'a', 'an', 'is', 'are', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with',
]);

export interface Chunk {
  /** absolute path to source file */
  path: string;
  /** file-relative chunk index (0-based) */
  chunkIndex: number;
  /** chunk text */
  text: string;
}

export interface Retrieval {
  chunk: Chunk;
  /** relevance score against the query (higher = more relevant) */
  score: number;
}

// Common Korean case/topic particles that agglutinate onto a noun as a
// suffix. Stripping them so "정책은"/"정책이"/"정책을" all normalise to "정책"
// makes both BM25 retrieval and the grounding gate match across inflection —
// without it, a "정책" query never retrieves a "정책은" chunk, which is a big
// chunk of "RAG doesn't work" for Korean. Ordered longest-first so multi-
// syllable particles strip before their prefixes.
const KO_PARTICLES = [
  '으로서', '으로써', '에서는', '에게서', '으로', '에서', '에게', '한테', '께서',
  '이라', '라고', '이나', '에는', '에도', '까지', '부터', '마저', '조차', '처럼',
  '보다', '만큼', '하고', '이며', '으론',
  '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '로', '나', '든',
];
const HANGUL_ONLY = /^[가-힣]+$/;

/** Strip a trailing Korean particle when the token is all-Hangul and the
 *  remaining stem is still ≥2 syllables (so we don't mangle short nouns like
 *  "회의"→"회"). Non-Korean tokens pass through untouched. */
function stripKoreanParticle(tok: string): string {
  if (!HANGUL_ONLY.test(tok)) return tok;
  for (const p of KO_PARTICLES) {
    if (tok.length > p.length && tok.endsWith(p) && tok.length - p.length >= 2) {
      return tok.slice(0, tok.length - p.length);
    }
  }
  return tok;
}

export function tokenize(text: string): string[] {
  // Any non-letter/non-digit character is a separator. Handles Korean,
  // English and digits uniformly without depending on a tokenizer model.
  // Korean tokens are particle-stripped so inflected forms match.
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map(stripKoreanParticle)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (text.length <= size) return [text.trim()];
  const out: string[] = [];
  let i = 0;
  const stride = size - overlap;
  while (i < text.length) {
    out.push(text.slice(i, i + size).trim());
    i += stride;
  }
  return out.filter((c) => c.length > 0);
}

export async function loadChunks(slug: string): Promise<Chunk[]> {
  if (!(await agentExists(slug))) throw new AgentNotFoundError(slug);
  const all: Chunk[] = [];

  // Root 1 — knowledge/ : all allowed text formats.
  const knowledgeFiles = await walk(knowledgeDir(slug));
  for (const path of knowledgeFiles) {
    if (!ALLOWED_EXT.has(extname(path).toLowerCase())) continue;
    await ingest(path, all);
  }

  // Root 2 — interviews/ : transcripts only (.md / .txt), so the persona can
  // be asked about what was said in an interview recording — but session.json
  // and index.json (also under interviews/) are skipped.
  const interviewFiles = await walk(interviewsDir(slug));
  for (const path of interviewFiles) {
    if (!TRANSCRIPT_EXT.has(extname(path).toLowerCase())) continue;
    await ingest(path, all);
  }

  return all;
}

async function ingest(path: string, all: Chunk[]): Promise<void> {
  let text: string;
  try {
    // Transparent decrypt: an at-rest-encrypted transcript (AFG1: magic) is
    // decrypted here so it stays searchable; a plaintext file reads as-is.
    // If it's encrypted but no key is set, the read throws → we skip the file.
    text = await readTextMaybeEncrypted(path);
  } catch {
    return;
  }
  const chunks = chunkText(text);
  chunks.forEach((c, idx) => {
    all.push({ path, chunkIndex: idx, text: c });
  });
}

/* --------------------------------------------------------------- */
/* Lexical ranking — BM25 (default, 0-dependency, offline)         */
/* --------------------------------------------------------------- */

const BM25_K1 = 1.5; // term-frequency saturation
const BM25_B = 0.75; // length normalization strength

export function bm25Rank(chunks: Chunk[], query: string, topK: number): Retrieval[] {
  const qTokens = [...new Set(tokenize(query))];
  if (qTokens.length === 0) return [];

  const docTokens = chunks.map((c) => tokenize(c.text));
  const N = chunks.length;
  const avgdl = (docTokens.reduce((s, d) => s + d.length, 0) / (N || 1)) || 1;

  const tfPerDoc = docTokens.map((toks) => {
    const m = new Map<string, number>();
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  });

  // document frequency for each query term
  const df = new Map<string, number>();
  for (const t of qTokens) {
    let n = 0;
    for (const m of tfPerDoc) if (m.has(t)) n++;
    df.set(t, n);
  }
  const idf = (t: string): number => {
    const n = df.get(t) ?? 0;
    // BM25 IDF with +1 so common terms never go negative.
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  };

  const scored: Retrieval[] = chunks.map((chunk, i) => {
    const dl = docTokens[i].length || 1;
    const tf = tfPerDoc[i];
    let score = 0;
    for (const t of qTokens) {
      const f = tf.get(t) ?? 0;
      if (f === 0) continue;
      score += idf(t) * ((f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgdl))));
    }
    return { chunk, score };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/* --------------------------------------------------------------- */
/* Dense ranking — pluggable embeddings (opt-in)                   */
/* --------------------------------------------------------------- */

export function ragBackend(): 'lexical' | 'dense' {
  return process.env.AFTERGLOW_RAG_BACKEND === 'dense' ? 'dense' : 'lexical';
}

/**
 * Hybrid is ON by default whenever the dense backend is active — fusing the
 * lexical and dense rankings (see `rrfFuse`) is strictly better than either
 * alone for mixed keyword/semantic queries. Set `AFTERGLOW_RAG_HYBRID=off` to
 * use pure dense scores.
 */
export function hybridEnabled(): boolean {
  return ragBackend() === 'dense' && process.env.AFTERGLOW_RAG_HYBRID !== 'off';
}

/** Effective retrieval mode, for display (status dashboard). */
export function ragMode(): 'lexical' | 'dense' | 'hybrid' {
  if (ragBackend() !== 'dense') return 'lexical';
  return hybridEnabled() ? 'hybrid' : 'dense';
}

/* --------------------------------------------------------------- */
/* Reciprocal Rank Fusion — combine multiple ranked lists          */
/* --------------------------------------------------------------- */

const RRF_K = 60; // standard RRF damping constant

/**
 * Fuse several ranked lists into one. Each list contributes 1/(K+rank) to a
 * chunk's fused score, so a chunk that ranks decently in BOTH the lexical and
 * dense lists out-ranks one that spikes in only a single list. Chunks are
 * keyed by (path, chunkIndex) so the same chunk found by two retrievers is
 * merged rather than double-counted.
 */
export function rrfFuse(lists: Retrieval[][], topK: number): Retrieval[] {
  const acc = new Map<string, { chunk: Chunk; score: number }>();
  for (const list of lists) {
    list.forEach((r, rank) => {
      const key = `${r.chunk.path} ${r.chunk.chunkIndex}`;
      const cur = acc.get(key) ?? { chunk: r.chunk, score: 0 };
      cur.score += 1 / (RRF_K + rank + 1);
      acc.set(key, cur);
    });
  }
  return [...acc.values()]
    .map((e) => ({ chunk: e.chunk, score: Number(e.score.toFixed(6)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Embed text via an OpenAI-compatible `/embeddings` endpoint. Returns null
 * (→ caller falls back to lexical) when no endpoint is configured or the call
 * fails — keeping the default path offline and dependency-free.
 */
/* --------------------------------------------------------------- */
/* Dense backend health counter (Phase 4 refinement)               */
/* --------------------------------------------------------------- */
/* When dense is configured but the embedding endpoint is silently   */
/* unreachable, the user can run for days on degraded lexical-only   */
/* retrieval without knowing. Track failures + last error so `status`*/
/* can surface "dense failing — falling back to lexical".            */

interface DenseHealth { failures: number; lastError: string | null; lastFailureAt: string | null; lastSuccessAt: string | null; }
const __denseHealth: DenseHealth = { failures: 0, lastError: null, lastFailureAt: null, lastSuccessAt: null };
export function denseHealth(): DenseHealth { return { ...__denseHealth }; }
function recordDenseFailure(reason: string): void {
  __denseHealth.failures++;
  __denseHealth.lastError = reason.slice(0, 200);
  __denseHealth.lastFailureAt = new Date().toISOString();
}
function recordDenseSuccess(): void {
  __denseHealth.lastSuccessAt = new Date().toISOString();
}

async function embedText(text: string): Promise<number[] | null> {
  const endpoint = process.env.AFTERGLOW_EMBED_ENDPOINT;
  if (!endpoint) return null;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.AFTERGLOW_EMBED_KEY ? { authorization: `Bearer ${process.env.AFTERGLOW_EMBED_KEY}` } : {}),
      },
      body: JSON.stringify({
        input: text.slice(0, 8_000),
        model: process.env.AFTERGLOW_EMBED_MODEL ?? 'text-embedding-3-small',
      }),
    });
    if (!res.ok) {
      recordDenseFailure(`endpoint HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { data?: { embedding?: number[] }[] };
    const vec = json.data?.[0]?.embedding;
    if (Array.isArray(vec) && vec.length > 0) {
      recordDenseSuccess();
      return vec;
    }
    recordDenseFailure('endpoint returned empty embedding');
    return null;
  } catch (e) {
    recordDenseFailure((e as Error)?.message ?? 'network');
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Embed a chunk, caching the vector under embeddings/<contenthash>.json so
 *  we don't re-embed the same chunk on every query. */
async function embedChunkCached(slug: string, text: string): Promise<number[] | null> {
  const key = createHash('sha256').update(text).digest('hex').slice(0, 32);
  const cachePath = join(embeddingsDir(slug), `vec-${key}.json`);
  try {
    const v = JSON.parse(await fs.readFile(cachePath, 'utf8')) as number[];
    if (Array.isArray(v) && v.length > 0) return v;
  } catch {
    /* cache miss */
  }
  const v = await embedText(text);
  if (v) {
    try {
      await fs.mkdir(embeddingsDir(slug), { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(v), 'utf8');
    } catch {
      /* cache write best-effort */
    }
  }
  return v;
}

async function denseRetrieve(
  slug: string,
  chunks: Chunk[],
  query: string,
  topK: number,
): Promise<Retrieval[] | null> {
  const qv = await embedText(query);
  if (!qv) return null; // no provider / failed → caller falls back to lexical
  const scored: Retrieval[] = [];
  for (const chunk of chunks) {
    const cv = await embedChunkCached(slug, chunk.text);
    if (!cv) return null; // provider failed mid-stream → fall back
    scored.push({ chunk, score: cosine(qv, cv) });
  }
  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/* --------------------------------------------------------------- */
/* Entry point                                                     */
/* --------------------------------------------------------------- */

export async function retrieve(slug: string, query: string, topK = 4): Promise<Retrieval[]> {
  const chunks = await loadChunks(slug);
  if (chunks.length === 0) return [];
  if (tokenize(query).length === 0) return [];

  if (ragBackend() === 'dense') {
    // Pull a wider candidate set from each retriever so the fusion has room to
    // re-rank, then trim to topK after fusing.
    const wide = Math.max(topK, 10);
    const dense = await denseRetrieve(slug, chunks, query, wide);
    if (dense) {
      if (hybridEnabled()) {
        const lexical = bm25Rank(chunks, query, wide);
        return rrfFuse([dense, lexical], topK);
      }
      return dense.slice(0, topK);
    }
    // dense unavailable (no provider / failed) → transparently fall through.
  }
  return bm25Rank(chunks, query, topK);
}

/* --------------------------------------------------------------- */
/* Grounding assessment — the anti-hallucination gate              */
/* --------------------------------------------------------------- */

export type GroundingVerdict = 'none' | 'weak' | 'partial' | 'grounded';

export interface GroundingAssessment {
  verdict: GroundingVerdict;
  /** fraction (0-1) of the query's content terms present in the source texts */
  coverage: number;
  /** 0-100 confidence derived from coverage — backend-independent + honest */
  confidence: number;
  /** query content terms found in some source */
  matched: string[];
  /** query content terms NOT found in any source */
  missing: string[];
  /** number of distinct query content terms */
  queryTerms: number;
}

// Below WEAK → barely touched; at/above STRONG → well covered. Tuned to be
// conservative (refuse-leaning), which is the correct bias for "never invent
// information that wasn't provided".
export const GROUNDING_WEAK_FLOOR = 0.34;
export const GROUNDING_STRONG_FLOOR = 0.67;

/**
 * Measures how much of the QUESTION's content vocabulary actually appears in
 * the provided source texts (retrieved chunks + persona bio + corrections).
 *
 * This is the anti-hallucination signal. It is deliberately **term presence**,
 * not semantic similarity: if the question's key words don't appear in any
 * source, the materials cannot answer it and the model must refuse. Term
 * presence is conservative (it can only ever LOWER the verdict vs. a fuzzy
 * match) and fully explainable — exactly what we want for a hard refusal gate.
 *
 * Pure + deterministic so the framing and tests can prove it precisely.
 */
// Question-framing tokens that are never the *content* an answer must be
// grounded in — interrogatives + polite request verbs. Dropping them from the
// coverage calc keeps the verdict honest: "온보딩 이탈 어떻게 줄였어요?"
// should be judged on 온보딩/이탈, not penalised for 어떻게/줄였어요. Kept
// deliberately tight (only unambiguous framing words) so we don't accidentally
// drop a real topic term and over-claim grounding. Query-side only — BM25
// retrieval/ranking is untouched.
const QUERY_FILLER = new Set([
  '어떻게', '무엇', '뭐', '뭔', '뭔지', '어디', '언제', '누구', '누가', '얼마', '얼마나',
  '어떤', '어느', '알려줘', '알려주세요', '알려', '말해줘', '말해주세요', '설명해줘',
  '해줘', '해주세요', '궁금', '궁금해', '부탁', '줄였어요', '인가요', '인지',
  'what', 'how', 'why', 'where', 'when', 'who', 'whom', 'which', 'tell', 'please', 'explain', 'about',
]);

export function assessGrounding(query: string, sourceTexts: string[]): GroundingAssessment {
  const q = [...new Set(tokenize(query))].filter((t) => !QUERY_FILLER.has(t));
  if (q.length === 0) {
    return { verdict: 'none', coverage: 0, confidence: 0, matched: [], missing: [], queryTerms: 0 };
  }
  const vocab = new Set<string>();
  for (const t of sourceTexts) {
    if (!t) continue;
    for (const tok of tokenize(t)) vocab.add(tok);
  }
  const vocabList = [...vocab];
  // A query term is "present" if it appears exactly OR as an inflectional
  // prefix-variant — Korean attaches particles as suffixes (정책 vs 정책은/
  // 정책이/정책을), so exact-token matching would falsely report "no
  // grounding". We allow a prefix match only when the shorter token is a
  // large fraction (≥0.6) of the longer, which catches Korean inflection
  // while rejecting unrelated shared-prefix English ("cat" vs "category").
  const present = (t: string): boolean => {
    if (vocab.has(t)) return true;
    return vocabList.some((s) => {
      const [shorter, longer] = t.length <= s.length ? [t, s] : [s, t];
      if (!longer.startsWith(shorter)) return false;
      return shorter.length / longer.length >= 0.6;
    });
  };
  const matched = q.filter(present);
  const missing = q.filter((t) => !present(t));
  const coverage = matched.length / q.length;
  let verdict: GroundingVerdict;
  if (matched.length === 0) verdict = 'none';
  else if (coverage < GROUNDING_WEAK_FLOOR) verdict = 'weak';
  else if (coverage < GROUNDING_STRONG_FLOOR) verdict = 'partial';
  else verdict = 'grounded';
  return { verdict, coverage, confidence: Math.round(coverage * 100), matched, missing, queryTerms: q.length };
}

/* --------------------------------------------------------------- */
/* Internals                                                       */
/* --------------------------------------------------------------- */

async function walk(dir: string): Promise<string[]> {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })) as unknown as typeof entries;
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}
