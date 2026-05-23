#!/usr/bin/env python3
"""Generate docs/afterglow-hands-on.ipynb — a runnable, beginner-friendly
walk-through that drives the real Afterglow MCP server over stdio.

Run:  python3 scripts/gen_notebook.py
Then execute/verify with nbclient (see scripts/run_notebook.py).
"""
import nbformat as nbf
from nbformat.v4 import new_notebook, new_markdown_cell, new_code_cell
import os

nb = new_notebook()
cells = []


def md(text):
    cells.append(new_markdown_cell(text.strip("\n")))


def code(text):
    cells.append(new_code_cell(text.strip("\n")))


# --------------------------------------------------------------------------
md(r"""
# Afterglow MCP — 핸즈온 (Hands-on)

> 퇴사한 동료를 **페르소나 + RAG** 에이전트로 만들어 인수인계를 돕는 MCP 서버.
> 이 노트북은 **MCP 를 처음 써보는 사람도** 복붙으로 전 기능을 따라 할 수 있게 만들었습니다.

이 노트북이 하는 일 (실제로 서버를 띄워서 호출합니다 — 흉내가 아닙니다):

1. 🏗  서버 빌드 + MCP stdio 연결
2. 👤  에이전트 생성 → 서명(active)
3. 💬  `ask` — 페르소나로 질문
4. 🙋  `handoff` — 본인 셀프 검수 + **추가 인터뷰 사전 동의**
5. 🎤  `interview` — 인계자 주도 다중 인터뷰 + **갭 자동 감지** + **음성 첨부** + 이중 서명
6. 🔌  `export → verify → import` — 다른 사용자에게 **핫플러그**로 넘기기 (+ v0.4 앵커 검증)
7. 🖥  `status` · `gc` · `suggest-questions` · `transcribe` · `audit checkpoint` — 운영·정확도 (v0.3/v0.4)

> **사전 준비**: Node ≥ 18 만 있으면 됩니다. Claude Code 설치 없이도 서버를 직접 호출해 결과를 봅니다.
> 실제 사용 시에는 `claude mcp add afterglow npx -y @daeseoksong/afterglow-mcp` 후
> `claude /afterglow <명령>` 으로 같은 도구를 자연어로 호출합니다.
""")

# --------------------------------------------------------------------------
md(r"""
## 1. 셋업 — 서버 빌드 + MCP 연결 헬퍼

아래 셀은 (1) `server/` 를 찾아 필요하면 빌드하고, (2) 격리된 임시 작업 폴더와
데이터 폴더(`AFTERGLOW_ROOT`)를 만들고, (3) MCP 서버를 stdio 로 띄우는 작은
`Mcp` 클라이언트를 정의합니다. 한 번만 실행하세요.
""")

