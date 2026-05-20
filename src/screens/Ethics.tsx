import { Icon } from '../components/Icon';

export function Ethics() {
  return (
    <div className="cli-page">
      <div className="cli-page-h" style={{ marginBottom: 24 }}>
        <div className="eyebrow">가이드</div>
        <h2>퇴사한 동료를 존엄하게 기억하는 법.</h2>
        <p>
          이 시스템은 사람을 흉내내는 일을 합니다. 그래서 효율보다 동의를, 정확함보다 솔직함을 우선합니다. 아래는
          우리가 절대 흐트러뜨리지 않는 약속이에요.
        </p>
      </div>

      <div className="principle-grid">
        <div className="principle">
          <span className="num">01</span>
          <h4>본인이 정한다.</h4>
          <p>
            학습 자료의 종류, 답변 가능한 영역, 호출 가능한 사용자, 폐기 시점 — 모두 퇴사자 본인이 직접 선택합니다.{' '}
            <code
              style={{
                background: 'var(--paper-2)',
                padding: '0 4px',
                borderRadius: 3,
                fontSize: 11.5,
                fontFamily: 'var(--font-mono)',
              }}
            >
              consent.md
            </code>
            가 폴더에 함께 저장돼요.
          </p>
        </div>
        <div className="principle">
          <span className="num">02</span>
          <h4>가짜인 척하지 않는다.</h4>
          <p>
            모든 응답에 <span style={{ color: 'var(--brick)' }}>✦</span> 마크와 신뢰도가 함께 표시됩니다. 사용자가 봇과
            사람을 혼동해서는 안 되며, 추측인지 기록인지 명확히 구분해요.
          </p>
        </div>
        <div className="principle">
          <span className="num">03</span>
          <h4>모르는 건 모른다고 한다.</h4>
          <p>
            신뢰도 50% 이하 답변은 자동 거절. 추측 대신 다른 에이전트를 추천하거나, "이건 제가 다뤄본 적이 없어요"라고
            솔직히 말합니다.
          </p>
        </div>
      </div>

      <h3
        className="serif"
        style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', margin: '32px 0 14px' }}
      >
        동의 절차
      </h3>
      <div className="consent-flow">
        <div className="consent-step">
          <div className="num">STEP 01</div>
          <h5>퇴사 인터뷰 시 안내</h5>
          <p>
            HR 매니저가 가이드를 전달하고, 퇴사자는 14일 검토 후 결정합니다. 거절해도 불이익이 없으며, 이후 언제든
            마음을 바꿀 수 있어요.
          </p>
        </div>
        <div className="consent-step">
          <div className="num">STEP 02</div>
          <h5>자료 범위 동의서</h5>
          <p>
            어떤 채널의 메시지, 어떤 폴더의 문서, 어떤 레포의 코드까지 학습할지 항목별로 동의합니다. 회의 녹취는 다른
            참여자 동의도 함께 받아요.
          </p>
        </div>
        <div className="consent-step">
          <div className="num">STEP 03</div>
          <h5>잠재기 · 폐기 · 인계</h5>
          <p>
            본인은 언제든 일시정지·영구 삭제를 요청할 수 있습니다. 기본 설정은 24개월 후 자동 잠재기, 친권은 본인이
            지정한 동료에게 인계돼요.
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 32, background: 'var(--card-raised)' }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <div
            style={{
              flexShrink: 0,
              width: 42,
              height: 42,
              borderRadius: 8,
              background: 'var(--brick-soft)',
              color: 'var(--brick-dark)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon.Shield />
          </div>
          <div style={{ flex: 1 }}>
            <h4 className="serif" style={{ margin: '2px 0 6px', fontSize: 17, fontWeight: 500 }}>
              이 시스템은 죽은 사람을 위한 것이 아닙니다.
            </h4>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.65 }}>
              회사를 떠나지만 살아 있는 동료의 디지털 흔적을 유지하는 도구입니다. 사별·고인 추모 목적의 사용은 별도
              정책과 윤리 위원회 검토를 거쳐야 해요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
