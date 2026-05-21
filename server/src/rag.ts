/**
 * RAG — retrieval over knowledge/.
 *
 * v0.1.x strategy: **TF-IDF over text chunks** (no external dependencies).
 *
 *   1. Walk knowledge/ for *.md / *.txt / *.json / *.jsonl / *.csv
 *   2. Tokenize into 800-char chunks with 80-char overlap
 *   3. Compute TF-IDF weights against the agent's corpus
 *   4. Score chunks against the user's query, return top N
 *
 * This is a significant accuracy upgrade over plain token overlap while
 * keeping the package weight-free and offline-safe. The dense-vector
 * backend (OpenAI embeddings, Voyage, bge-m3, …) is a future drop-in:
 * the entry point is `retrieve()` and the on-disk store is `embeddings/`.
 */
import { promises as fs } from 'node:fs';
import { join, extname } from 'node:path';
import { knowledgeDir, agentExists, AgentNotFoundError } from './storage.js';

const ALLOWED_EXT = new Set(['.md', '.txt', '.json', '.jsonl', '.csv']);
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
  /** TF-IDF score against the query (higher = more relevant) */
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
  const dir = knowledgeDir(slug);
  const files = await walk(dir);
  const all: Chunk[] = [];
  for (const path of files) {
    const ext = extname(path).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) continue;
    let text: string;
    try {
      text = await fs.readFile(path, 'utf8');
    } catch {
      continue;
    }
    const chunks = chunkText(text);
    chunks.forEach((c, idx) => {
      all.push({ path, chunkIndex: idx, text: c });
    });
  }
  return all;
}

/* --------------------------------------------------------------- */
/* TF-IDF                                                          */
/* --------------------------------------------------------------- */

interface TermFrequency {
  /** total term count for normalization */
  total: number;
  counts: Map<string, number>;
}

function termFrequencies(tokens: string[]): TermFrequency {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return { total: tokens.length, counts };
}

function inverseDocumentFrequency(docTokenSets: Set<string>[]): Map<string, number> {
  const N = docTokenSets.length;
  const df = new Map<string, number>();
  for (const set of docTokenSets) {
    for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, n] of df) {
    // add-1 smoothing to avoid IDF blowing up on rare query terms
    idf.set(t, Math.log((N + 1) / (n + 1)) + 1);
  }
  return idf;
}

export async function retrieve(slug: string, query: string, topK = 4): Promise<Retrieval[]> {
  const chunks = await loadChunks(slug);
  if (chunks.length === 0) return [];

  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];

  const docTokens = chunks.map((c) => tokenize(c.text));
  const docSets = docTokens.map((t) => new Set(t));
  const idf = inverseDocumentFrequency(docSets);

  const qSet = new Set(qTokens);
  const qIdfNorm =
    Math.sqrt([...qSet].reduce((acc, t) => acc + (idf.get(t) ?? 0) ** 2, 0)) || 1;

  const scored: Retrieval[] = chunks.map((chunk, i) => {
    const tf = termFrequencies(docTokens[i]);
    if (tf.total === 0) return { chunk, score: 0 };

    let dot = 0;
    let docNormSq = 0;
    for (const [term, count] of tf.counts) {
      const weight = (count / tf.total) * (idf.get(term) ?? 0);
      docNormSq += weight * weight;
      if (qSet.has(term)) {
        // Query weight = IDF only (no TF in the query — short by definition).
        dot += weight * (idf.get(term) ?? 0);
      }
    }
    const docNorm = Math.sqrt(docNormSq) || 1;
    const cos = dot / (docNorm * qIdfNorm);
    return { chunk, score: cos };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
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
