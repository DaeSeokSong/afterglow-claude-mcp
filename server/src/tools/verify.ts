import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { assertInitialized } from '../storage.js';
import { append as auditAppend } from '../audit.js';
import {
  ALWAYS_EXCLUDE,
  isAgentFolder,
  isBundleDir,
  readManifest,
  validateAgentSource,
  type AgentValidation,
} from '../portable.js';
import { sanitisePromptLine } from '../sanitize.js';
import { elicitMissing } from './elicit.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const verifyShape = {
  input: z.string().min(1).max(2_000).optional().describe('(필수) 검증할 번들 폴더 또는 단일 에이전트 폴더 경로. 생략 시 안내합니다.'),
} as const;

interface VerifyArgs {
  input: string;
}

/**
 * Read-only pre-flight for a received bundle / agent folder. Reports schema,
 * signature, hash integrity, symlink + injection findings WITHOUT touching the
 * local agent store. Use before `afterglow_import` to decide whether to trust.
 */
export async function runVerify(args: VerifyArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    const ask = await elicitMissing('verify', args as unknown as Record<string, unknown>, [
      { name: 'input', required: true, label: '검증할 번들/폴더 경로', example: './afterglow-export-…/' },
    ]);
    if (ask) return ask;

    if (args.input.includes('\0')) return errorReply('input 경로에 NUL 바이트가 있습니다.');
    const inputDir = isAbsolute(args.input) ? resolve(args.input) : resolve(process.cwd(), args.input);
    let stat;
    try {
      stat = await fs.stat(inputDir);
    } catch {
      return errorReply(`경로를 찾을 수 없습니다: ${inputDir}`);
    }
    if (!stat.isDirectory()) return errorReply(`폴더가 아닙니다: ${inputDir}.`);

    const exclude = new Set(ALWAYS_EXCLUDE);
    const reports: AgentValidation[] = [];
    let kind: 'bundle' | 'folder';

    let signatureLine: string | null = null;
    if (await isBundleDir(inputDir)) {
      kind = 'bundle';
      const manifest = await readManifest(inputDir);
      if (!manifest.includedVersions) exclude.add('.versions');
      for (const a of manifest.agents) {
        reports.push(await validateAgentSource(join(inputDir, 'agents', a.slug), exclude, a.folderHash));
      }
      // Phase P3 — surface the manifest signature status. Present + verifies
      // → trustworthy. Present + fails → likely tampered. Absent → unsigned
      // (back-compat with pre-v0.10 bundles, no failure).
      if (manifest.signature && manifest.bundleHash) {
        const { verifyPayload, fingerprintPublicKey } = await import('../keys.js');
        const ok = verifyPayload(manifest.bundleHash, manifest.signature.publicKey, manifest.signature.signature);
        const fp = fingerprintPublicKey(manifest.signature.publicKey);
        const who = sanitisePromptLine(manifest.signature.signer ?? '(이름 없음)', 80);
        signatureLine = ok
          ? `서명: ✓ 검증 통과 — signer="${who}" · 키 지문 ${fp}`
          : `서명: ✗ 검증 실패 — manifest 가 서명 이후 변조됐을 가능성 (signer="${who}", 키 지문 ${fp})`;
        if (!ok) {
          // Surface as a top-level red flag in the summary report.
          reports.forEach((r) => r.injectionWarnings.push('manifest signature verification failed'));
        }
      } else {
        signatureLine = '서명: (없음) — 이 번들은 서명되지 않은 사전-v0.10 또는 비서명 export 입니다.';
      }
    } else if (await isAgentFolder(inputDir)) {
      kind = 'folder';
      exclude.add('.versions');
      reports.push(await validateAgentSource(inputDir, exclude));
    } else {
      return errorReply(`${inputDir} 는 번들도 에이전트 폴더도 아닙니다.`);
    }

    await auditAppend({
      tool: 'afterglow_verify',
      summary: `verify · ${kind} · ${reports.length} agents`,
      meta: { kind, agents: reports.length, input: inputDir },
    });

    const lines: string[] = [];
    lines.push(`# afterglow verify · ${kind} · ${inputDir}`);
    lines.push('');
    if (signatureLine) {
      lines.push(signatureLine);
      lines.push('');
    }
    let allGood = true;
    for (const v of reports) {
      const blocking = !v.schemaOk || v.hashMatches === false;
      if (blocking) allGood = false;
      lines.push(`${blocking ? '✗' : '✦'} ${v.slug}  (${sanitisePromptLine(v.name, 40)} · ${sanitisePromptLine(v.role, 40)})`);
      lines.push(`   스키마:   ${v.schemaOk ? '✓ 통과' : `✗ 실패 (${v.schemaErrors.slice(0, 2).join('; ')})`}`);
      lines.push(`   서명:     ${v.hasConsentSignature ? '✓ 있음 → active 로 import 가능' : '✗ 없음 → paused 로 import'}`);
      if (v.manifestHash !== undefined) {
        lines.push(`   무결성:   ${v.hashMatches ? '✓ 매니페스트 해시 일치' : '✗ 해시 불일치 — 변조 의심 (acceptBrokenChain 필요)'}`);
      } else {
        lines.push(`   무결성:   단일 폴더 (매니페스트 없음) · hash=${v.computedHash.slice(0, 23)}…`);
      }
      lines.push(`   파일 수:  ${v.fileCount}`);
      if (v.hasSymlinks) lines.push(`   ⚠ 심볼릭 링크 포함 — import 시 제외됩니다.`);
      if (v.injectionWarnings.length > 0) {
        lines.push(`   ⚠ 프롬프트 인젝션 의심 ${v.injectionWarnings.length}건:`);
        for (const w of v.injectionWarnings.slice(0, 5)) lines.push(`      - ${w}`);
        allGood = false;
      }
      lines.push('');
    }
    lines.push(
      allGood
        ? '결과: 안전하게 import 가능해 보입니다. → /afterglow import <경로> --trustSigner "원서명자"'
        : '결과: 주의가 필요합니다. 위 ✗/⚠ 항목을 확인한 뒤 import 옵션을 결정하세요.',
    );
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}
