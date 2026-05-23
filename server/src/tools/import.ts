import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  agentDir,
  agentExists,
  assertInitialized,
  assertValidSlug,
  embeddingsDir,
  interviewSessionDir,
  readInterviewIndex,
  upsertRegistryEntry,
  writeInterviewIndex,
  writeProvenance,
  type AgentStatus,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import {
  ALWAYS_EXCLUDE,
  copyAgentTreeNoSymlinks,
  isAgentFolder,
  isBundleDir,
  readManifest,
  validateAgentSource,
  type AgentValidation,
} from '../portable.js';
import type { Provenance } from '../interview.js';
import { sanitisePromptLine } from '../sanitize.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const importShape = {
  input: z.string().min(1).max(2_000).describe('번들 폴더 또는 단일 에이전트 폴더 경로.'),
  as: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('단일 에이전트 import 시 새 slug 로 변경 (충돌 회피). 다중 번들에는 사용 불가.'),
  trustSigner: z
    .string()
    .max(200)
    .optional()
    .describe('원 서명자를 명시적으로 신뢰 → trustLevel=manual-approved (감사 기록).'),
  importedBy: z.string().max(200).optional().describe('받는 사람 표시 (provenance).'),
  from: z.string().max(200).optional().describe('보낸 사람 / 전달 경로 표시 (chain of custody).'),
  acceptBrokenChain: z
    .boolean()
    .optional()
    .describe('folderHash 불일치(변조 의심)에도 강행 → trustLevel=broken-chain 영구 기록.'),
  merge: z
    .boolean()
    .optional()
    .describe('같은 slug 존재 시 interviews 회차만 병합 (페르소나는 보존).'),
  dryRun: z.boolean().optional().describe('실제 import 없이 검증 결과만 보고 (verify 와 동일).'),
} as const;

interface ImportArgs {
  input: string;
  as?: string;
  trustSigner?: string;
  importedBy?: string;
  from?: string;
  acceptBrokenChain?: boolean;
  merge?: boolean;
  dryRun?: boolean;
}

interface SourceEntry {
  dir: string;
  manifestHash?: string;
  manifestStatus?: string;
  originSigner?: string;
}

export async function runImport(args: ImportArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();

    if (args.input.includes('\0')) return errorReply('input 경로에 NUL 바이트가 있습니다.');
    const inputDir = isAbsolute(args.input) ? resolve(args.input) : resolve(process.cwd(), args.input);
    let stat;
    try {
      stat = await fs.stat(inputDir);
    } catch {
      return errorReply(`경로를 찾을 수 없습니다: ${inputDir}`);
    }
    if (!stat.isDirectory()) {
      return errorReply(`폴더가 아닙니다: ${inputDir}. 번들이 압축(.tgz/.zip)이라면 먼저 풀어주세요.`);
    }

    // Resolve the list of agent source folders + per-agent integrity metadata.
    const sources: SourceEntry[] = [];
    let bundleIncludedVersions = false;
    let isBundle = false;
    if (await isBundleDir(inputDir)) {
      isBundle = true;
      const manifest = await readManifest(inputDir);
      bundleIncludedVersions = manifest.includedVersions;
      for (const a of manifest.agents) {
        sources.push({
          dir: join(inputDir, 'agents', a.slug),
          manifestHash: a.folderHash,
          manifestStatus: a.status,
          originSigner: a.originSigner,
        });
      }
      if (sources.length === 0) return errorReply('번들에 에이전트가 없습니다.');
    } else if (await isAgentFolder(inputDir)) {
      sources.push({ dir: inputDir });
    } else {
      return errorReply(
        `${inputDir} 는 번들(manifest.json)도 에이전트 폴더(persona.json)도 아닙니다.`,
      );
    }

    if (args.as && sources.length > 1) {
      return errorReply('--as 는 단일 에이전트 import 에서만 쓸 수 있습니다 (다중 번들 불가).');
    }

    const exclude = new Set(ALWAYS_EXCLUDE);
    if (!bundleIncludedVersions) exclude.add('.versions');

    const results: ImportResult[] = [];
    for (const src of sources) {
      results.push(await importOne(src, exclude, args, isBundle));
    }

    return { content: [{ type: 'text', text: renderReport(results, args, inputDir) }] };
  });
}

interface ImportResult {
  sourceDir: string;
  targetSlug: string;
  validation: AgentValidation;
  action: 'imported' | 'merged' | 'skipped' | 'rejected' | 'would-import' | 'would-merge';
  reason?: string;
  status?: AgentStatus;
  trustLevel?: string;
}

