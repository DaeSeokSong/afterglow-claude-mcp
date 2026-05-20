import { useState } from 'react';
import { Terminal, T } from '../components/Terminal';

/* ============================================================
   ScreenAsk — single agent ask
   ============================================================ */
export function ScreenAsk() {
  return (
    <div className="cli-page">
      <div className="cli-page-h">
        <div className="eyebrow">질문하기 · claude /afterglow ask</div>
        <h2>한 사람에게 묻습니다 — 모르면 옆자리에 직접 물어보고요.</h2>
        <p>
          답변과 함께 참고 자료·신뢰도·핸드오프 추천을 보여줘요. <b>답하다가 확실하지 않으면 다른 에이전트에게
          자동으로 묻습니다 (peer-ask)</b> — 마치 옆자리 동료에게 슬쩍 물어보듯이. 그 대화는 회의록처럼 저장돼요.
        </p>
      </div>

      <Terminal title="claude-code  ·  afterglow ask">
        <T.Prompt>
          claude /afterglow ask <span style={{ color: '#FFE3C0' }}>jiyoon</span>{' '}
          <span style={{ color: '#C7E5B1' }}>"온보딩 step 3 이탈, 어떻게 줄였어요?"</span>
        </T.Prompt>
        <T.Dim>  → ~/.claude/afterglow/agents/jiyoon/  ·  RAG 검색 4 chunks  ·  confidence 91%</T.Dim>
        <T.Br />

        <T.Block who="jiyoon" color={0}>
          step 3 이탈은 사실 step 3 잘못이 아니었어요. step 2에서 '왜 이걸 해야 하는지' 설명이 너무 길었던 거죠.
          {'\n\n'}
          우리가 그걸 절반으로 줄이고 step 3는 그대로 뒀는데 이탈이 22% → 9%로 떨어졌어요. 뒷 단계에서 사람이
          떠난다고 그 단계만 보면 안 돼요. 보통 답은 앞에 있어요.
        </T.Block>

        <T.Dim>
          {'  '}↗ <span style={{ color: '#FFE3C0' }}>Confluence · DESIGN/onboarding-v2-postmortem</span>
        </T.Dim>
        <T.Dim>
          {'  '}↗ <span style={{ color: '#FFE3C0' }}>./materials/interview-2025-11-10.pdf · p. 14</span>
        </T.Dim>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.5)" style={{ display: 'flex', gap: 14, fontSize: 11.5 }}>
          <span>
            <span
              style={{
                background: 'rgba(245,240,228,0.08)',
                border: '1px solid rgba(245,240,228,0.18)',
                borderRadius: 3,
                padding: '0 5px',
                color: 'rgba(245,240,228,0.8)',
              }}
            >
              y
            </span>{' '}
            👍 좋은 답변
          </span>
          <span>
            <span
              style={{
                background: 'rgba(245,240,228,0.08)',
                border: '1px solid rgba(245,240,228,0.18)',
                borderRadius: 3,
                padding: '0 5px',
                color: 'rgba(245,240,228,0.8)',
              }}
            >
              n
            </span>{' '}
            👎 가르치기
          </span>
          <span>
            <span
              style={{
                background: 'rgba(245,240,228,0.08)',
                border: '1px solid rgba(245,240,228,0.18)',
                borderRadius: 3,
                padding: '0 5px',
                color: 'rgba(245,240,228,0.8)',
              }}
            >
              i
            </span>{' '}
            출처 자세히
          </span>
          <span>
            <span
              style={{
                background: 'rgba(245,240,228,0.08)',
                border: '1px solid rgba(245,240,228,0.18)',
                borderRadius: 3,
                padding: '0 5px',
                color: 'rgba(245,240,228,0.8)',
              }}
            >
              c
            </span>{' '}
            council 호출
          </span>
        </T.Line>

        <T.Hr />

        <T.Line
          color="rgba(245,240,228,0.55)"
          style={{ marginBottom: 6, fontSize: 11, letterSpacing: '0.04em' }}
        >
          ── 다른 시나리오 · 답하다가 자발적으로 다른 에이전트에게 물어보기 (peer-ask) ──
        </T.Line>
        <T.Prompt>
          claude /afterglow ask <span style={{ color: '#FFE3C0' }}>jiyoon</span>{' '}
          <span style={{ color: '#C7E5B1' }}>"결제 폼 디자인 바꾸면 백엔드 영향 어느 정도예요?"</span>
        </T.Prompt>
        <T.Dim>  → confidence 64%  ·  peer-ask threshold 70%  ·  자발적 협의 트리거</T.Dim>
        <T.Br />

        <T.Block who="jiyoon" color={0}>
          UX 측면은 카드 입력 순서만 바꾸는 거라 어렵지 않아요. 다만 백엔드 영향은 제가 확신할 수 없어서 잠시
          박재훈에게 물어볼게요.
        </T.Block>

        <T.Line color="#FFE3C0" style={{ fontSize: 11.5 }}>
          {'  '}↗ <T.Agent slug="jiyoon" color={0} /> peer-asks <T.Agent slug="jaehoon" color={1} />{' '}
          <span style={{ color: 'rgba(245,240,228,0.55)' }}>(inline, no user wait)</span>
        </T.Line>

        <T.Block who="jaehoon" color={1}>
          폼 순서만 바꾸는 거면 백엔드 영향 없어요. 단, 3D Secure 단계 시점이 바뀌면 PG사 분석에 영향이 있어요. 그건
          그대로 두세요.
        </T.Block>

        <T.Line color="#FFE3C0" style={{ fontSize: 11.5 }}>
          {'  '}↘ <T.Agent slug="jiyoon" color={0} /> resumes (with <T.Agent slug="jaehoon" color={1} />
          's input)
        </T.Line>

        <T.Block who="jiyoon" color={0}>
          확인했어요 — 폼 순서 변경은 백엔드 영향 없습니다. 단, 3DS 단계 위치는 그대로 두세요. (재훈 확인 완료)
        </T.Block>

        <T.Dim>
          {'  '}↗{' '}
          <span style={{ color: '#FFE3C0' }}>
            peer-ask 대화록 → ~/.claude/afterglow/councils/2025-11-21-1638-jiyoon-peer-jaehoon.md
          </span>
        </T.Dim>
        <T.Dim>
          {'  '}↗{' '}
          <span style={{ color: '#FFE3C0' }}>
            claude /afterglow log 2025-11-21-1638-jiyoon-peer-jaehoon
          </span>{' '}
          로 전체 대화 확인
        </T.Dim>
      </Terminal>

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">peer-ask는 어떻게 발생해요?</div>
          <p style={{ lineHeight: 1.65 }}>
            답변의 일부 청크가 다른 에이전트 영역과 더 맞다고 판단되면 자동 호출. 사용자는 기다리지 않고, jiyoon이
            그 답을 흡수해 자기 톤으로 다시 정리해줍니다.
          </p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">기준 조정</div>
          <p>peer-ask 임계값을 낮추면 더 자주 묻습니다.</p>
          <span className="h-cmd">edit jiyoon --peer-threshold 0.6</span>
          <span className="h-cmd" style={{ marginTop: 6 }}>
            edit jiyoon --peer-ask off
          </span>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">대화는 모두 기록</div>
          <p>명시적 회의(council)이든 자발적 peer-ask든 councils/ 폴더에 같은 형식으로 누적돼요.</p>
          <span className="h-cmd">log --by jiyoon</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ScreenCouncil — multi-agent meeting + full conversation log
   ============================================================ */
export function ScreenCouncil() {
  return (
    <div className="cli-page">
      <div className="cli-page-h">
        <div className="eyebrow">합동 회의 · claude /afterglow council</div>
        <h2>여러 명의 퇴사자에게 한 번에, 그리고 그들끼리 토론하게.</h2>
        <p>
          에이전트들은 서로의 존재와 전문 영역을 알고 있어요. council 명령을 쓰면 자기들끼리 의견을 주고받으며
          합의를 만들어갑니다. 모든 발언은 회의록으로 저장돼 다시 볼 수 있어요.
        </p>
      </div>

      <Terminal title="claude-code  ·  afterglow council">
        <T.Prompt>
          claude /afterglow council{' '}
          <span style={{ color: '#FFE3C0' }}>jiyoon jaehoon hiroshi</span>{' '}
          <span style={{ color: '#C7E5B1' }}>"결제 폼 v3, 어떻게 갈까요?"</span>
        </T.Prompt>
        <T.Br />

        <T.Heading icon="⚯">council 시작  ·  3 agents joining</T.Heading>
        <T.Ok>
          <T.Agent slug="jiyoon" color={0} />
          {'  joined  ·  expertise: 디자인 시스템, 온보딩'}
        </T.Ok>
        <T.Ok>
          <T.Agent slug="jaehoon" color={1} />
          {'  joined  ·  expertise: 결제, DB'}
        </T.Ok>
        <T.Ok>
          <T.Agent slug="hiroshi" color={4} />
          {'  joined  ·  expertise: 초기 결정, 기술 부채'}
        </T.Ok>
        <T.Dim>  moderator: claude (orchestrator)</T.Dim>
        <T.Br />

        <div className="council-turn">─── turn 1 / 토픽 정의 ───</div>
        <T.Block who="jiyoon" color={0}>
          사용자 입력 단계가 가장 큰 문제예요. v2에서 3단계로 줄였더니 완주율이 11pp 올랐어요. v3는 한 화면에 모든
          걸 보여주는 걸 권장합니다.
        </T.Block>

        <T.Line color="#FFE3C0" style={{ fontSize: 11.5 }}>
          {'   '}↗ <T.Agent slug="jaehoon" color={1} /> reacts:
        </T.Line>
        <T.Block who="jaehoon" color={1}>
          화면을 한 번에 보이려면 3D Secure 단계를 다시 봐야 해요. 이건 hiroshi가 2022년에 정한 원칙이었던 거
          아닌가요?
        </T.Block>

        <T.Line color="#FFE3C0" style={{ fontSize: 11.5 }}>
          {'   '}↗ <T.Agent slug="jaehoon" color={1} /> pinged <T.Agent slug="hiroshi" color={4} />
        </T.Line>
        <T.Block who="hiroshi" color={4}>
          맞아요. 2022년에 PG사 토스/카카오와 합의한 건 별도 화면이었어요. 그건 그쪽 분석 파이프라인 때문이라
          우리가 못 바꿔요. 분리 유지해주세요.
        </T.Block>

        <div className="council-turn">─── turn 2 / 절충안 모색 ───</div>
        <T.Block who="jiyoon" color={0}>
          그러면 두 화면 구조 유지: 일반 결제는 한 화면에 폼 단계 최소화, 3DS는 별도 화면에서 단순하게. 두 경로 모두
          단계를 줄이는 데 집중합니다.
        </T.Block>

        <T.Line color="#FFE3C0" style={{ fontSize: 11.5 }}>
          {'   '}↗ all agree
        </T.Line>

        <T.Br />
        <T.Heading icon="⊙">합의 감지됨 — 회의 종료</T.Heading>
        <T.Br />

        <T.Frame title="회의록 / council-report">
          <T.Line color="rgba(245,240,228,0.92)">
            {'   '}참가자        <T.Agent slug="jiyoon" color={0} /> · <T.Agent slug="jaehoon" color={1} /> ·{' '}
            <T.Agent slug="hiroshi" color={4} />
          </T.Line>
          <T.Line color="rgba(245,240,228,0.7)">{'   '}주제          결제 폼 v3, 어떻게 갈까요?</T.Line>
          <T.Line color="rgba(245,240,228,0.7)">{'   '}시작 / 종료   14:32:18  ·  14:33:42  (1분 24초)</T.Line>
          <T.Line color="rgba(245,240,228,0.7)">{'   '}메시지        6  ·  핸드오프 1  ·  ping 1</T.Line>

          <T.Section title="결론 (합의)">
            <T.Line color="rgba(245,240,228,0.92)">{'   '}▸ 일반 결제: 한 화면 유지, 폼 단계 최소화</T.Line>
            <T.Line color="rgba(245,240,228,0.92)">{'   '}▸ 3DS: 별도 화면 유지 (hiroshi 2022 결정 존중)</T.Line>
            <T.Line color="rgba(245,240,228,0.92)">{'   '}▸ 백엔드 변경 없음 (jaehoon 확인)</T.Line>
          </T.Section>

          <T.Section title="이견 / 보류">
            <T.Line color="rgba(245,240,228,0.7)">{'   '}- 없음 — 만장일치</T.Line>
          </T.Section>

          <T.Section title="누가 무엇을 말했는지 (요약)">
            <T.Line color="rgba(245,240,228,0.85)">
              {'   '}
              <T.Agent slug="jiyoon" color={0} />  단계 축소가 핵심 → 절충안 제시
            </T.Line>
            <T.Line color="rgba(245,240,228,0.85)">
              {'   '}
              <T.Agent slug="jaehoon" color={1} /> 기술 영향 점검 → hiroshi 의견 요청
            </T.Line>
            <T.Line color="rgba(245,240,228,0.85)">
              {'   '}
              <T.Agent slug="hiroshi" color={4} /> 과거 PG사 합의 근거 제공
            </T.Line>
          </T.Section>
        </T.Frame>

        <T.Br />
        <T.Ok>
          회의록 저장됨 →{' '}
          <span style={{ color: '#FFE3C0' }}>~/.claude/afterglow/councils/2025-11-21-1432-payment-v3.md</span>
        </T.Ok>
        <T.Br />
        <T.Heading icon="▸">대화록 다시 보기</T.Heading>
        <T.Line color="rgba(245,240,228,0.85)">
          {'  '}
          <T.Cmd>claude /afterglow log council-2025-11-21-1432</T.Cmd>{'           — 요약'}
        </T.Line>
        <T.Line color="rgba(245,240,228,0.85)">
          {'  '}
          <T.Cmd>claude /afterglow log council-2025-11-21-1432 --full</T.Cmd>{'    — 전체 발언'}
        </T.Line>
        <T.Line color="rgba(245,240,228,0.85)">
          {'  '}
          <T.Cmd>claude /afterglow log council-2025-11-21-1432 --export md</T.Cmd>{' — Markdown으로 export'}
        </T.Line>
      </Terminal>

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">에이전트들이 어떻게 서로를 알아요?</div>
          <p>
            각 폴더의{' '}
            <code
              style={{
                background: 'var(--paper-2)',
                padding: '0 4px',
                borderRadius: 3,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
              }}
            >
              persona.json
            </code>
            에 자신있는 영역이 명시되어 있고, registry.json에 전체 목록이 있어요. council 시작 시 모더레이터가 모두
            같은 컨텍스트로 묶어줍니다.
          </p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">최대 인원 / 시간</div>
          <p>
            기본 6명까지 동시 참가. 합의 감지 알고리즘이 종료를 결정하지만{' '}
            <code
              style={{
                background: 'var(--paper-2)',
                padding: '0 4px',
                borderRadius: 3,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
              }}
            >
              --max-turns 10
            </code>{' '}
            같이 강제 종료도 가능.
          </p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">회의록 보고서</div>
          <p>매 회의마다 자동 생성, councils/ 폴더에 누적. 누가 무엇을 말했고 왜 그렇게 결론났는지 추적 가능해요.</p>
          <span className="h-cmd">log --full</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ScreenLog — re-read past council / peer-ask
   ============================================================ */

function LogCouncil() {
  return (
    <Terminal title="claude-code  ·  log --full">
      <T.Prompt>
        claude /afterglow log <span style={{ color: '#FFE3C0' }}>council-2025-11-21-1432</span> --full
      </T.Prompt>
      <T.Dim>  ~/.claude/afterglow/councils/2025-11-21-1432-payment-v3.md</T.Dim>
      <T.Br />

      <T.Frame title="payment-v3 council — full transcript">
        <T.Line color="rgba(245,240,228,0.55)">{'   '}유형          명시적 회의 (council 명령)</T.Line>
        <T.Line color="rgba(245,240,228,0.55)">
          {'   '}시각          2025-11-21  14:32:18 – 14:33:42 KST
        </T.Line>
        <T.Line color="rgba(245,240,228,0.55)">
          {'   '}호출자        ykhyun@connecteve  (~/.claude session #1284)
        </T.Line>
        <T.Line color="rgba(245,240,228,0.55)">{'   '}참가          jiyoon · jaehoon · hiroshi</T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [14:32:18] orchestrator
        </T.Line>
        <T.Line color="rgba(245,240,228,0.7)" style={{ paddingLeft: 14, fontStyle: 'italic' }}>
          "결제 폼 v3, 어떻게 갈까요?" — user question forwarded
        </T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [14:32:21] jiyoon (confidence 91)
        </T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{ paddingLeft: 14 }}>
          사용자 입력 단계가 가장 큰 문제예요. v2에서 3단계로 줄였더니 완주율이 11pp 올랐어요. v3는 한 화면에 모든
          걸 보여주는 걸 권장합니다.
        </T.Line>
        <T.Line color="rgba(245,240,228,0.4)" style={{ paddingLeft: 14, fontSize: 11 }}>
          refs: Confluence/디자인 시스템 v2 RFC, ./materials/onboarding-postmortem.pdf
        </T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [14:32:43] jaehoon (confidence 88) — reacted to jiyoon
        </T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{ paddingLeft: 14 }}>
          화면을 한 번에 보이려면 3D Secure 단계를 다시 봐야 해요. 이건 hiroshi가 2022년에 정한 원칙이었던 거
          아닌가요?
        </T.Line>
        <T.Line color="#FFE3C0" style={{ paddingLeft: 14, fontSize: 11 }}>
          → pinged hiroshi
        </T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [14:33:02] hiroshi (confidence 96) — responding to ping
        </T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{ paddingLeft: 14 }}>
          맞아요. 2022년에 PG사 토스/카카오와 합의한 건 별도 화면이었어요. 그건 그쪽 분석 파이프라인 때문이라
          우리가 못 바꿔요. 분리 유지해주세요.
        </T.Line>
        <T.Line color="rgba(245,240,228,0.4)" style={{ paddingLeft: 14, fontSize: 11 }}>
          refs: Notion/2022-payment-architecture-rfc.md
        </T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [14:33:28] jiyoon — synthesizing
        </T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{ paddingLeft: 14 }}>
          그러면 두 화면 구조 유지: 일반 결제는 한 화면에 폼 단계 최소화, 3DS는 별도 화면에서 단순하게.
        </T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [14:33:35] jaehoon — agreed
        </T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{ paddingLeft: 14 }}>
          네, 백엔드 변경 없이 가능합니다. 👍
        </T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [14:33:42] orchestrator — consensus detected, council closed
        </T.Line>
      </T.Frame>
    </Terminal>
  );
}