code(r"""
import os, sys, json, time, shutil, tempfile, subprocess, threading, queue

# --- 1) repo 의 server/ 폴더 찾기 (노트북 위치와 무관하게 상위로 탐색) ---
def find_server():
    p = os.path.abspath(os.getcwd())
    for _ in range(8):
        cand = os.path.join(p, "server", "package.json")
        if os.path.exists(cand):
            return os.path.join(p, "server")
        parent = os.path.dirname(p)
        if parent == p:
            break
        p = parent
    raise RuntimeError("server/package.json 을 찾지 못했습니다. 저장소 안에서 실행하세요.")

SERVER = find_server()
ENTRY = os.path.join(SERVER, "dist", "index.js")
if not os.path.exists(ENTRY):
    print("dist/ 가 없어 빌드합니다 (npm run build)…")
    subprocess.run(["npm", "run", "build"], cwd=SERVER, check=True)
print("server :", SERVER)
print("entry  :", ENTRY, "(exists:", os.path.exists(ENTRY), ")")

# --- 2) 격리된 작업/데이터 폴더 ---
WORK = tempfile.mkdtemp(prefix="afterglow-nb-work-")
ROOT_A = tempfile.mkdtemp(prefix="afterglow-nb-rootA-")   # 보내는 사람 데이터
ROOT_B = tempfile.mkdtemp(prefix="afterglow-nb-rootB-")   # 받는 사람 데이터
os.chdir(WORK)   # export 결과/첨부 소스가 이 폴더 기준으로 해석됩니다
print("work   :", WORK)

# --- 3) 최소 MCP stdio 클라이언트 ---
class Mcp:
    def __init__(self, root, name):
        self.name = name
        env = dict(os.environ, AFTERGLOW_ROOT=root)
        self.p = subprocess.Popen(
            ["node", ENTRY], cwd=WORK, env=env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, bufsize=1,
        )
        self._id = 0
        self._q = queue.Queue()
        threading.Thread(target=self._reader, daemon=True).start()
        self._rpc("initialize", {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "afterglow-notebook", "version": "0.0.1"},
        })
        self._notify("notifications/initialized")

    def _reader(self):
        for line in self.p.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                self._q.put(json.loads(line))
            except Exception:
                pass

    def _send(self, obj):
        self.p.stdin.write(json.dumps(obj) + "\n")
        self.p.stdin.flush()

    def _notify(self, method, params=None):
        self._send({"jsonrpc": "2.0", "method": method, "params": params or {}})

    def _rpc(self, method, params=None):
        self._id += 1
        mid = self._id
        self._send({"jsonrpc": "2.0", "id": mid, "method": method, "params": params or {}})
        deadline = time.time() + 20
        while time.time() < deadline:
            try:
                msg = self._q.get(timeout=20)
            except queue.Empty:
                break
            if msg.get("id") == mid:
                return msg
        raise TimeoutError(f"{method} 응답 없음")

    def tools(self):
        r = self._rpc("tools/list", {})
        return sorted(t["name"] for t in r["result"]["tools"])

    def call(self, _tool, **args):
        # Map Python-reserved kwarg names (e.g. from_) to the real MCP key (from).
        args = {k.rstrip("_"): v for k, v in args.items()}
        r = self._rpc("tools/call", {"name": _tool, "arguments": args})
        res = r.get("result", {})
        text = (res.get("content") or [{}])[0].get("text", "")
        return text, bool(res.get("isError"))

    def show(self, _tool, **args):
        text, err = self.call(_tool, **args)
        print(("⚠ ERROR " if err else "") + f"[{self.name}] {_tool}")
        print(text)
        print("─" * 70)
        return text

    def close(self):
        try:
            self.p.kill()
        except Exception:
            pass

A = Mcp(ROOT_A, "A·이지윤")
print("MCP 연결 OK · 도구", len(A.tools()), "개:")
print(", ".join(A.tools()))
""")

# --------------------------------------------------------------------------
md(r"""
## 2. 에이전트 생성 → 서명 (active)

`init` 으로 데이터 폴더를 부트스트랩하고, 퇴사자 한 명을 `create` 합니다.
생성 직후엔 `draft` 상태라 `ask` 가 막혀 있습니다 — 동의서에 `sign` 하면 `active` 가 됩니다.
""")

code(r"""
A.show("afterglow_init")
A.show("afterglow_create", slug="jiyoon", name="이지윤", role="프로덕트 디자이너",
       tenure="2019.03–2025.11", expertise=["디자인"],
       bio="온보딩과 결제 플로우를 오래 담당했어요.")
# 지식 자료 한 줄 심기 (RAG 가 검색할 거리)
import os
kdir = os.path.join(ROOT_A, "agents", "jiyoon", "knowledge")
os.makedirs(kdir, exist_ok=True)
open(os.path.join(kdir, "note.md"), "w").write(
    "온보딩 step 2 설명을 절반으로 줄였더니 이탈이 22%에서 9%로 떨어졌어요.")
A.show("afterglow_inspect", slug="jiyoon")
""")

# --------------------------------------------------------------------------
md(r"""
## 3. `ask` — 페르소나로 질문하기

`ask` 는 **LLM 을 호출하지 않습니다.** 페르소나 시스템 프롬프트 + RAG 검색 결과를
구조화해 반환하고, 실제 답변은 Claude Code 가 자기 세션에서 만듭니다(추가 비용 0).
여기서는 그 "컨텍스트 번들" 을 그대로 봅니다.
""")

code(r"""
# 아직 미서명(draft) → 막힘
txt, err = A.call("afterglow_ask", slug="jiyoon", question="온보딩 이탈 어떻게 줄였어요?")
print("서명 전 ask →", "막힘 ✓" if err else "열림(예상과 다름)")

# 서명 → active
A.show("afterglow_sign", slug="jiyoon", signer="이지윤", note="핸즈온")
A.show("afterglow_ask", slug="jiyoon", question="온보딩 step 3 이탈, 어떻게 줄였어요?")
""")

# --------------------------------------------------------------------------
md(r"""
## 4. `handoff` — 본인 셀프 검수 + 추가 인터뷰 **사전 동의**

`handoff` 는 퇴사자 **본인**이 자기 에이전트를 1회 검수/서명하는 흐름입니다.
여기서 핵심은 `finalize` 시 **추가 인터뷰를 미리 허용**해 두는 것 — 그래야 나중에
인계자가 이어서 인터뷰(특히 본인 부재 시 주석)를 할 수 있습니다.

> 이미 `sign` 으로 active 가 됐으니, 여기서는 사전 동의(`followup.json`)를 남기는
> 용도로 새 에이전트에 handoff 를 시연합니다.
""")

