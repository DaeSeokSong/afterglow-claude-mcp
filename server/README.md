# `@afterglow/mcp-server`

Afterglow PoC 디자인을 실제로 동작시키는 MCP (Model Context Protocol) 서버. Claude Code 위에 5개 슬래시 명령을 띄우고, 한 폴더 단위로 퇴사자 에이전트를 관리합니다.

```
~/.claude/afterglow/
├─ config.yml
├─ registry.json
├─ councils/
└─ agents/<slug>/
   ├─ persona.json
   ├─ system-prompt.md
   ├─ mcp-allowlist.yml   (예약)
   ├─ consent.md
   ├─ history.log
   ├─ knowledge/
   └─ embeddings/
```

## 노출되는 도구 (5개)

| MCP tool name        | 대응 슬래시 명령                   | 역할 |
| --- | --- | --- |
| `afterglow_init`     | `/afterglow init`                | `~/.claude/afterglow/` 부트스트랩. 멱등. |
| `afterglow_create`   | `/afterglow create <slug> …`     | 한 사람의 폴더 + persona.json + system-prompt.md + consent.md 생성. registry.json에 draft 등록. |
| `afterglow_list`     | `/afterglow list`                | 등록된 모든 에이전트를 표 / JSON 출력. `--status`, `--json` 지원. |
| `afterglow_inspect`  | `/afterglow inspect <slug>`      | 한 명의 페르소나 · 톤 · 자료 · MCP 권한을 박스 드로잉으로 출력. |
| `afterglow_ask`      | `/afterglow ask <slug> "..."`    | 페르소나 system prompt + RAG 결과를 묶어 반환. **Claude 가 자기 컨텍스트로 그대로 답합니다 — 별도 모델 호출 없음.** |

## 설치 + 등록

```bash
# 1) 빌드
cd server
npm install
npm run build

# 2) Claude Code 에 MCP 로 등록
claude mcp add afterglow node /절대/경로/Afterglow/server/dist/index.js

# 3) 첫 사용
claude /afterglow init
claude /afterglow create jiyoon --name 이지윤 --role "프로덕트 디자이너"
claude /afterglow list
claude /afterglow inspect jiyoon
```

> 패키지로 배포된 후에는 `claude mcp add afterglow npx @afterglow/mcp-server` 로 한 줄 등록이 가능합니다. 지금은 로컬 절대 경로 등록 권장.

## 동작 원리 — "학습 없이 페르소나 + RAG"

`afterglow_ask` 는 LLM 을 직접 호출하지 않습니다. 대신:

1. `agents/<slug>/system-prompt.md` (페르소나) 를 읽음
2. `agents/<slug>/knowledge/` 에서 사용자 질문과 매칭되는 청크 retrieval (`rag.ts`)
3. 셋을 묶어 **구조화된 텍스트** 로 반환

Claude Code는 이 텍스트를 그대로 자기 컨텍스트에 넣고, 사용자가 이미 쓰는 Claude 세션으로 실제 답변을 생성합니다. → 모델 추론은 한 번, 별도 GPU/임베딩 API 없이도 PoC 가능.

`embeddings/` 와 벡터 검색은 미래 확장 지점입니다 (`rag.ts` 의 `retrieve()` 가 drop-in 교체 위치).

## 환경변수

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `AFTERGLOW_ROOT` | `~/.claude/afterglow` | 모든 데이터의 루트. 테스트 / dev 격리 시 임시 폴더 지정. |

## 테스트

```bash
npm run test           # vitest 단위 + 통합
npm run build && npm run test:stdio   # 실제 stdio MCP 핸드셰이크
npm run test:all       # 전체 (단위 → build → stdio)
```

vitest 12개 + stdio handshake 1개. 모두 격리된 `AFTERGLOW_ROOT` 임시 디렉토리에서 실행.

## 파일 구조

```
server/
├─ src/
│  ├─ index.ts           # MCP 서버 진입점 (McpServer + StdioServerTransport)
│  ├─ storage.ts         # ~/.claude/afterglow/ 파일시스템 어댑터
│  ├─ persona.ts         # zod schema + system-prompt 렌더링
│  ├─ rag.ts             # 키워드 기반 chunk retrieval
│  └─ tools/
│     ├─ init.ts
│     ├─ create.ts
│     ├─ list.ts
│     ├─ inspect.ts
│     ├─ ask.ts
│     └─ types.ts        # ToolReply + safe() 래퍼
├─ test/
│  ├─ storage.test.ts    # vitest (12 tests)
│  └─ stdio.smoke.mjs    # 실제 MCP stdio 핸드셰이크
├─ tsconfig.json
├─ vitest.config.ts
└─ package.json
```

## 다음 확장

- `embeddings/` 에 dense vector 백엔드 연결 (`rag.ts` 의 `retrieve()` 만 교체)
- `afterglow_edit` — persona.json 부분 수정 (현재는 vim 직접 편집 권장)
- `afterglow_council` — 다중 에이전트 회의 + 회의록 저장
- `afterglow_history` — `agents/<slug>/history.log` 조회
- `consent.md` 서명 워크플로우 (active 전환 게이트)
