import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { authFetch } from '../api';

export default function Profile({ onBack, currentUser }) {
  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await authFetch('/api/user/profile');
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = await response.json();
        setProfileData({
          total_time: data.study_minutes || 0,
          high_score: data.high_score || 0,
          bombs: data.bomb_count || 0,
          study_stats: (data.study_stats || []).map((s) => ({
            ...s,
            subject: s.subject === 'NO_TARGET' ? '未入力' : s.subject,
          })),
        });
      } catch (error) {
        console.error("プロフィール取得エラー:", error);
        setLoadError('プロフィールを読み込めませんでした。サーバーが起動しているか確認してください');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const formatHours = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}時間${m}分` : `${m}分`;
  };

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={onBack}>← ホーム</button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h1 className="page-title">{currentUser?.id} さんの記録</h1>
      </div>

      {isLoading ? (
        <p className="text-3">読み込み中…</p>
      ) : loadError ? (
        <p className="text-error">{loadError}</p>
      ) : (
        <>
          <section className="stat-grid">
            <div className="stat">
              <p className="stat-label">累計の集中</p>
              <p className="stat-value">{formatHours(profileData.total_time)}</p>
            </div>
            <div className="stat">
              <p className="stat-label">パズルのハイスコア</p>
              <p className="stat-value">{profileData.high_score.toLocaleString()}</p>
            </div>
            <div className="stat">
              <p className="stat-label">ボム</p>
              <p className="stat-value" style={{ color: 'var(--bomb)' }}>{profileData.bombs}<span className="stat-unit">個</span></p>
            </div>
          </section>

          <section className="card" style={{ marginTop: '16px' }}>
            <h2 className="section-title">教科ごとの集中時間</h2>
            {profileData.study_stats.length === 0 ? (
              <div className="empty">まだ記録がありません。タイマーで集中すると、ここに教科ごとの時間が出ます。</div>
            ) : (
              <div style={{ width: '100%', height: '280px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profileData.study_stats} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#E6E4DC" />
                    <XAxis dataKey="subject" tickLine={false} axisLine={{ stroke: '#D3D1C7' }} tick={{ fill: '#5F5E5A', fontSize: 13 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#888780', fontSize: 12 }} unit="分" />
                    <Tooltip
                      cursor={{ fill: '#F1EFE8' }}
                      formatter={(value) => [`${value}分`, '集中時間']}
                      contentStyle={{ borderRadius: 8, border: '1px solid #E6E4DC', fontFamily: 'inherit' }}
                    />
                    <Bar dataKey="minutes" fill="#1D9E75" radius={[6, 6, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