function LogPeer() {
  return (
    <Terminal title="claude-code  ·  log --full">
      <T.Prompt>
        claude /afterglow log{' '}
        <span style={{ color: '#FFE3C0' }}>2025-11-21-1638-jiyoon-peer-jaehoon</span> --full
      </T.Prompt>
      <T.Dim>  ~/.claude/afterglow/councils/2025-11-21-1638-jiyoon-peer-jaehoon.md</T.Dim>
      <T.Br />

      <T.Frame title="peer-ask — jiyoon → jaehoon (auto)">
        <T.Line color="rgba(245,240,228,0.55)">
          {'   '}유형          자발적 협의 (peer-ask · 자동 트리거)
        </T.Line>
        <T.Line color="rgba(245,240,228,0.55)">
          {'   '}시각          2025-11-21  16:38:04 – 16:38:21 KST  (17초)
        </T.Line>
        <T.Line color="rgba(245,240,228,0.55)">
          {'   '}호출자        ykhyun@connecteve  (ask jiyoon "결제 폼 디자인…")
        </T.Line>
        <T.Line color="rgba(245,240,228,0.55)">
          {'   '}트리거 이유   jiyoon 답변 신뢰도 64% &lt; threshold 70%, jaehoon expertise match 0.86
        </T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [16:38:04] user (via ask command)
        </T.Line>
        <T.Line color="rgba(245,240,228,0.7)" style={{ paddingLeft: 14, fontStyle: 'italic' }}>
          "결제 폼 디자인 바꾸면 백엔드 영향 어느 정도예요?"
        </T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [16:38:06] jiyoon — drafting
        </T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{ paddingLeft: 14 }}>
          UX 측면은 카드 입력 순서만 바꾸는 거라 어렵지 않아요. 다만 백엔드 영향은 제가 확신할 수 없어서 잠시
          박재훈에게 물어볼게요.
        </T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [16:38:09] jiyoon → jaehoon (peer-ask, inline)
        </T.Line>
        <T.Line color="rgba(245,240,228,0.7)" style={{ paddingLeft: 14, fontStyle: 'italic' }}>
          "폼 순서만 바꾸면 백엔드 변경 필요한가요? 3DS는 그대로 두는 가정."
        </T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [16:38:14] jaehoon (confidence 94)
        </T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{ paddingLeft: 14 }}>
          폼 순서만 바꾸는 거면 백엔드 영향 없어요. 단, 3D Secure 단계 시점이 바뀌면 PG사 분석에 영향이 있어요. 그건
          그대로 두세요.
        </T.Line>
        <T.Line color="rgba(245,240,228,0.4)" style={{ paddingLeft: 14, fontSize: 11 }}>
          refs: Confluence/2022-payment-arch, Jira/PAY-1284
        </T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [16:38:18] jiyoon — synthesizing with jaehoon's input
        </T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{ paddingLeft: 14 }}>
          확인했어요 — 폼 순서 변경은 백엔드 영향 없습니다. 단, 3DS 단계 위치는 그대로 두세요. (재훈 확인 완료)
        </T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11 }}>
          [16:38:21] orchestrator — peer-ask closed, returned to user
        </T.Line>
        <T.Br />

        <T.Line color="#FFE3C0" style={{ paddingLeft: 6 }}>
          {'   '}최종 답변 신뢰도: 64% → 91% (peer-ask로 보강)
        </T.Line>
      </T.Frame>

      <T.Br />
      <T.Dim>  ↗ user는 jiyoon의 최종 답변만 봤고, 이 대화는 사용자 화면에 노출되지 않았어요.</T.Dim>
      <T.Dim>  ↗ 하지만 모든 발언은 여기 기록되어 누가 누구의 의견을 인용했는지 추적 가능합니다.</T.Dim>
    </Terminal>
  );
}