async function importOne(
  src: SourceEntry,
  exclude: Set<string>,
  args: ImportArgs,
  isBundle: boolean,
): Promise<ImportResult> {
  const v = await validateAgentSource(src.dir, exclude, src.manifestHash);

  // Hard reject: invalid persona schema.
  if (!v.schemaOk) {
    return { sourceDir: src.dir, targetSlug: v.slug, validation: v, action: 'rejected', reason: `persona.json 검증 실패 (${v.schemaErrors.slice(0, 2).join('; ')})` };
  }

  // Target slug. `--as` is honoured for any single-agent import (the multi-agent
  // guard in runImport already rejected `as` when sources.length > 1).
  const targetSlug = args.as ? args.as : v.slug;
  try {
    assertValidSlug(targetSlug);
  } catch (e) {
    return { sourceDir: src.dir, targetSlug, validation: v, action: 'rejected', reason: (e as Error).message };
  }

  // Tamper check (bundle only).
  let trustLevel: Provenance['trustLevel'] = args.trustSigner ? 'manual-approved' : 'unverified';
  if (v.hashMatches === false) {
    if (!args.acceptBrokenChain) {
      return {
        sourceDir: src.dir,
        targetSlug,
        validation: v,
        action: 'rejected',
        reason: 'folderHash 불일치 (변조 의심). acceptBrokenChain=true 로만 강행 가능.',
      };
    }
    trustLevel = 'broken-chain';
  }

  const exists = await agentExists(targetSlug);

  // Merge path — interviews only.
  if (exists && args.merge) {
    if (args.dryRun) {
      return { sourceDir: src.dir, targetSlug, validation: v, action: 'would-merge' };
    }
    const merged = await mergeInterviews(src.dir, targetSlug);
    await appendProvenanceCustody(targetSlug, src, args, trustLevel, v, true);
    await auditAppend({
      tool: 'afterglow_import',
      slug: targetSlug,
      summary: `import merge · ${targetSlug} · +${merged} interviews`,
      meta: { mergedInterviews: merged, trustLevel },
    });
    return { sourceDir: src.dir, targetSlug, validation: v, action: 'merged', reason: `${merged} 회차 병합`, trustLevel };
  }

  // Collision without merge/as.
  if (exists) {
    return {
      sourceDir: src.dir,
      targetSlug,
      validation: v,
      action: 'rejected',
      reason: `slug "${targetSlug}" 이미 존재. --as <new-slug> 또는 --merge 를 쓰세요.`,
    };
  }

  // Status: signed + hash-ok → active; else paused (forces review).
  const status: AgentStatus = v.hasConsentSignature && v.hashMatches !== false ? 'active' : 'paused';

  if (args.dryRun) {
    return { sourceDir: src.dir, targetSlug, validation: v, action: 'would-import', status, trustLevel };
  }

  // Copy (no symlinks, no embeddings) → regenerate empty embeddings dir.
  await copyAgentTreeNoSymlinks(src.dir, agentDir(targetSlug), new Set(ALWAYS_EXCLUDE));
  await fs.mkdir(embeddingsDir(targetSlug), { recursive: true });

  // Provenance.
  const prov: Provenance = {
    version: 1,
    origin: {
      signer: src.originSigner ?? (v.hasConsentSignature ? v.name : undefined),
      method: v.hasConsentSignature ? 'self-handoff' : 'unknown',
      createdAt: undefined,
    },
    imported: true,
    importedAt: new Date().toISOString(),
    importedBy: args.importedBy ? sanitisePromptLine(args.importedBy, 200) : undefined,
    sourceHash: v.computedHash,
    trustLevel,
    chainOfCustody: [
      {
        from: sanitisePromptLine(args.from ?? src.originSigner ?? '(원본)', 200),
        to: sanitisePromptLine(args.importedBy ?? '(이 기기)', 200),
        method: isBundle ? 'bundle-import' : 'folder-import',
        at: new Date().toISOString(),
      },
    ],
    postImportActivity: [],
  };
  await writeProvenance(targetSlug, prov);

  // Registry.
  await upsertRegistryEntry({
    slug: targetSlug,
    name: v.name,
    role: v.role,
    status,
    createdAt: new Date().toISOString(),
    trainedAt: status === 'active' ? new Date().toISOString() : null,
  });

  await auditAppend({
    tool: 'afterglow_import',
    slug: targetSlug,
    summary: `import · ${targetSlug} · ${status} · trust=${trustLevel}`,
    meta: { status, trustLevel, sourceHash: v.computedHash, injectionWarnings: v.injectionWarnings.length },
  });

  return { sourceDir: src.dir, targetSlug, validation: v, action: 'imported', status, trustLevel };
}

/** Copy interview sessions from a source agent folder that don't already
 *  exist in the target, and merge the index. Returns count merged. */
