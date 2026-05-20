# Afterglow — 퇴사자 에이전트 MCP

> 퇴사한 동료를 폴더 안에 두고, Claude Code 안에서 다시 만나는 페르소나 에이전트 MCP.

이 저장소는 Claude Design (claude.ai/design)에서 만든 PoC 디자인을 모던 React 스택으로 옮긴 **인터랙티브 제안서**입니다. 실제 MCP 서버 코드가 아니라, 18개의 CLI 화면 모킹을 통해 사용자가 한 번에 전체 시스템 흐름을 둘러볼 수 있게 합니다.

## 핵심 컨셉

- **학습이 아니라 페르소나 + RAG.** Claude의 컨텍스트에 톤과 자료를 주입 — 모델 학습 없이 Claude Code와 100% 호환.
- **한 폴더에 한 사람.** `~/.claude/afterglow/agents/<slug>/` 안에 persona.json · system-prompt.md · knowledge/ · embeddings/ · consent.md · history.log.
- **모든 작업은 CLI.** 웹 UI 없이 슬래시 명령으로 끝납니다 (`/afterglow init`, `/afterglow create`, `/afterglow ask`, …).
- **서로 알고, 서로 답합니다.** 명시적 회의(council)와 답변 도중 자발적 협의(peer-ask) 모두 회의록으로 저장.
- **가짜인 척하지 않습니다.** 모든 답변에 ✦ 마크 + 신뢰도 + 출처가 함께.

## 기술 스택

| 영역 | 선택 |
| --- | --- |
| 빌드 | Vite 8 |
| 런타임 | React 19 (Client SPA) |
| 언어 | TypeScript ~6, `verbatimModuleSyntax` + `erasableSyntaxOnly` |
| 라우팅 | hash 기반 (외부 의존 0) |
| 스타일 | 디자이너 작성 CSS (`src/styles/design.css`, ~87KB) + CSS 변수로 액센트 · 배경 토글 |
| 폰트 | Pretendard · Newsreader · Noto Serif KR · JetBrains Mono (CDN) |
| 린트 | ESLint flat config (`react-hooks` + `react-refresh` + `typescript-eslint`) |
| 유틸 | `clsx` |

> Tailwind는 일부러 도입하지 않았습니다. 디자이너가 작성한 87KB의 토큰 기반 CSS가 이미 잘 동작하고, 다시 Tailwind로 치환하는 비용 대비 이득이 없다고 판단했습니다.

## 빠른 시작

```bash
# 의존성 설치
npm install

# 개발 서버 (http://localhost:5173)
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 결과 미리보기
npm run preview

# 타입 체크
npm run typecheck

# 린트
npm run lint
```

## 폴더 구조

```text
src/
├─ App.tsx                # SCREENS 라우팅 + 사이드바 + 톱바 + Tweaks 패널
├─ main.tsx               # ReactDOM.createRoot 진입점
├─ components/
│  ├─ Icon.tsx            # 인라인 SVG 아이콘 24종
│  ├─ ui.tsx              # BrandMark / Avatar / Badge / Steps / Spark / UploadSlot
│  ├─ Terminal.tsx        # 터미널 셸 + CLI 프리미티브 (T.Prompt, T.Block, T.Frame …)
│  └─ TweaksPanel.tsx     # 우하단 떠 있는 디자인 토글 패널
├─ lib/
│  └─ tweaks.ts           # localStorage 기반 useTweaks 훅
├─ screens/               # 18개 화면 — 1 파일에 1~4 컴포넌트
│  ├─ Overview.tsx        # 둘러보기 (intro + 폴더 구조 + 호출 방식)
│  ├─ CliInit.tsx         # ScreenInit  / ScreenCreate
│  ├─ CliView.tsx         # ScreenList  / ScreenInspect
│  ├─ CliChat.tsx         # ScreenAsk   / ScreenCouncil / ScreenLog
│  ├─ CliEdit.tsx         # ScreenEdit
│  ├─ CliFeatures.tsx     # ScreenSelfReview / ScreenVersion / ScreenLogViewer / ScreenAccess
│  ├─ CliCompliance.tsx   # ScreenAudit / ScreenManualFix / ScreenAutoFix
│  ├─ Roadmap.tsx
│  └─ Ethics.tsx
└─ styles/
   └─ design.css          # 디자이너 작성 CSS (디자인 토큰 · 레이아웃 · 터미널 셸)

docs/
└─ design-source/         # claude.ai/design 핸드오프 원본 (JSX) — 참조용
```

## 18개 화면 매핑

| 그룹 | 화면 | 슬래시 명령 |
| --- | --- | --- |
| 한눈에 | 둘러보기 | (intro) |
| 셋업 · 인계 | 처음 설치 | `/afterglow init` |
| 셋업 · 인계 | 에이전트 만들기 | `/afterglow create` |
| 셋업 · 인계 | 본인 인계 모드 | `/afterglow handoff` |
| 매일 쓰는 명령 | 목록 | `/afterglow list` |
| 매일 쓰는 명령 | 질문하기 | `/afterglow ask` |
| 매일 쓰는 명령 | 상세 보기 | `/afterglow inspect` |
| 매일 쓰는 명령 | 에이전트 수정 | `/afterglow edit` |
| 매일 쓰는 명령 | 대화 로그 뷰어 | `/afterglow history` |
| 에이전트끼리 | 합동 회의 | `/afterglow council` |
| 에이전트끼리 | 회의록 다시 보기 | `/afterglow log` |
| 운영 / 관리 | 버전 관리 | `/afterglow version` |
| 운영 / 관리 | 권한 관리 | `/afterglow access` |
| 운영 / 관리 | 감사 로그 | `/afterglow audit` |
| 운영 / 관리 | 신뢰도 수동 보정 | `/afterglow correct` |
| 운영 / 관리 | 신뢰도 자동 보정 | `/afterglow recalibrate` |
| 참고 | 로드맵 | — |
| 참고 | 윤리 가이드 | — |

## 라우팅

`location.hash`를 단일 source-of-truth로 사용합니다.

- `/#init`, `/#ask`, `/#audit` 처럼 화면 ID로 직접 진입 가능
- 사이드바 클릭 시 hash 갱신
- `hashchange` 이벤트로 양방향 동기화

별도의 라우터 라이브러리를 두지 않습니다 — 화면이 18개로 작고, 데이터 페칭이 없는 정적 SPA이기 때문입니다.

## 톤 / 디자인 토글

우하단 톱니 버튼을 누르면 Tweaks 패널이 열리고, **액센트** 색과 **배경(종이)** 색을 4가지 프리셋 중에서 고를 수 있습니다. 선택값은 `localStorage["afterglow.tweaks"]`에 저장되며 CSS 변수 `--brick` · `--paper`에 즉시 반영됩니다.

## 디자인 원본

`docs/design-source/`에는 claude.ai/design에서 export 한 원본 HTML/CSS/JSX 핸드오프 번들이 그대로 보존되어 있습니다. 추가 화면을 만들거나 디자인 의도를 다시 확인할 때 참고할 수 있습니다.

## 라이선스

MIT — `LICENSE` 파일 참고.
