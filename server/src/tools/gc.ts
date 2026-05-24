import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import {
  archivedAgentDir,
  assertInitialized,
  interviewAttachmentsDir,
  listArchivedSlugs,
  listVersions,
  listVersionTags,
  readInterviewIndex,
  readInterviewSession,
  readRegistry,
  removeRegistryEntry,
  appendHistory,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { elicitMissing, slugCandidates } from './elicit.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const gcShape = {
  action: z
    .enum(['list', 'prune-versions', 'purge-media', 'purge-archive'])
    .optional()
    .describe('(필수) list(미리보기) | prune-versions(오래된 스냅샷 정리·태그 보존) | purge-media(미디어 원본 삭제·전사본 유지) | purge-archive(보관함 영구 삭제).'),
  slug: z.string().optional().describe('대상 에이전트. 생략 시 prune-versions/purge-archive 는 전체 적용.'),
  keep: z.number().int().min(0).max(1000).optional().describe('prune-versions 시 보존할 최신 스냅샷 수 (기본 10). 태그된 버전은 항상 보존.'),
  days: z.number().int().min(0).max(3650).optional().describe('purge-archive 시 N일 이상 지난 것만 (기본 0 = 전부).'),
  apply: z.boolean().optional().describe('실제 삭제 (기본 false = dry-run, 무엇이 지워질지 보고만).'),
} as const;

interface GcArgs {
  action: 'list' | 'prune-versions' | 'purge-media' | 'purge-archive';
  slug?: string;
  keep?: number;
  days?: number;
  apply?: boolean;
}

export async function runGc(args: GcArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    const ask = await elicitMissing('gc', args as unknown as Record<string, unknown>, [
      { name: 'action', required: true, label: '동작', enumValues: ['list', 'prune-versions', 'purge-media', 'purge-archive'] },
      { name: 'slug', required: args.action === 'purge-media', label: '대상 에이전트 (purge-media 필수, 그 외 생략 시 전체)', candidates: slugCandidates, example: 'jiyoon' },
      { name: 'apply', required: false, label: '실제 적용 (기본 dry-run)' },
    ]);
    if (ask) return ask;
    const apply = !!args.apply;

    switch (args.action) {
      case 'list':
        return gcList();
      case 'prune-versions':
        return pruneVersions(args, apply);
      case 'purge-media':
        return purgeMedia(args, apply);
      case 'purge-archive':
        return purgeArchive(args, apply);
    }
  });
}

async function targetSlugs(slug?: string): Promise<string[]> {
  if (slug) return [slug];
  const reg = await readRegistry();
  return reg.agents.map((a) => a.slug);
}

/* --------------------------------------------------------------- */
/* prune-versions                                                  */
/* --------------------------------------------------------------- */

