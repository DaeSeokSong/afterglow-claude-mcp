import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  appendHistory,
  assertInitialized,
  assertWritable,
  getStatus,
  knowledgeDir,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { sanitisePromptLine } from '../sanitize.js';
import { assertAccessAllowed } from './acl.js';
import { elicitMissing, slugCandidates } from './elicit.js';
import { errorReply, safe, type ToolReply } from './types.js';

// Mirror rag.ts ALLOWED_EXT — only these get RAG-indexed, so we only copy
// these in (and tell the user what we skipped) rather than silently storing
// files that `ask` will never see.
const INDEXABLE_EXT = new Set(['.md', '.txt', '.json', '.jsonl', '.csv']);
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file
const MAX_TOTAL_FILES = 500;

export const learnShape = {
  slug: z.string().min(1).optional().describe('(필수) 지식을 추가할 에이전트 slug. 생략 시 안내합니다.'),
  path: z
    .string()
    .max(2_000)
    .optional()
    .describe('현재 작업 폴더(cwd) 하위의 파일 또는 폴더 경로. 폴더면 안에 있는 .md/.txt/.json/.jsonl/.csv 를 모두 가져옵니다.'),
  text: z
    .string()
    .max(500_000)
    .optional()
    .describe('인라인 지식 본문 (붙여넣기). knowledge/ 에 .md 로 저장됩니다. --title 로 제목 지정 가능.'),
  title: z.string().max(120).optional().describe('--text 저장 시 파일 제목 (기본: timestamp).'),
  url: z
    .string()
    .max(2_000)
    .optional()
    .describe('가져올 텍스트/마크다운 URL (best-effort — 네트워크 차단 시 실패). 본문만 .md 로 저장.'),
  caller: z.string().max(80).optional().describe('호출자 식별 (user:|role:|team:). access policy 가 deny 일 때 필수.'),
} as const;

interface LearnArgs {
  slug: string;
  path?: string;
  text?: string;
  title?: string;
  url?: string;
  caller?: string;
}

/** Confine a source path to the CWD subtree (same posture as export/import:
 *  an MCP client shouldn't be able to launder ~/.ssh/id_rsa into knowledge/). */
function safeUnderCwd(input: string): string | { error: string } {
  if (!input || input.includes('\0')) return { error: '경로가 비었거나 NUL 을 포함합니다.' };
  if (input.split(/[\\/]+/).includes('..')) return { error: '경로에 ".." 를 쓸 수 없습니다.' };
  const resolved = isAbsolute(input) ? resolve(input) : resolve(process.cwd(), input);
  const cwd = resolve(process.cwd());
  if (resolved !== cwd && !resolved.startsWith(cwd + sep) && !resolved.startsWith(cwd + '/')) {
    return { error: `보안상 현재 작업 폴더(${cwd}) 하위 경로만 가져올 수 있어요. 파일을 그쪽으로 복사하거나 --text 로 붙여넣으세요.` };
  }
  return resolved;
}

/** Turn an arbitrary title into a safe, unique-ish knowledge filename stem. */
function safeStem(title: string): string {
  const cleaned = String(title ?? '')
    .replace(/\0/g, '')
    .replace(/[\\/]/g, '-')
    .replace(/[^\p{L}\p{N}._ -]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return cleaned || 'note';
}

async function walkFiles(dir: string): Promise<string[]> {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })) as unknown as typeof entries;
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(full)));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

