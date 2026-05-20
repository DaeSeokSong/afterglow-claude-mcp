/**
 * RAG — retrieval over knowledge/.
 *
 * PoC strategy (deliberately simple, no API keys needed):
 *   1. Walk knowledge/ for *.md / *.txt / *.json / *.jsonl
 *   2. Tokenize each file into 800-char chunks with 80-char overlap
 *   3. Score each chunk by token overlap with the user's query
 *   4. Return the top N chunks
 *
 * The "real" implementation would store dense embeddings under embeddings/
 * and use cosine similarity. The MCP server signals this by writing a
 * placeholder `embeddings/STRATEGY` file on create. Swapping in a vector
 * backend is a drop-in replacement of `retrieve()` below.
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
  /** number of overlapping non-stopword tokens with the query */
  score: number;
}

export function tokenize(text: string): string[] {
  // Treat any non-letter/non-digit character as a separator. Handles Korean,
  // English, and digits uniformly without depending on a tokenizer model.
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

export async function retrieve(slug: string, query: string, topK = 4): Promise<Retrieval[]> {
  const chunks = await loadChunks(slug);
  if (chunks.length === 0) return [];
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return [];

  const scored: Retrieval[] = chunks
    .map((chunk) => {
      const tokens = new Set(tokenize(chunk.text));
      let score = 0;
      for (const t of qTokens) if (tokens.has(t)) score++;
      return { chunk, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
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
