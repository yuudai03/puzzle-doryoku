import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../api';

export default function Missions({ onBack }) {
  const [missionData, setMissionData] = useState({
    today_minutes: 0,
    target_minutes: 100,
    is_cleared: false,
    is_claimed: false
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ text: '', isError: false });

  // デイリー進捗確認 (GET)
  const fetchMissionData = useCallback(async () => {
    try {
      // authFetch はトークンを自動でつけ、キャッシュも使わず常に最新をDBから取得する
      const response = await authFetch('/api/missions/daily');
      if (response.ok) {
        const data = await response.json();
        setMissionData(data);
      } else {
        setMessage({ text: 'ミッションの情報を取得できませんでした', isError: true });
      }
    } catch (error) {
      console.error("通信エラー:", error);
      setMessage({ text: 'サーバーに接続できませんでした', isError: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMissionData();
  }, [fetchMissionData]);

  // デイリー報酬受け取り (POST)
  const handleClaimReward = async () => {
    try {
      const response = await authFetch('/api/missions/claim', {
        method: 'POST',
      });
      const data = await response.json();
      setMessage({ text: data.message || '', isError: !response.ok });
      if (response.ok) fetchMissionData();
    } catch (error) {
      console.error("通信エラー:", error);
      setMessage({ text: '通信エラーが発生しました', isError: true });
    }
  };

  const percent = Math.min(100, (missionData.today_minutes / missionData.target_minutes) * 100);
  const remaining = Math.max(0, missionData.target_minutes - missionData.today_minutes);

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={onBack}>← ホーム</button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h1 className="page-title">デイリーミッション</h1>
        <p className="page-lead">1日{missionData.target_minutes}分集中すると、ボムを1個もらえます（1日1回）。</p>
      </div>

      <section className="card" style={{ padding: '28px' }}>
        {loading ? (
          <p className="text-3" style={{ margin: 0 }}>読み込み中…</p>
        ) : (
          <>
            <p className="text-2 small" style={{ margin: 0 }}>今日の集中</p>
            <p className="num" style={{ fontSize: '2.6rem', fontWeight: 700, margin: '2px 0 12px', lineHeight: 1.2 }}>
              {missionData.today_minutes}
              <span className="stat-unit"> / {missionData.target_minutes}分</span>
            </p>
            <div className="progress" style={{ height: '10px' }}>
              <span style={{ width: `${percent}%`, background: missionData.is_cleared ? 'var(--gold)' : 'var(--accent)' }} />
            </div>

            <div style={{ marginTop: '24px' }}>
              {missionData.is_claimed ? (
                <p className="text-success" style={{ margin: 0, fontWeight: 500 }}>
                  今日の報酬は受け取り済みです。また明日！
                </p>
              ) : missionData.is_cleared ? (
                <button onClick={handleClaimReward} className="btn btn-primary btn-lg">
                  報酬を受け取る（ボム +1）
                </button>
              ) : (
                <p className="text-2" style={{ margin: 0 }}>
                  あと <strong className="num">{remaining}分</strong> で達成です
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {message.text && (
        <p className={`small ${message.isError ? 'text-error' : 'text-success'}`} style={{ marginTop: '12px' }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
