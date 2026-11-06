import React, { useState, useEffect } from 'react';
import { authFetch } from '../api';

const MEDAL = {
  1: { color: 'var(--gold)', soft: 'var(--gold-soft)' },
  2: { color: '#5F5E5A', soft: '#F1EFE8' },
  3: { color: '#993C1D', soft: '#FAECE7' },
};

export default function Ranking({ onBack, currentUser }) {
  const [rankingData, setRankingData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // モーダル用の状態管理
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalProfileData, setModalProfileData] = useState(null);
  const [isModalLoading, setIsModalLoading] = useState(false);

  // フレンド申請の状態（idle / sending / sent / error）
  const [requestStatus, setRequestStatus] = useState('idle');
  const [requestMessage, setRequestMessage] = useState('');

  useEffect(() => {
    const fetchRanking = async () => {
      try {
        const response = await authFetch('/api/game/ranking');
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = await response.json();
        setRankingData(data.ranking || []);
      } catch (error) {
        console.error("ランキング取得エラー:", error);
        setLoadError('ランキングを読み込めませんでした。サーバーが起動しているか確認してください');
      } finally {
        setIsLoading(false);
      }
    };
    fetchRanking();
  }, []);

  const handleUserClick = async (userId) => {
    setSelectedUser(userId);
    setModalProfileData(null);
    setIsModalLoading(true);
    setRequestStatus('idle');
    setRequestMessage('');

    try {
      const response = await authFetch(`/api/user/profile?user_id=${encodeURIComponent(userId)}`);
      if (response.ok) {
        const data = await response.json();
        setModalProfileData({
          study_minutes: data.study_minutes || 0,
          high_score: data.high_score || 0,
        });
      }
    } catch (error) {
      console.error("プロフィール取得エラー:", error);
    } finally {
      setIsModalLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedUser(null);
  };

  // フレンド申請を送る
  const handleSendRequest = async () => {
    setRequestStatus('sending');
    try {
      const response = await authFetch('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ friend_id: selectedUser }),
      });
      const data = await response.json();
      if (response.ok) {
        setRequestStatus('sent');
        setRequestMessage('申請を送りました');
      } else {
        setRequestStatus('error');
        setRequestMessage(data.message || '申請できませんでした');
      }
    } catch (error) {
      setRequestStatus('error');
      setRequestMessage('通信に失敗しました');
    }
  };

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={onBack}>← ホーム</button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h1 className="page-title">ランキング</h1>
        <p className="page-lead">パズルのハイスコア上位10人。名前を押すと詳しく見られます。</p>
      </div>

      <div className="list">
        {isLoading ? (
          <div className="empty">読み込み中…</div>
        ) : loadError ? (
          <div className="empty text-error">{loadError}</div>
        ) : rankingData.length === 0 ? (
          <div className="empty">まだ記録がありません。パズルで最初のスコアを出してみましょう。</div>
        ) : (
          rankingData.map((player) => {
            const isMe = player.user_id === currentUser?.id;
            const medal = MEDAL[player.rank];
            return (
              <div key={player.user_id} className="list-row ranking-row" style={{ background: isMe ? 'var(--accent-soft)' : undefined }}>
                <span
                  className="ranking-rank num"
                  style={medal ? { background: medal.soft, color: medal.color } : undefined}
                >
                  {player.rank}
                </span>
                <button className="ranking-name" onClick={() => handleUserClick(player.user_id)}>
                  {player.user_id}
                  {isMe && <span className="badge" style={{ marginLeft: '8px' }}>あなた</span>}
                </button>
                <span className="ranking-score num">{player.score.toLocaleString()}</span>
              </div>
            );
          })
        )}
      </div>

      {/* ---- ユーザー詳細 ---- */}
      {selectedUser && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 className="section-title" style={{ margin: 0, fontSize: '1.2rem' }}>{selectedUser}</h2>
              <button className="btn btn-ghost btn-sm" onClick={closeModal} aria-label="閉じる">閉じる</button>
            </div>

            {isModalLoading ? (
              <p className="text-3">読み込み中…</p>
            ) : !modalProfileData ? (
              <p className="text-error small">プロフィールを読み込めませんでした</p>
            ) : (
              <>
                <div className="stat-grid">
                  <div className="stat">
                    <p className="stat-label">累計の集中</p>
                    <p className="stat-value">{modalProfileData.study_minutes}<span className="stat-unit">分</span></p>
                  </div>
                  <div className="stat">
                    <p className="stat-label">ハイスコア</p>
                    <p className="stat-value">{modalProfileData.high_score.toLocaleString()}</p>
                  </div>
                </div>

                {selectedUser !== currentUser?.id && (
                  <div style={{ marginTop: '16px' }}>
                    <button
                      className="btn btn-primary btn-block"
                      onClick={handleSendRequest}
                      disabled={requestStatus === 'sending' || requestStatus === 'sent'}
                    >
                      {requestStatus === 'sending' ? '送信中…' : requestStatus === 'sent' ? '申請済み' : 'フレンド申請を送る'}
                    </button>
                    {requestMessage && (
                      <p className={`small ${requestStatus === 'error' ? 'text-error' : 'text-success'}`} style={{ margin: '8px 0 0', textAlign: 'center' }}>
                        {requestMessage}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        .ranking-row {
          padding: 12px 20px;
        }
        .ranking-rank {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: var(--text-2);
          flex-shrink: 0;
        }
        .ranking-name {
          flex: 1;
          text-align: left;
          background: none;
          border: none;
          padding: 0;
          font-size: 1rem;
          font-weight: 500;
          color: var(--text);
          cursor: pointer;
        }
        .ranking-name:hover {
          text-decoration: underline;
        }
        .ranking-score {
          font-weight: 700;
          font-size: 1.05rem;
        }
      `}</style>
    </div>
  );
}