export function ScreenLog() {
  const [tab, setTab] = useState<'council' | 'peer'>('council');

  return (
    <div className="cli-page">
      <div
        className="cli-page-h"
        style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}
      >
        <div>
          <div className="eyebrow">대화록 다시 보기 · claude /afterglow log</div>
          <h2>모든 대화는 디스크에 남습니다.</h2>
          <p>
            명시적 council 회의든, ask 도중 일어난 자발적 peer-ask든 — 모두 같은 형식으로{' '}
            <code
              style={{
                background: 'var(--paper-2)',
                padding: '0 5px',
                borderRadius: 3,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
              }}
            >
              councils/
            </code>
            에 누적돼요. 누가 무엇을 말했고 왜 그렇게 결론났는지 추적할 수 있어요.
          </p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button
            className={`btn btn-sm ${tab === 'council' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab('council')}
            style={{ padding: '4px 10px', fontSize: 11.5 }}
          >
            명시적 회의
          </button>
          <button
            className={`btn btn-sm ${tab === 'peer' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab('peer')}
            style={{ padding: '4px 10px', fontSize: 11.5 }}
          >
            자발적 peer-ask
          </button>
        </div>
      </div>

      {tab === 'council' ? <LogCouncil /> : <LogPeer />}

      <div className="helper-row" style={{ marginTop: 24 }}>
        <div className="helper-card">
          <div className="h-eyebrow">전체 회의 목록</div>
          <span className="h-cmd">claude /afterglow log --list</span>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">특정 에이전트 발언 모음</div>
          <span className="h-cmd">log --by jiyoon</span>
          <p style={{ marginTop: 6 }}>jiyoon이 참가한 모든 대화 (회의 + peer-ask)</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">Markdown으로 내보내기</div>
          <span className="h-cmd">log &lt;id&gt; --export md</span>
          <p style={{ marginTop: 6 }}>슬랙·메일에 공유할 수 있는 포맷</p>
        </div>
      </div>
    </div>
  );
}
