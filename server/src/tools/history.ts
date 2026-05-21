import { z } from 'zod';
import {
  agentExists,
  AgentNotFoundError,
  assertInitialized,
  readHistory,
  type HistoryEvent,
} from '../storage.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const historyShape = {
  slug: z.string().min(1).describe('조회할 에이전트 slug.'),
  since: z
    .string()
    .optional()
    .describe('ISO 시각 또는 yyyy-mm-dd. 그 이후 이벤트만 표시.'),
  until: z.string().optional().describe('ISO 시각 또는 yyyy-mm-dd. 그 이전 이벤트만 표시.'),
  filter: z.string().optional().describe('메시지 본문에 포함되어야 할 문자열 (대소문자 무시).'),
  limit: z.number().int().min(1).max(500).optional().describe('최대 표시 줄 수 (기본 50).'),
  json: z.boolean().optional().describe('JSON 으로 출력.'),
  reverse: z.boolean().optional().describe('오래된 것부터 표시 (기본은 최신 먼저).'),
} as const;

interface HistoryArgs {
  slug: string;
  since?: string;
  until?: string;
  filter?: string;
  limit?: number;
  json?: boolean;
  reverse?: boolean;
}

function toDate(input: string | undefined): Date | null {
  if (!input) return null;
  // Accept "yyyy-mm-dd" by appending T00:00:00Z so we get UTC midnight.
  const expanded = /^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T00:00:00Z` : input;
  const d = new Date(expanded);
  return Number.isNaN(d.valueOf()) ? null : d;
}

export async function runHistory(args: HistoryArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    if (!(await agentExists(args.slug))) {
      return errorReply(new AgentNotFoundError(args.slug).message);
    }

    const since = toDate(args.since);
    const until = toDate(args.until);
    if (args.since && !since) return errorReply(`since 파싱 실패: "${args.since}"`);
    if (args.until && !until) return errorReply(`until 파싱 실패: "${args.until}"`);

    const filter = args.filter?.toLowerCase().trim();
    const limit = args.limit ?? 50;

    let events = await readHistory(args.slug);
    if (since) events = events.filter((e) => !e.ts || new Date(e.ts) >= since);
    if (until) events = events.filter((e) => !e.ts || new Date(e.ts) <= until);
    if (filter) events = events.filter((e) => e.message.toLowerCase().includes(filter));

    const ordered = args.reverse ? events : [...events].reverse();
    const limited = ordered.slice(0, limit);

    if (args.json) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { slug: args.slug, total: events.length, shown: limited.length, events: limited },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (events.length === 0) {
      return {
        content: [{ type: 'text', text: `(history 없음) ${args.slug} 에 기록된 이벤트가 없어요.` }],
      };
    }

    const lines: string[] = [];
    lines.push(`# history — ${args.slug}`);
    lines.push(`총 ${events.length} 건 · 표시 ${limited.length} 건${args.reverse ? ' · 오래된 순' : ''}`);
    lines.push('');
    for (const e of limited) {
      const ts = e.ts || '?';
      lines.push(`${ts}  ${e.message}`);
    }
    if (events.length > limited.length) {
      lines.push('');
      lines.push(`… ${events.length - limited.length} 건 더. --limit 늘리거나 --since / --filter 로 좁히세요.`);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}

/** Exported for testing. */
export type { HistoryEvent };
