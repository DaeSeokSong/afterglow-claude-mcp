import { z } from 'zod';
import { init, isInitialized } from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { safe, type ToolReply } from './types.js';

export const initShape = {
  embeddingModel: z
    .string()
    .max(200)
    .optional()
    .describe('RAG 검색용 임베딩 모델 이름. 기본값은 text-embedding-3-small.'),
} as const;

export async function runInit(args: { embeddingModel?: string }): Promise<ToolReply> {
  return safe(async () => {
  const wasInitialized = await isInitialized();
  const result = await init({ embeddingModel: args.embeddingModel });
  const lines: string[] = [];
  if (result.alreadyExisted && result.created.length === 0) {
    lines.push(`✓ Afterglow 는 이미 초기화되어 있어요 (${result.root}).`);
  } else if (wasInitialized) {
    lines.push(`✓ 누락된 폴더/파일을 채웠어요 (${result.root}).`);
  } else {
    lines.push(`✦ Afterglow 초기화 완료 (${result.root}).`);
  }
  for (const p of result.created) {
    lines.push(`  · ${p}`);
  }
  lines.push('');
  lines.push('다음에 할 수 있는 일:');
  lines.push('  · /afterglow create <slug>           — 첫 에이전트 만들기');
  lines.push('  · /afterglow sign <slug> --signer "이름"   — 동의서 서명 후 ask 가능');
  lines.push('  · /afterglow list                     — 등록된 에이전트 보기');

  await auditAppend({
    tool: 'afterglow_init',
    summary: wasInitialized ? 'init re-run (idempotent)' : 'init bootstrap',
    meta: { created: result.created.length, root: result.root },
  });
  return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}
