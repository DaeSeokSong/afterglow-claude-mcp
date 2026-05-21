import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { assertInitialized, councilsDir } from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const councilSummaryShape = {
  file: z
    .string()
    .optional()
    .describe('councils/ 안의 transcript 파일명 (확장자 .md 자동 보정). 없으면 가장 최근 회의록을 자동 선택.'),
  json: z.boolean().optional().describe('JSON 으로 출력.'),
} as const;

interface CouncilSummaryArgs {
  file?: string;
  json?: boolean;
}

interface ParsedSection {
  participants: string[];
  topic: string;
  question: string;
  startedAt: string | null;
  turns: TurnEvent[];
  conclusion: string[];
  dissent: string[];
  consensusReached: boolean;
  consensusSignals: string[];
  actionItems: string[];
  pings: { from: string; to: string }[];
}

interface TurnEvent {
  speaker: string | null;
  text: string;
}

const AGREE_RE = /(동의|만장일치|consensus|✓\s*동의|all agree|agreed|OK\b|👍)/i;
const REFUSE_RE = /(거절|반대|disagree|보류|아직 모르겠)/i;
const PING_RE = /@([a-z0-9][a-z0-9-]{0,30})/gi;

function parseTranscript(text: string): ParsedSection {
  const lines = text.split('\n');
  const result: ParsedSection = {
    participants: [],
    topic: '',
    question: '',
    startedAt: null,
    turns: [],
    conclusion: [],
    dissent: [],
    consensusReached: false,
    consensusSignals: [],
    actionItems: [],
    pings: [],
  };

  // section pointer
  type Section =
    | 'preamble'
    | 'participant_context'
    | 'turns'
    | 'conclusion'
    | 'dissent'
    | 'actions'
    | 'other';
  let section: Section = 'preamble';
  let currentSpeaker: string | null = null;
  let buffer: string[] = [];
  const flushTurn = () => {
    if (buffer.length > 0) {
      result.turns.push({ speaker: currentSpeaker, text: buffer.join('\n').trim() });
      buffer = [];
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    if (/^#\s+Council\s+—/i.test(line)) {
      result.topic = line.replace(/^#\s+Council\s+—\s+/i, '').trim();
      continue;
    }
    const tsMatch = line.match(/^- 시각:\s*(\S.*)$/);
    if (tsMatch) {
      result.startedAt = tsMatch[1].trim();
      continue;
    }
    const participantsMatch = line.match(/^- 참가자:\s*(.+)$/);
    if (participantsMatch) {
      result.participants = participantsMatch[1].split('·').map((s) => s.trim()).filter(Boolean);
      continue;
    }
    const questionMatch = line.match(/^- 질문:\s*(.+)$/);
    if (questionMatch) {
      result.question = questionMatch[1].trim();
      continue;
    }

    if (/^##\s+참가자 컨텍스트/.test(line)) {
      flushTurn();
      section = 'participant_context';
      continue;
    }
    if (/^##\s+발언 기록/.test(line)) {
      flushTurn();
      section = 'turns';
      currentSpeaker = null;
      continue;
    }
    if (/^##\s+결론/.test(line)) {
      flushTurn();
      section = 'conclusion';
      continue;
    }
    if (/^##\s+이견/.test(line)) {
      flushTurn();
      section = 'dissent';
      continue;
    }
    if (/^##\s+액션/.test(line) || /^##\s+action/i.test(line)) {
      flushTurn();
      section = 'actions';
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushTurn();
      section = 'other';
      continue;
    }

    if (section === 'turns') {
      // a `### <slug>` header starts a new turn
      const speakerHeader = line.match(/^###\s+(@?[a-z0-9][a-z0-9-]{0,30}|orchestrator|moderator)\b/i);
      if (speakerHeader) {
        flushTurn();
        currentSpeaker = speakerHeader[1].replace(/^@/, '');
        continue;
      }
      // also accept "<slug>:" inline
      const inlineSpeaker = line.match(/^(@?[a-z0-9][a-z0-9-]{0,30}):\s*(.+)$/i);
      if (inlineSpeaker) {
        flushTurn();
        currentSpeaker = inlineSpeaker[1].replace(/^@/, '');
        buffer.push(inlineSpeaker[2]);
        continue;
      }
      if (line.trim().length === 0 && buffer.length > 0) {
        // blank line within a turn: keep but don't flush yet
        buffer.push('');
        continue;
      }
      if (line.trim().length > 0) {
        buffer.push(line);
        continue;
      }
    } else if (section === 'conclusion') {
      const item = line.match(/^[-*]\s+(.+)$/);
      if (item && !/^없음/.test(item[1])) result.conclusion.push(item[1].trim());
    } else if (section === 'dissent') {
      const item = line.match(/^[-*]\s+(.+)$/);
      if (item && !/^없음/.test(item[1])) result.dissent.push(item[1].trim());
    } else if (section === 'actions') {
      const item = line.match(/^[-*]\s+(.+)$/);
      if (item) result.actionItems.push(item[1].trim());
    }
  }
  flushTurn();

  /* Derived: consensus signals + pings */
  const fullBody = result.turns.map((t) => t.text).join('\n');
  if (AGREE_RE.test(fullBody)) result.consensusSignals.push('합의 표현(동의 / agree / ✓) 감지');
  if (result.conclusion.length > 0 && result.dissent.length === 0) {
    result.consensusSignals.push('결론 ≥1, 이견 0 — 만장일치');
  }
  if (REFUSE_RE.test(fullBody) && result.dissent.length === 0) {
    result.consensusSignals.push('⚠ 반대 표현이 보이지만 "이견" 섹션에 안 잡힘');
  }
  result.consensusReached =
    result.conclusion.length > 0 && result.dissent.length === 0 && !REFUSE_RE.test(fullBody);

  PING_RE.lastIndex = 0;
  for (const turn of result.turns) {
    if (!turn.speaker) continue;
    let m: RegExpExecArray | null;
    const local = new RegExp(PING_RE.source, PING_RE.flags);
    while ((m = local.exec(turn.text)) !== null) {
      const target = m[1].toLowerCase();
      if (target !== turn.speaker.toLowerCase()) {
        result.pings.push({ from: turn.speaker, to: target });
      }
    }
  }

  return result;
}

async function listTranscripts(): Promise<string[]> {
  try {
    const entries = (await fs.readdir(councilsDir(), { withFileTypes: true })) as unknown as {
      name: string;
      isFile: () => boolean;
    }[];
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function runCouncilSummary(args: CouncilSummaryArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();

    let filename = args.file?.trim();
    if (filename) {
      // Reject path-traversal attempts up front. basename also drops any
      // leading directory components so a malicious "../../audit" can only
      // resolve to "audit.md" inside councils/.
      if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        return errorReply(
          `file 인자에 경로 구분자가 포함될 수 없어요: "${filename}". councils/ 안의 파일명만 주세요.`,
        );
      }
      filename = basename(filename);
      if (!filename.endsWith('.md')) filename = `${filename}.md`;
    }

    if (!filename) {
      const all = await listTranscripts();
      if (all.length === 0) {
        return errorReply('councils/ 에 회의록이 없어요. /afterglow council 으로 새 회의를 시작하세요.');
      }
      filename = all[all.length - 1];
    }

    const path = join(councilsDir(), filename);
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch {
      return errorReply(`회의록을 열 수 없어요: ${path}`);
    }

    const parsed = parseTranscript(raw);

    if (args.json) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                file: filename,
                path,
                ...parsed,
                turnCount: parsed.turns.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const lines: string[] = [];
    lines.push(`# council summary · ${filename}`);
    lines.push('');
    if (parsed.topic) lines.push(`**주제:** ${parsed.topic}`);
    if (parsed.question) lines.push(`**질문:** ${parsed.question}`);
    if (parsed.startedAt) lines.push(`**시각:** ${parsed.startedAt}`);
    if (parsed.participants.length > 0) {
      lines.push(`**참가자 (${parsed.participants.length}):** ${parsed.participants.join(' · ')}`);
    }
    lines.push('');
    lines.push(`**turn 수:** ${parsed.turns.length}    **ping:** ${parsed.pings.length}    **합의:** ${parsed.consensusReached ? '✓ 도달' : '✗ 미도달 또는 미정'}`);
    lines.push('');

    if (parsed.consensusSignals.length > 0) {
      lines.push('## 합의 감지 신호');
      for (const s of parsed.consensusSignals) lines.push(`- ${s}`);
      lines.push('');
    }

    if (parsed.conclusion.length > 0) {
      lines.push('## 결론 (합의)');
      for (const c of parsed.conclusion) lines.push(`- ${c}`);
      lines.push('');
    } else {
      lines.push('## 결론 (합의)');
      lines.push('- (회의록에 "## 결론" 섹션이 없거나 비어있어요. 합의 자동 감지 불가.)');
      lines.push('');
    }

    if (parsed.dissent.length > 0) {
      lines.push('## 이견 / 보류');
      for (const d of parsed.dissent) lines.push(`- ${d}`);
      lines.push('');
    }

    if (parsed.actionItems.length > 0) {
      lines.push('## 액션 아이템');
      for (const a of parsed.actionItems) lines.push(`- ${a}`);
      lines.push('');
    }

    if (parsed.pings.length > 0) {
      lines.push('## 핸드오프 (ping)');
      const tallies = new Map<string, number>();
      for (const p of parsed.pings) {
        const key = `${p.from} → ${p.to}`;
        tallies.set(key, (tallies.get(key) ?? 0) + 1);
      }
      for (const [k, n] of tallies) lines.push(`- ${k}  (${n}회)`);
      lines.push('');
    }

    if (parsed.turns.length > 0) {
      lines.push('## 발언 요약');
      // Count words per speaker for a quick balance view
      const tallies = new Map<string, { turns: number; chars: number }>();
      for (const t of parsed.turns) {
        const s = (t.speaker ?? '(unknown)').toLowerCase();
        const entry = tallies.get(s) ?? { turns: 0, chars: 0 };
        entry.turns++;
        entry.chars += t.text.length;
        tallies.set(s, entry);
      }
      for (const [speaker, v] of tallies) {
        lines.push(`- **${speaker}** — ${v.turns} turn${v.turns > 1 ? 's' : ''} · ${v.chars} 자`);
      }
    }

    await auditAppend({
      tool: 'afterglow_council_summary',
      summary: `summary of ${filename}`,
      meta: {
        file: filename,
        participants: parsed.participants,
        turns: parsed.turns.length,
        consensusReached: parsed.consensusReached,
      },
    });

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}

/* exported for tests */
export { parseTranscript };