code(r"""
A.show("afterglow_create", slug="jaehoon", name="박재훈", role="백엔드 엔지니어", expertise=["개발"])
A.show("afterglow_handoff", slug="jaehoon", action="start", limit=2)
A.show("afterglow_handoff", slug="jaehoon", action="finalize", signer="박재훈",
       signPartial=True, allowFollowupInterview=True, allowProxyAnnotation=True,
       followupScope="결제·인프라 한정, 인사평가 거부")
""")

# --------------------------------------------------------------------------
md(r"""
## 5. `interview` — 인계자 주도 다중 인터뷰

`handoff`(본인 1회)와 달리 `interview` 는 **인계자(인터뷰어)가 퇴사자(인터뷰이)를
여러 회차** 인터뷰합니다. 흐름: `start → add-question → answer → gap-check →
attach → finalize(이중 서명)`.

- **gap-check**: 답변에서 빠진 부분을 4신호로 감지해 *"이게 빠진 것 같은데 맞나요?"*
  후속 질문을 (Claude 가) 생성하도록 컨텍스트를 묶어줍니다.
- **attach**: 음성/영상 원본은 보존하고 전사본만 RAG 인덱싱합니다.
- **finalize**: 인터뷰어 + 인터뷰이 **둘 다** 서명해야 `finalized` → `persona.bio` 흡수.
""")

code(r"""
import re, os

start = A.show("afterglow_interview", slug="jiyoon", action="start",
               title="결제 fallback 갭", interviewer="김후임", interviewee="이지윤")
sid = re.search(r"#(\d{3}[^\s\"]*)", start).group(1)
print("session id =", sid)

addtxt = A.show("afterglow_interview", slug="jiyoon", action="add-question",
                session=sid, question="5초 timeout 후 정책은 무엇이었나요?")
qid = re.search(r"\[(q-[0-9a-f-]+)\]", addtxt).group(1)

A.show("afterglow_interview", slug="jiyoon", action="answer", session=sid, id=qid,
       answer="5초 안에 응답 없으면 다음 PG 로 자동 전환했어요.", source="voice")

# 갭 자동 감지 (컨텍스트 번들 — Claude 가 후속 질문 생성)
A.show("afterglow_interview", slug="jiyoon", action="gap-check", session=sid)
""")

code(r"""
# 음성 첨부 (원본 + 전사본). 소스 파일은 작업 폴더 기준 경로.
open(os.path.join(WORK, "clip.mp3"), "wb").write(b"FAKE-AUDIO-BYTES")
open(os.path.join(WORK, "clip.txt"), "w").write(
    "결제 fallback 은 토스 → 카카오 → 네이버 순서로 우선순위를 뒀습니다.")
A.show("afterglow_interview", slug="jiyoon", action="attach", session=sid,
       file="clip.mp3", transcript="clip.txt", speakers=["이지윤", "김후임"],
       consentScope="내부 인계용")

# 이중 서명 → finalized
A.show("afterglow_interview", slug="jiyoon", action="finalize", session=sid,
       signRole="interviewer", signer="김후임")
A.show("afterglow_interview", slug="jiyoon", action="finalize", session=sid,
       signRole="interviewee", signer="이지윤")
""")

code(r"""
# 인터뷰 답변이 persona 에 흡수됐는지 + 전사본이 RAG 로 검색되는지 확인
A.show("afterglow_inspect", slug="jiyoon")
A.show("afterglow_ask", slug="jiyoon", question="결제 fallback 우선순위가 어떻게 됐죠?")
""")

# --------------------------------------------------------------------------
md(r"""
## 6. 핫플러그 — `export → verify → import`

이제 만든 에이전트를 **다른 사용자(받는 사람)에게 넘깁니다.** 받는 사람은 별도
데이터 폴더(`ROOT_B`)를 쓰는 새 서버로 시뮬레이션합니다.

1. **A(보내는 사람)** 가 `export --all` 로 번들 생성 → 폴더 압축/복사해 전달
2. **B(받는 사람)** 가 `verify` 로 사전 점검 → `import` 로 가져오기
3. import 된 에이전트로 `ask` 하면 답변에 **출처(provenance) 배지** 가 붙습니다
""")

