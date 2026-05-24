import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  agentDir,
  agentExists,
  assertInitialized,
  readProvenance,
  readRegistry,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { ALWAYS_EXCLUDE, computeBundleHash, hashFolder, type BundleAgent, type BundleManifest } from '../portable.js';
import { sanitisePromptLine } from '../sanitize.js';
import { errorReply, safe, type ToolReply } from './types.js';

const SERVER_VERSION = '0.7.0';

export const exportShape = {
  slugs: z
    .array(z.string().min(1).max(64))
    .max(200)
    .optional()
    .describe('내보낼 에이전트 slug 목록 (다중). all=true 면 무시.'),
  all: z.boolean().optional().describe('등록된 모든 에이전트를 내보냄 (archived 제외).'),
  output: z
    .string()
    .max(1_000)
    .optional()
    .describe('번들 출력 폴더 경로. 기본 ./afterglow-export-<timestamp>/ (cwd 하위).'),
  exportedBy: z.string().max(200).optional().describe('내보낸 사람 표시 (provenance 용).'),
  includeVersions: z
    .boolean()
    .optional()
    .describe('.versions/ 스냅샷도 포함 (기본 false — 받는 쪽 용량 절약).'),
} as const;

interface ExportArgs {
  slugs?: string[];
  all?: boolean;
  output?: string;
  exportedBy?: string;
  includeVersions?: boolean;
}

/** Confine the output dir to the CWD subtree so export can't scribble over
 *  arbitrary filesystem locations from an MCP client. */
function safeOutputDir(input: string): string | { error: string } {
  if (!input || input.includes('\0')) return { error: '출력 경로가 비었거나 NUL 을 포함합니다.' };
  if (input.split(/[\\/]+/).includes('..')) return { error: '출력 경로에 ".." 를 쓸 수 없습니다.' };
  const resolved = isAbsolute(input) ? resolve(input) : resolve(process.cwd(), input);
  const cwd = resolve(process.cwd());
  if (resolved !== cwd && !resolved.startsWith(cwd + sep) && !resolved.startsWith(cwd + '/')) {
    return { error: `출력 폴더는 현재 작업 폴더(${cwd}) 하위여야 합니다. 받은 경로: ${resolved}` };
  }
  return resolved;
}

export async function runExport(args: ExportArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    const reg = await readRegistry();

    let targets: string[];
    if (args.all) {
      targets = reg.agents.filter((a) => a.status !== 'archived').map((a) => a.slug);
    } else if (args.slugs && args.slugs.length > 0) {
      targets = args.slugs;
    } else {
      return errorReply('slugs(다중) 또는 all=true 중 하나가 필요합니다.');
    }
    if (targets.length === 0) return errorReply('내보낼 에이전트가 없습니다.');

    // Validate every target up-front so we don't write a half bundle.
    const missing: string[] = [];
    for (const slug of targets) {
      if (!(await agentExists(slug)) || !reg.agents.some((a) => a.slug === slug)) missing.push(slug);
    }
    if (missing.length > 0) {
      return errorReply(`다음 에이전트를 찾을 수 없습니다: ${missing.map((s) => sanitisePromptLine(s, 64)).join(', ')}`);
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outResolved = args.output
      ? safeOutputDir(args.output)
      : resolve(process.cwd(), `afterglow-export-${ts}`);
    if (typeof outResolved !== 'string') return errorReply(`출력 폴더 거부: ${outResolved.error}`);
    if (await pathExists(outResolved)) {
      return errorReply(`출력 폴더가 이미 존재합니다: ${outResolved}. 덮어쓰기를 막기 위해 거부합니다.`);
    }

    const exclude = new Set(ALWAYS_EXCLUDE);
    if (!args.includeVersions) exclude.add('.versions');

    const bundleAgentsDir = join(outResolved, 'agents');
    await fs.mkdir(bundleAgentsDir, { recursive: true });

    const manifestAgents: BundleAgent[] = [];
    for (const slug of targets) {
      const src = agentDir(slug);
      const dest = join(bundleAgentsDir, slug);
      await fs.cp(src, dest, {
        recursive: true,
        filter: (from: string) => {
          const rel = relative(src, from).split(sep).join('/');
          if (rel === '') return true;
          const firstSeg = rel.split('/')[0];
          return !exclude.has(firstSeg);
        },
      });
      const { hash, fileCount } = await hashFolder(dest, exclude);
      const entry = reg.agents.find((a) => a.slug === slug)!;
      const prov = await readProvenance(slug);
      manifestAgents.push({
        slug,
        name: entry.name,
        role: entry.role,
        status: entry.status,
        folderHash: hash,
        fileCount,
        originSigner: prov?.origin.signer,
      });
    }

    const manifest: BundleManifest = {
      version: 1,
      format: 'afterglow-bundle',
      exportedAt: new Date().toISOString(),
      exportedBy: args.exportedBy ? sanitisePromptLine(args.exportedBy, 200) : undefined,
      sourceServerVersion: SERVER_VERSION,
      includedVersions: !!args.includeVersions,
      agents: manifestAgents,
    };
    manifest.bundleHash = computeBundleHash(manifest);
    await fs.writeFile(join(outResolved, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    await auditAppend({
      tool: 'afterglow_export',
      summary: `export · ${targets.length} agents → ${outResolved}`,
      meta: { agents: targets, output: outResolved, includeVersions: !!args.includeVersions },
    });

    const lines: string[] = [];
    lines.push(`✦ ${targets.length} 명 에이전트 번들 생성 완료.`);
    lines.push(`  위치: ${outResolved}`);
    lines.push('');
    lines.push('  포함:');
    for (const a of manifestAgents) {
      lines.push(`    · ${a.slug.padEnd(16)} ${sanitisePromptLine(a.name, 40).padEnd(20)} [${a.status}] · ${a.fileCount} files · ${a.folderHash.slice(0, 19)}…`);
    }
    lines.push('');
    lines.push('  전달 방법 (둘 중 하나):');
    lines.push(`    1) 폴더 그대로 압축해서 보내기:`);
    lines.push(`         tar czf afterglow-export-${ts}.tgz -C "${outResolved}/.." "${basenameOf(outResolved)}"`);
    lines.push(`       또는 OS 파일탐색기에서 폴더 zip.`);
    lines.push(`    2) 폴더 자체를 USB / 공유 드라이브로 복사.`);
    lines.push('');
    lines.push(`  번들 앵커 해시: ${manifest.bundleHash}`);
    lines.push('    ↳ 이 해시를 받는 사람에게 별도 채널(메신저·구두)로 전달하세요. 받는 사람이');
    lines.push('      /afterglow import … --expectAnchor <해시> 로 매니페스트 위변조를 검증합니다.');
    lines.push('');
    lines.push('  받는 사람은:');
    lines.push(`    (압축이면 먼저 풀고) /afterglow import <폴더경로> --expectAnchor ${manifest.bundleHash}`);
    lines.push(`    검증만: /afterglow verify <폴더경로>`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}

function basenameOf(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
