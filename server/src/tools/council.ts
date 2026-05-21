import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  agentExists,
  AgentNotFoundError,
  appendHistory,
  assertActive,
  assertInitialized,
  councilsDir,
  readPersona,
  readSystemPrompt,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { retrieve, type Retrieval } from '../rag.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const councilShape = {
  slugs: z
    .array(z.string().min(1))
    .min(2)
    .max(6)
    .describe('참가할 에이전트 slug 배열 (2–6명).'),
  question: z.string().min(1).describe('회의 주제 / 사용자 질문.'),
  topic: z
    .string()
    .min(1)
    .optional()
    .describe('회의록 파일명에 들어갈 짧은 토픽 식별자. 없으면 자동 생성.'),
  topK: z
    .number()
    .int()
    .min(1)
    .max(8)
    .optional()
    .describe('각 에이전트별 RAG 청크 수 (기본 3).'),
} as const;

interface CouncilArgs {
  slugs: string[];
  question: string;
  topic?: string;
  topK?: number;
}

function topicSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'council';
}

function tsForFilename(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

interface ParticipantContext {
  slug: string;
  systemPrompt: string;
  hits: Retrieval[];
  expertise: string[];
}

/**
 * Multi-agent council: pulls each participant's persona + per-question RAG
 * chunks, then returns a structured "council brief" Claude can use to roleplay
 * a meeting. Always writes a markdown transcript header to councils/ so the
 * conversation has a stable place to land.
 *
 * Like `ask`, this does NOT call an LLM — Claude in the user's session
 * performs the actual turn-taking.
 */
export async function runCouncil(args: CouncilArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();

    const uniqueSlugs = Array.from(new Set(args.slugs));
    if (uniqueSlugs.length !== args.slugs.length) {
      return errorReply('중복된 slug 가 있습니다. 같은 사람을 두 번 부를 수 없어요.');
    }
    for (const slug of uniqueSlugs) {
      if (!(await agentExists(slug))) {
        return errorReply(new AgentNotFoundError(slug).message);
      }
      // active gate — draft 에이전트는 회의 참가 거부
      try {
        await assertActive(slug);
      } catch (e) {
        return errorReply((e as Error).message);
      }
    }

    const topK = args.topK ?? 3;
    const participants: ParticipantContext[] = [];
    for (const slug of uniqueSlugs) {
      const persona = await readPersona(slug);
      const systemPrompt = await readSystemPrompt(slug);
      const hits = await retrieve(slug, args.question, topK);
      participants.push({
        slug,
        systemPrompt: systemPrompt.trim(),
        hits,
        expertise: persona.expertise,
      });
    }

    /* ----- write council transcript skeleton ----- */
    const now = new Date();
    const topic = args.topic && args.topic.trim().length > 0 ? args.topic.trim() : args.question;
    const file = `${tsForFilename(now)}-${topicSlug(topic)}.md`;
    const path = join(councilsDir(), file);
    await fs.mkdir(councilsDir(), { recursive: true });

    const transcript: string[] = [];
    transcript.push(`# Council — ${topic}`);
    transcript.push('');
    transcript.push(`- 시각: ${now.toISOString()}`);
    transcript.push(`- 참가자: ${uniqueSlugs.join(' · ')}`);
    transcript.push(`- 질문: ${args.question.trim()}`);
    transcript.push('');
    transcript.push('## 참가자 컨텍스트');
    for (const p of participants) {
      transcript.push('');
      transcript.push(`### ${p.slug}`);
      transcript.push(`- 자신있는 영역: ${p.expertise.length ? p.expertise.join(' · ') : '(미지정)'}`);
      transcript.push(`- 검색된 자료: ${p.hits.length} 청크`);
      if (p.hits.length > 0) {
        for (const h of p.hits) {
          transcript.push(`  - ${shortPath(h.chunk.path)} (chunk ${h.chunk.chunkIndex}) · score ${h.score.toFixed(3)}`);
        }
      }
    }
    transcript.push('');
    transcript.push('## 발언 기록');
    transcript.push('');
    transcript.push('(Claude 가 채워 넣어요 — 합의에 도달하면 "## 결론" 섹션을 닫아주세요.)');
    transcript.push('');
    await fs.writeFile(path, transcript.join('\n') + '\n', 'utf8');

    /* ----- history + audit ----- */
    for (const slug of uniqueSlugs) {
      await appendHistory(slug, `council "${truncate(args.question, 80)}" — file ${file}`);
    }
    await auditAppend({
      tool: 'afterglow_council',
      summary: `council ${uniqueSlugs.length} agents · ${truncate(args.question, 60)}`,
      meta: { slugs: uniqueSlugs, file },
    });

    /* ----- build the brief returned to Claude ----- */
    const out: string[] = [];
    out.push(`# Council Brief  ·  ${uniqueSlugs.length} 명 참가`);
    out.push('');
    out.push(`회의록 파일: ${path}`);
    out.push('');
    out.push('## 사용자 질문');
    out.push(args.question.trim());
    out.push('');
    out.push('## 참가 규칙');
    out.push('1. 각 에이전트는 자기 페르소나 시스템 프롬프트로 답하세요.');
    out.push('2. 한 에이전트가 모를 때는 다른 에이전트에게 ping(`@<slug>`) 하세요.');
    out.push('3. 합의 또는 명확한 이견까지 turn 을 진행하세요 (보통 2–3 turn).');
    out.push('4. 마지막에 "## 결론 (합의)" / "## 이견 / 보류" 섹션을 정리해 회의록에 추가하세요.');
    out.push('5. 모든 답변은 ✦ + 신뢰도 + 출처([1], [2]) 표시 규칙을 따르세요.');
    out.push('');

    for (const p of participants) {
      out.push(`## 참가자: ${p.slug}`);
      out.push('');
      out.push('### 시스템 프롬프트');
      out.push(p.systemPrompt);
      out.push('');
      out.push(`### 검색된 자료 (top ${p.hits.length} / ${topK})`);
      if (p.hits.length === 0) {
        out.push('(질문과 매칭되는 자료 없음 — 이 에이전트는 신중하게 답하거나 다른 참가자에게 ping 해야 합니다.)');
      } else {
        p.hits.forEach((h, i) => {
          out.push(`#### [${i + 1}] ${shortPath(h.chunk.path)} (chunk ${h.chunk.chunkIndex}) · score ${h.score.toFixed(3)}`);
          out.push(truncate(h.chunk.text, 500));
          out.push('');
        });
      }
      out.push('');
    }

    out.push('## 회의록');
    out.push(`작성 후 ${path} 에 append 해 주세요. 사용자가 추후 \`/afterglow log ${file.replace('.md', '')}\` 로 다시 볼 수 있어야 해요.`);

    return { content: [{ type: 'text', text: out.join('\n') }] };
  });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function shortPath(p: string): string {
  return p.replace(process.env.HOME ?? '', '~').replace(/\\/g, '/');
}
