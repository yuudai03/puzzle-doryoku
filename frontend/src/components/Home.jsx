import React, { useState, useEffect } from 'react';
import { authFetch } from '../api';

export default function Home({ onNavigate, currentUser, onLogout }) {
  const [today, setToday] = useState({ minutes: 0, sessions: 0, target: 100, bombs: 0 });

  // ホームでも今日の進み具合を見せる
  useEffect(() => {
    const fetchToday = async () => {
      try {
        const response = await authFetch('/api/pomodoro/today');
        if (!response.ok) return;
        const data = await response.json();
        setToday({
          minutes: data.today_minutes,
          sessions: data.today_sessions,
          target: data.target_minutes,
          bombs: data.bomb_count ?? 0
        });
      } catch (error) {
        console.error('今日の記録の取得エラー:', error);
      }
    };
    fetchToday();
  }, []);

  const todayPercent = Math.min(100, (today.minutes / today.target) * 100);

  const menuItems = [
    { key: 'game', title: 'パズルで遊ぶ', desc: `ボム ${today.bombs}個 所持中`, color: 'var(--bomb)', soft: 'var(--bomb-soft)' },
    { key: 'missions', title: 'デイリーミッション', desc: '目標達成でボムを獲得', color: 'var(--gold)', soft: 'var(--gold-soft)' },
    { key: 'ranking', title: 'ランキング', desc: 'パズルのハイスコア', color: 'var(--long)', soft: 'var(--long-soft)' },
  ];

  return (
    <div className="page">
      {/* ---- ヘッダー ---- */}
      <header className="home-header">
        <div className="home-logo">PUZZLE &amp; DORYOKU</div>
        <nav className="home-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('profile')}>
            {currentUser?.id} さん
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('friends')}>フレンド</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('guide')}>遊び方</button>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>ログアウト</button>
        </nav>
      </header>

      {/* ---- メイン：タイマー ---- */}
      <section className="card home-hero">
        <div>
          <p className="text-2 small" style={{ margin: 0 }}>今日の集中</p>
          <p className="home-today num">
            {today.minutes}
            <span className="stat-unit"> / {today.target}分</span>
            <span className="text-3 small" style={{ marginLeft: '12px' }}>{today.sessions}セット</span>
          </p>
          <div className="progress" style={{ maxWidth: '360px' }}>
            <span style={{ width: `${todayPercent}%` }} />
          </div>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => onNavigate('timer')}>
          集中をはじめる
        </button>
      </section>

      {/* ---- その他のメニュー ---- */}
      <section className="home-menu">
        {menuItems.map((item) => (
          <button key={item.key} className="home-tile" onClick={() => onNavigate(item.key)}>
            <span className="home-tile-dot" style={{ background: item.soft }}>
              <span style={{ background: item.color }} />
            </span>
            <span className="home-tile-title">{item.title}</span>
            <span className="home-tile-desc">{item.desc}</span>
          </button>
        ))}
      </section>

      <style>{`
        .home-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 40px;
        }
        .home-logo {
          font-weight: 700;
          letter-spacing: 0.08em;
          font-size: 1.05rem;
        }
        .home-nav {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .home-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
          padding: 28px;
        }
        .home-hero > div {
          flex: 1;
          min-width: 220px;
        }
        .home-today {
          font-size: 2.4rem;
          font-weight: 700;
          margin: 2px 0 10px;
          line-height: 1.2;
        }
        .home-menu {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 14px;
          margin-top: 16px;
        }
        .home-tile {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          text-align: left;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 20px;
          cursor: pointer;
          transition: border-color 0.15s, transform 0.15s;
          color: var(--text);
        }
        .home-tile:hover {
          border-color: var(--border-strong);
          transform: translateY(-2px);
        }
        .home-tile-dot {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
        }
        .home-tile-dot > span {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }
        .home-tile-title {
          font-weight: 700;
          font-size: 1rem;
        }
        .home-tile-desc {
          font-size: 0.85rem;
          color: var(--text-2);
        }
      `}</style>
    </div>
  );
}