code(r"""
import re
exp = A.show("afterglow_export", all=True, exportedBy="이지윤")
bundle = re.search(r"위치:\s*(\S+)", exp).group(1)
anchor = re.search(r"번들 앵커 해시:\s*(\S+)", exp).group(1)   # v0.4: 위변조 탐지용 앵커
print("bundle =", bundle, "\nanchor =", anchor)

# 받는 사람 서버 (별도 데이터 폴더)
B = Mcp(ROOT_B, "B·김후임")
B.show("afterglow_init")
B.show("afterglow_verify", input=bundle)
# --expectAnchor 로 매니페스트 위변조까지 검증하며 가져오기 (v0.4)
B.show("afterglow_import", input=bundle, importedBy="김후임", from_="이지윤",
       trustSigner="이지윤", expectAnchor=anchor)
""")

code(r"""
# 받는 사람 쪽에서 목록 확인 + import 된 에이전트에 질문 (provenance 배지 확인)
B.show("afterglow_list", json=True)
B.show("afterglow_ask", slug="jiyoon", question="온보딩 이탈을 어떻게 줄였나요?")
""")

# --------------------------------------------------------------------------
md(r"""
> 💡 위 셀에서 `from_="이지윤"` 처럼 끝에 `_` 를 붙인 건 `from` 이 Python 예약어이기
> 때문입니다 — 헬퍼가 자동으로 `_` 를 떼어 MCP 키 `from` 으로 보냅니다. 실제 Claude
> Code 에서는 `--from "이지윤"` 으로 자연스럽게 씁니다.

## 7. 운영·정확도 도구 (v0.3 / v0.4)

추가로 운영을 돕는 도구들입니다 (모두 보내는 사람 A 의 스토어에서 시연):

- 🖥 `status` — 전체 에이전트 상태·인터뷰·검토대기·import 출처를 한 화면
- 🧹 `gc` — 오래된 스냅샷·미디어·보관함 정리 (기본 dry-run)
- 💡 `interview suggest-questions` — 회차 시작 전 빠진 영역 기반 질문 제안
- 📝 `interview transcribe --text` — 다듬은 전사본 저장 (RAG 인덱싱)
- 🔐 `audit --checkpoint/--fast` — 대용량 감사 로그 증분 검증

> RAG 랭킹은 v0.4 에서 **BM25** 로 업그레이드됐고(0원·오프라인), `AFTERGLOW_RAG_BACKEND=dense`
> + 임베딩 엔드포인트를 주면 **dense-vector** 검색으로 전환됩니다(실패 시 자동 렉시컬 fallback).
""")

code(r"""
# 전체 대시보드
A.show("afterglow_status")

# 정리 미리보기(dry-run — 실제 삭제 안 함)
A.show("afterglow_gc", action="list")
A.show("afterglow_gc", action="prune-versions", slug="jiyoon", keep=2)
""")

code(r"""
# 다음 인터뷰 전, 빠진 영역 기반 질문 제안
A.show("afterglow_interview", action="suggest-questions", slug="jiyoon")

# 첨부 전사본을 다듬어 저장 (status=polished → RAG 인덱싱)
A.show("afterglow_interview", action="transcribe", slug="jiyoon", session=sid,
       file="clip.mp3", text="결제 fallback 은 토스 → 카카오 → 네이버 순. 5초 timeout 후 다음 PG.")

# 감사 로그 체크포인트 + 빠른(증분) 검증
A.show("afterglow_audit", checkpoint=True)
A.show("afterglow_audit", fast=True)
""")

# --------------------------------------------------------------------------
md(r"""
## 8. 정리

- `init → create → sign → ask` 로 페르소나 에이전트가 동작하고,
- `handoff` 사전 동의 → `interview`(갭 감지 · 음성 첨부 · 이중 서명)로 인계자가
  빠진 부분을 메우고,
- `export → verify → import` 로 폴더째 다른 사용자에게 **핫플러그** 했습니다.

실제 사용 시엔 `claude mcp add afterglow npx -y @daeseoksong/afterglow-mcp` 후
`claude /afterglow <명령>` 으로 똑같이 쓰면 됩니다. 아래 셀로 임시 폴더를 정리합니다.
""")

code(r"""
for c in [globals().get("A"), globals().get("B")]:
    if c: c.close()
import shutil, os
os.chdir(os.path.expanduser("~"))
for d in [WORK, ROOT_A, ROOT_B]:
    shutil.rmtree(d, ignore_errors=True)
print("정리 완료 ✓")
""")

# --------------------------------------------------------------------------
nb["cells"] = cells
nb["metadata"] = {
    "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
    "language_info": {"name": "python", "version": "3"},
}

out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "afterglow-hands-on.ipynb")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    nbf.write(nb, f)
print("wrote", out, "with", len(cells), "cells")