async function pruneVersions(args: GcArgs, apply: boolean): Promise<ToolReply> {
  const keep = args.keep ?? 10;
  const slugs = await targetSlugs(args.slug);
  const lines: string[] = [`# gc prune-versions (keep ${keep}, ${apply ? '적용' : 'dry-run'})`, ''];
  let totalDeleted = 0;
  for (const slug of slugs) {
    const versions = await listVersions(slug); // ascending by version number
    if (versions.length === 0) continue;
    const tags = await listVersionTags(slug);
    const tagged = new Set(Object.values(tags));
    const newest = new Set(versions.slice(-keep).map((v) => v.id));
    const toDelete = versions.filter((v) => !newest.has(v.id) && !tagged.has(v.id));
    if (toDelete.length === 0) continue;
    lines.push(`  ${slug}: ${versions.length} 스냅샷 → ${toDelete.length} 삭제 (태그 ${tagged.size} 보존)`);
    if (apply) {
      for (const v of toDelete) {
        await fs.rm(v.path, { force: true }).catch(() => {});
      }
      await appendHistory(slug, `gc prune-versions: deleted ${toDelete.length} (kept ${keep} + ${tagged.size} tagged)`);
    }
    totalDeleted += toDelete.length;
  }
  if (totalDeleted === 0) lines.push('  (정리할 스냅샷이 없습니다.)');
  lines.push('');
  lines.push(apply ? `완료: ${totalDeleted} 스냅샷 삭제.` : `dry-run: ${totalDeleted} 스냅샷이 삭제 대상. --apply 로 실행.`);
  await auditAppend({ tool: 'afterglow_gc', summary: `prune-versions · ${apply ? 'apply' : 'dry'} · ${totalDeleted}`, meta: { keep, apply, deleted: totalDeleted, slugs: slugs.length } });
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

/* --------------------------------------------------------------- */
/* purge-media (GDPR — drop media bytes, keep transcripts)         */
/* --------------------------------------------------------------- */

async function purgeMedia(args: GcArgs, apply: boolean): Promise<ToolReply> {
  if (!args.slug) return errorReply('purge-media 에는 slug 가 필요합니다.');
  const idx = await readInterviewIndex(args.slug);
  const lines: string[] = [`# gc purge-media · ${args.slug} (${apply ? '적용' : 'dry-run'})`, ''];
  let files = 0;
  let bytes = 0;
  for (const item of idx.sessions) {
    const sess = await readInterviewSession(args.slug, item.sessionId);
    if (!sess || sess.attachments.length === 0) continue;
    const dir = interviewAttachmentsDir(args.slug, item.sessionId);
    for (const att of sess.attachments) {
      // Keep transcripts; remove only the original media bytes.
      lines.push(`  #${item.sessionId} ${att.file} (${att.kind}, ${(att.bytes / 1024 / 1024).toFixed(2)}MB) — 원본 삭제${att.transcriptFile ? ` (전사본 ${att.transcriptFile} 유지)` : ''}`);
      files++;
      bytes += att.bytes;
      if (apply) await fs.rm(resolve(dir, att.file), { force: true }).catch(() => {});
    }
  }
  if (apply && files > 0) await appendHistory(args.slug, `gc purge-media: removed ${files} media originals (${(bytes / 1024 / 1024).toFixed(1)}MB)`);
  if (files === 0) lines.push('  (삭제할 미디어 원본이 없습니다.)');
  lines.push('');
  lines.push(apply ? `완료: ${files} 원본 삭제 (~${(bytes / 1024 / 1024).toFixed(1)}MB). 전사본·메타데이터는 보존.` : `dry-run: ${files} 원본(~${(bytes / 1024 / 1024).toFixed(1)}MB)이 삭제 대상. --apply 로 실행.`);
  await auditAppend({ tool: 'afterglow_gc', slug: args.slug, summary: `purge-media · ${apply ? 'apply' : 'dry'} · ${files}`, meta: { apply, files, bytes } });
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

/* --------------------------------------------------------------- */
/* purge-archive (hard delete archived agents)                     */
/* --------------------------------------------------------------- */

async function purgeArchive(args: GcArgs, apply: boolean): Promise<ToolReply> {
  const days = args.days ?? 0;
  const archived = args.slug ? [args.slug] : await listArchivedSlugs();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const lines: string[] = [`# gc purge-archive (≥${days}일, ${apply ? '적용' : 'dry-run'})`, ''];
  let purged = 0;
  for (const slug of archived) {
    const dir = archivedAgentDir(slug);
    let mtimeMs = 0;
    try {
      mtimeMs = (await fs.stat(dir)).mtimeMs;
    } catch {
      continue; // not actually archived on disk
    }
    if (days > 0 && mtimeMs > cutoff) {
      lines.push(`  ${slug}: 보관 기간 미달 — 건너뜀`);
      continue;
    }
    lines.push(`  ${slug}: 영구 삭제 대상 (보관: ${new Date(mtimeMs).toISOString().slice(0, 10)})`);
    purged++;
    if (apply) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      await removeRegistryEntry(slug);
    }
  }
  if (purged === 0) lines.push('  (삭제 대상 보관 에이전트가 없습니다.)');
  lines.push('');
  lines.push(apply ? `완료: ${purged} 에이전트 영구 삭제 + registry 정리.` : `dry-run: ${purged} 에이전트가 삭제 대상. --apply 로 실행 (되돌릴 수 없음).`);
  await auditAppend({ tool: 'afterglow_gc', summary: `purge-archive · ${apply ? 'apply' : 'dry'} · ${purged}`, meta: { apply, purged, days } });
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

/* --------------------------------------------------------------- */
/* list (preview all gc opportunities)                             */
/* --------------------------------------------------------------- */

async function gcList(): Promise<ToolReply> {
  const reg = await readRegistry();
  const archived = await listArchivedSlugs();
  const lines: string[] = ['# gc — 정리 가능 항목 미리보기', ''];
  let snapTotal = 0;
  for (const a of reg.agents) {
    const v = await listVersions(a.slug);
    snapTotal += v.length;
  }
  lines.push(`에이전트 ${reg.agents.length} · 스냅샷 합계 ${snapTotal} · 보관함 ${archived.length}`);
  lines.push('');
  lines.push('가능한 작업:');
  lines.push('  · prune-versions [--slug X] [--keep 10] [--apply]   오래된 스냅샷 정리 (태그 보존)');
  lines.push('  · purge-media --slug X [--apply]                    미디어 원본 삭제 (전사본 유지·GDPR)');
  lines.push('  · purge-archive [--slug X] [--days N] [--apply]     보관함 영구 삭제 (되돌릴 수 없음)');
  lines.push('');
  lines.push('기본은 모두 dry-run 입니다. 실제 삭제는 --apply 필요.');
  await auditAppend({ tool: 'afterglow_gc', summary: 'gc list', meta: { agents: reg.agents.length, snapshots: snapTotal, archived: archived.length } });
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
