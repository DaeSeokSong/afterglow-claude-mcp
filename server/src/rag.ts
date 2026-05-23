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

export function tokenize(text: string): string[] {
  // Any non-letter/non-digit character is a separator. Handles Korean,
  // English and digits uniformly without depending on a tokenizer model.
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
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
    text = await fs.readFile(path, 'utf8');
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
 * Embed text via an OpenAI-compatible `/embeddings` endpoint. Returns null
 * (→ caller falls back to lexical) when no endpoint is configured or the call
 * fails — keeping the default path offline and dependency-free.
 */
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
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { embedding?: number[] }[] };
    const vec = json.data?.[0]?.embedding;
    return Array.isArray(vec) && vec.length > 0 ? vec : null;
  } catch {
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
    const dense = await denseRetrieve(slug, chunks, query, topK);
    if (dense) return dense; // else transparently fall through to lexical
  }
  return bm25Rank(chunks, query, topK);
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
