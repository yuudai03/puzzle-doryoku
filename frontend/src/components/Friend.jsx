import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../api';

export default function Friends({ onBack }) {
  const [activeTab, setActiveTab] = useState('friends'); // 'friends' または 'requests'
  const [friendsData, setFriendsData] = useState([]);
  const [requestsData, setRequestsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // IDを入力して申請するフォーム
  const [newFriendId, setNewFriendId] = useState('');
  const [sendMessage, setSendMessage] = useState({ text: '', isError: false });

  const fetchFriends = useCallback(async () => {
    try {
      const response = await authFetch('/api/friends/list');
      if (!response.ok) throw new Error(`status ${response.status}`);
      const data = await response.json();
      setFriendsData(data.friends || []);
      setRequestsData(data.pending_requests || []);
      setLoadError('');
    } catch (error) {
      console.error("フレンド取得エラー:", error);
      setLoadError('フレンド一覧を読み込めませんでした。サーバーが起動しているか確認してください');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const handleSendRequest = async (e) => {
    e.preventDefault();
    const friendId = newFriendId.trim();
    if (!friendId) {
      setSendMessage({ text: 'ユーザーIDを入力してください', isError: true });
      return;
    }
    try {
      const response = await authFetch('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ friend_id: friendId }),
      });
      const data = await response.json();
      setSendMessage({ text: data.message, isError: !response.ok });
      if (response.ok) setNewFriendId('');
    } catch (error) {
      setSendMessage({ text: '通信に失敗しました', isError: true });
    }
  };

  const handleAcceptRequest = async (requesterId) => {
    try {
      const response = await authFetch('/api/friends/accept', {
        method: 'POST',
        body: JSON.stringify({ friend_id: requesterId }),
      });
      if (response.ok) fetchFriends();
    } catch (error) {
      console.error("承認エラー:", error);
    }
  };

  const handleRemoveFriend = async (friendId) => {
    if (!window.confirm(`${friendId} さんとのフレンドを解除しますか？`)) return;
    try {
      const response = await authFetch('/api/friends/remove', {
        method: 'POST',
        body: JSON.stringify({ friend_id: friendId }),
      });
      if (response.ok) fetchFriends();
    } catch (error) {
      console.error("解除エラー:", error);
    }
  };

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={onBack}>← ホーム</button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h1 className="page-title">フレンド</h1>
        <p className="page-lead">フレンドの累計集中時間が見られます。</p>
      </div>

      {/* ---- 申請フォーム ---- */}
      <form className="card" onSubmit={handleSendRequest}>
        <label className="field-label" htmlFor="friend-id">ユーザーIDでフレンド申請</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            id="friend-id" className="input" type="text" placeholder="例：yudai"
            value={newFriendId}
            onChange={(e) => { setNewFriendId(e.target.value); setSendMessage({ text: '', isError: false }); }}
            maxLength={20}
          />
          <button type="submit" className="btn btn-primary">申請</button>
        </div>
        {sendMessage.text && (
          <p className={`small ${sendMessage.isError ? 'text-error' : 'text-success'}`} style={{ margin: '8px 0 0' }}>
            {sendMessage.text}
          </p>
        )}
      </form>

      {/* ---- タブ ---- */}
      <div className="segmented" style={{ margin: '20px 0 12px' }}>
        <button className={activeTab === 'friends' ? 'active' : ''} onClick={() => setActiveTab('friends')}>
          フレンド（{friendsData.length}）
        </button>
        <button className={activeTab === 'requests' ? 'active' : ''} onClick={() => setActiveTab('requests')}>
          届いた申請（{requestsData.length}）
        </button>
      </div>

      <div className="list">
        {isLoading ? (
          <div className="empty">読み込み中…</div>
        ) : loadError ? (
          <div className="empty text-error">{loadError}</div>
        ) : activeTab === 'friends' ? (
          friendsData.length === 0 ? (
            <div className="empty">まだフレンドがいません。上のフォームかランキングから申請できます。</div>
          ) : (
            friendsData.map((friend) => (
              <div key={friend.friend_id} className="list-row">
                <span className="friend-avatar">{friend.friend_id.slice(0, 1).toUpperCase()}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{friend.friend_id}</div>
                  <div className="text-2 small">累計 {friend.study_minutes || 0}分</div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => handleRemoveFriend(friend.friend_id)}>
                  解除
                </button>
              </div>
            ))
          )
        ) : (
          requestsData.length === 0 ? (
            <div className="empty">届いている申請はありません</div>
          ) : (
            requestsData.map((req) => (
              <div key={req.requester_id} className="list-row">
                <span className="friend-avatar">{req.requester_id.slice(0, 1).toUpperCase()}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{req.requester_id}</div>
                  <div className="text-2 small">累計 {req.study_minutes || 0}分</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => handleAcceptRequest(req.requester_id)}>
                  承認
                </button>
              </div>
            ))
          )
        )}
      </div>

      <style>{`
        .friend-avatar {
          width: 36px;
          height: 36px;
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
