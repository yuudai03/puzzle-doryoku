import React from 'react';

const STEPS = [
  {
    title: 'タイマーで集中する',
    body: (
      <>
        ホームの「集中をはじめる」からタイマーを起動します。25分集中・5分休憩が基本で、
        4セットごとに長い休憩が入ります。<strong>25分以上集中するとボムが1個</strong>もらえます。
      </>
    ),
  },
  {
    title: 'デイリーミッションをクリアする',
    body: (
      <>
        1日の集中が合計100分になったら「デイリーミッション」で報酬を受け取れます。
        報酬はボム1個で、1日1回までです。ボムは<strong>もらってから3日で消える</strong>ので早めに使いましょう。
      </>
    ),
  },
  {
    title: 'パズルでハイスコアを狙う',
    body: (
      <>
        同じ色が3つ以上つながったブロックをタップで消せます。制限時間は60秒。
        時間がたつとブロックが岩に変わり、岩はボムでしか壊せません。
        ボムはタップした場所のまわり3×3をまとめて消し、スコアは2倍になります。
        続けて消すとコンボになり、<strong>スコアは最大5倍</strong>までアップします。
      </>
    ),
  },
];

export default function Guide({ onBack }) {
  return (
    <div className="page page-narrow">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={onBack}>← ホーム</button>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h1 className="page-title">遊び方</h1>
        <p className="page-lead">勉強の努力が、そのままパズルの武器になります。</p>
      </div>

      {STEPS.map((step, i) => (
        <section key={step.title} className="card guide-step">
          <span className="guide-num num">{i + 1}</span>
          <div>
            <h2 className="section-title" style={{ marginBottom: '6px' }}>{step.title}</h2>
            <p className="text-2" style={{ margin: 0 }}>{step.body}</p>
          </div>
        </section>
      ))}

      <style>{`
        .guide-step {
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }
        .guide-step strong {
          color: var(--text);
          font-weight: 700;
        }
        .guide-num {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--accent-soft);
          color: var(--accent-text);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