async function mergeInterviews(sourceDir: string, targetSlug: string): Promise<number> {
  const srcIndexPath = join(sourceDir, 'interviews', 'index.json');
  let srcIndex: { sessions?: { sessionId: string }[] } = {};
  try {
    srcIndex = JSON.parse(await fs.readFile(srcIndexPath, 'utf8'));
  } catch {
    return 0;
  }
  const targetIndex = await readInterviewIndex(targetSlug);
  const existing = new Set(targetIndex.sessions.map((s) => s.sessionId));
  let merged = 0;
  for (const s of srcIndex.sessions ?? []) {
    if (existing.has(s.sessionId)) continue;
    const from = join(sourceDir, 'interviews', s.sessionId);
    try {
      await copyAgentTreeNoSymlinks(from, interviewSessionDir(targetSlug, s.sessionId), new Set());
      targetIndex.sessions.push(s as (typeof targetIndex.sessions)[number]);
      merged++;
    } catch {
      /* skip unreadable session */
    }
  }
  targetIndex.sessions.sort((a, b) => a.ordinal - b.ordinal);
  await writeInterviewIndex(targetSlug, targetIndex);
  return merged;
}

async function appendProvenanceCustody(
  targetSlug: string,
  src: SourceEntry,
  args: ImportArgs,
  trustLevel: Provenance['trustLevel'],
  v: AgentValidation,
  merge: boolean,
): Promise<void> {
  const prov: Provenance = {
    version: 1,
    origin: { signer: src.originSigner, method: 'unknown' },
    imported: true,
    importedAt: new Date().toISOString(),
    importedBy: args.importedBy ? sanitisePromptLine(args.importedBy, 200) : undefined,
    sourceHash: v.computedHash,
    trustLevel,
    chainOfCustody: [
      {
        from: sanitisePromptLine(args.from ?? '(원본)', 200),
        to: sanitisePromptLine(args.importedBy ?? '(이 기기)', 200),
        method: merge ? 'interview-merge' : 'bundle-import',
        at: new Date().toISOString(),
      },
    ],
    postImportActivity: [],
  };
  await writeProvenance(targetSlug, prov);
}

function renderReport(results: ImportResult[], args: ImportArgs, inputDir: string): string {
  const lines: string[] = [];
  const verb = args.dryRun ? '검증(dry-run)' : 'import';
  lines.push(`# afterglow ${verb} · ${inputDir}`);
  lines.push('');
  for (const r of results) {
    const v = r.validation;
    const ok =
      r.action === 'imported' || r.action === 'merged' || r.action === 'would-import' || r.action === 'would-merge';
    const mark = ok ? '✦' : r.action === 'rejected' ? '✗' : '·';
    lines.push(`${mark} ${r.targetSlug}  (${sanitisePromptLine(v.name, 40)} · ${sanitisePromptLine(v.role, 40)})`);
    lines.push(`   액션:     ${r.action}${r.reason ? ` — ${r.reason}` : ''}`);
    lines.push(`   스키마:   ${v.schemaOk ? '✓ 통과' : '✗ 실패'}`);
    lines.push(`   서명:     ${v.hasConsentSignature ? '✓ 있음' : '✗ 없음 (→ paused 로 import)'}`);
    if (v.manifestHash) lines.push(`   무결성:   ${v.hashMatches ? '✓ 해시 일치' : '✗ 해시 불일치 (변조 의심)'}`);
    else lines.push(`   무결성:   (단일 폴더 — 매니페스트 없음) hash=${v.computedHash.slice(0, 19)}…`);
    if (v.hasSymlinks) lines.push(`   ⚠ 심볼릭링크 발견 — 복사 시 제외됩니다 (보안).`);
    if (v.injectionWarnings.length > 0) {
      lines.push(`   ⚠ 인젝션 의심 ${v.injectionWarnings.length}건:`);
      for (const w of v.injectionWarnings.slice(0, 4)) lines.push(`      - ${w}`);
    }
    if (r.status) lines.push(`   상태:     ${r.status}`);
    if (r.trustLevel) lines.push(`   신뢰도:   ${r.trustLevel}`);
    lines.push('');
  }
  const importedCount = results.filter((r) => r.action === 'imported' || r.action === 'merged').length;
  const rejectedCount = results.filter((r) => r.action === 'rejected').length;
  if (args.dryRun) {
    lines.push('dry-run 이므로 실제로 쓰지 않았습니다. 진행하려면 dryRun 없이 다시 실행하세요.');
  } else {
    lines.push(`완료: ${importedCount} 처리 · ${rejectedCount} 거부.`);
    if (importedCount > 0) lines.push('다음: /afterglow list 로 확인. active 가 아니면 /afterglow resume 또는 sign.');
  }
  if (rejectedCount > 0 && !args.dryRun) {
    lines.push('거부된 항목: --as <new-slug>(충돌) / --merge(병합) / --acceptBrokenChain(변조 강행) 검토.');
  }
  return lines.join('\n');
}