export async function runLearn(args: LearnArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    const ask = await elicitMissing('learn', args as unknown as Record<string, unknown>, [
      { name: 'slug', required: true, label: '지식을 추가할 에이전트', candidates: slugCandidates, example: 'jiyoon' },
      { name: 'path', required: false, label: '가져올 파일/폴더 (cwd 하위)' },
      { name: 'text', required: false, label: '붙여넣을 지식 본문' },
      { name: 'url', required: false, label: '가져올 URL' },
    ]);
    if (ask) return ask;
    try {
      await getStatus(args.slug);
      await assertWritable(args.slug);
    } catch (e) {
      return errorReply((e as Error).message);
    }
    const denied = await assertAccessAllowed(args.slug, args.caller, 'learn');
    if (denied) return denied;

    if (!args.path && args.text === undefined && !args.url) {
      return errorReply('learn 에는 path · text · url 중 하나가 필요합니다. 예) learn → slug:jiyoon, text:"<지식 본문>"');
    }

    const kdir = knowledgeDir(args.slug);
    await fs.mkdir(kdir, { recursive: true });

    const added: { name: string; bytes: number }[] = [];
    const skipped: string[] = [];
    const lines: string[] = [];

    // ── path: copy a file or a folder of indexable files ──
    if (args.path) {
      const srcResolved = safeUnderCwd(args.path);
      if (typeof srcResolved !== 'string') return errorReply(`경로 거부: ${srcResolved.error}`);
      let stat;
      try {
        stat = await fs.stat(srcResolved);
      } catch {
        return errorReply(`경로를 찾을 수 없습니다: ${srcResolved}`);
      }
      const files = stat.isDirectory() ? await walkFiles(srcResolved) : [srcResolved];
      if (files.length > MAX_TOTAL_FILES) {
        return errorReply(`파일이 너무 많습니다 (${files.length} > ${MAX_TOTAL_FILES}). 폴더를 좁혀서 다시 시도하세요.`);
      }
      for (const f of files) {
        const ext = extname(f).toLowerCase();
        if (!INDEXABLE_EXT.has(ext)) {
          skipped.push(relative(stat.isDirectory() ? srcResolved : process.cwd(), f).split(sep).join('/'));
          continue;
        }
        let buf: Buffer;
        try {
          buf = await fs.readFile(f);
        } catch {
          skipped.push(`${basename(f)} (읽기 실패)`);
          continue;
        }
        if (buf.length > MAX_FILE_BYTES) {
          skipped.push(`${basename(f)} (${(buf.length / 1024 / 1024).toFixed(1)}MB > 20MB)`);
          continue;
        }
        const dest = await uniqueDest(kdir, basename(f));
        await fs.writeFile(dest, buf);
        added.push({ name: basename(dest), bytes: buf.length });
      }
    }

    // ── text: write inline content as a .md ──
    if (args.text !== undefined) {
      if (args.text.trim().length === 0) {
        return errorReply('text 가 비어 있습니다.');
      }
      const stem = safeStem(args.title ?? `note-${new Date().toISOString().replace(/[:.]/g, '-')}`);
      const dest = await uniqueDest(kdir, `${stem}.md`);
      const header = args.title ? `# ${sanitisePromptLine(args.title, 120)}\n\n` : '';
      await fs.writeFile(dest, header + args.text, 'utf8');
      added.push({ name: basename(dest), bytes: Buffer.byteLength(header + args.text) });
    }

    // ── url: best-effort fetch ──
    if (args.url) {
      if (!/^https?:\/\//i.test(args.url)) {
        return errorReply('url 은 http(s):// 로 시작해야 합니다.');
      }
      try {
        const res = await fetch(args.url, { headers: { accept: 'text/markdown, text/plain, text/*;q=0.9, */*;q=0.5' } });
        if (!res.ok) {
          lines.push(`⚠ URL 가져오기 실패 (HTTP ${res.status}): ${sanitisePromptLine(args.url, 200)}`);
        } else {
          const body = await res.text();
          if (body.length > MAX_FILE_BYTES) {
            lines.push(`⚠ URL 본문이 너무 큽니다 (${(body.length / 1024 / 1024).toFixed(1)}MB). 건너뜀.`);
          } else {
            const host = (() => { try { return new URL(args.url!).hostname; } catch { return 'url'; } })();
            const stem = safeStem(args.title ?? `web-${host}`);
            const dest = await uniqueDest(kdir, `${stem}.md`);
            await fs.writeFile(dest, `<!-- source: ${sanitisePromptLine(args.url, 300)} -->\n\n${body}`, 'utf8');
            added.push({ name: basename(dest), bytes: Buffer.byteLength(body) });
          }
        }
      } catch (e) {
        lines.push(`⚠ URL 가져오기 오류 (네트워크 차단일 수 있음): ${sanitisePromptLine((e as Error).message, 200)}`);
        lines.push('  → 페이지를 직접 복사해 learn --text 로 붙여넣으면 확실합니다.');
      }
    }

    if (added.length === 0 && lines.length === 0) {
      return errorReply('추가된 지식이 없습니다 (가져올 수 있는 .md/.txt/.json/.jsonl/.csv 파일이 없었어요).');
    }

    const totalBytes = added.reduce((n, a) => n + a.bytes, 0);
    await appendHistory(args.slug, `learn (+${added.length} files, ${(totalBytes / 1024).toFixed(1)}KB)`);
    await auditAppend({
      tool: 'afterglow_learn',
      slug: args.slug,
      summary: `learn · +${added.length} files`,
      meta: { files: added.length, bytes: totalBytes, skipped: skipped.length, source: args.path ? 'path' : args.text !== undefined ? 'text' : 'url' },
    });

    const out: string[] = [];
    out.push(`✦ ${args.slug} 가 ${added.length}개 자료를 학습했습니다 (${(totalBytes / 1024).toFixed(1)}KB).`);
    for (const a of added.slice(0, 12)) out.push(`  + ${a.name}  (${(a.bytes / 1024).toFixed(1)}KB)`);
    if (added.length > 12) out.push(`  … 외 ${added.length - 12}개`);
    if (skipped.length > 0) {
      out.push('');
      out.push(`  건너뜀 ${skipped.length}개 (RAG 미지원 형식 — .md/.txt/.json/.jsonl/.csv 만 색인됨):`);
      for (const s of skipped.slice(0, 8)) out.push(`    · ${sanitisePromptLine(s, 120)}`);
      if (skipped.length > 8) out.push(`    … 외 ${skipped.length - 8}개`);
    }
    out.push(...lines);
    out.push('');
    out.push(`바로 물어보세요: /afterglow ask ${args.slug} "..."  — 방금 추가한 자료에서 검색해 답합니다.`);
    return { content: [{ type: 'text', text: out.join('\n') }] };
  });
}

/** Pick a non-colliding filename in `dir`, appending -1, -2 … if needed. */
async function uniqueDest(dir: string, name: string): Promise<string> {
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length) || 'file';
  let candidate = join(dir, `${stem}${ext}`);
  let n = 1;
  // bounded loop — avoid spinning forever on a pathological dir
  while (n < 1000) {
    try {
      await fs.access(candidate);
      candidate = join(dir, `${stem}-${n}${ext}`);
      n++;
    } catch {
      return candidate;
    }
  }
  return join(dir, `${stem}-${Date.now()}${ext}`);
}
