import React, { useState } from 'react';
import { API_BASE } from '../api';

export default function Login({ onLogin }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // 入力チェック
    if (!userId.trim() || !password.trim()) {
      setError('ユーザーIDとパスワードを入力してください');
      return;
    }

    // 叩くエンドポイントを切り替え
    const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId.trim(), password: password })
      });

      const data = await response.json();

      if (response.ok && data.token) {
        // 成功！ サーバーが発行したトークンを受け取ってログイン状態にする
        // （新規登録のときもトークンが返ってくるので、そのままログインできる）
        onLogin(data.user_id, data.token);
      } else {
        // 失敗（ID重複やパスワード間違いなど）
        setError(data.message || 'うまくいきませんでした。もう一度お試しください');
      }
    } catch (err) {
      console.error('通信エラー:', err);
      setError('サーバーに接続できませんでした。バックエンド（app.py）が起動しているか確認してください');
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setIsLoginMode(!isLoginMode);
    setError('');
  };

  return (
    <div className="login-wrap">
      <div className="login-brand">
        <h1 className="login-title">PUZZLE &amp; DORYOKU</h1>
        <p className="login-catch">勉強して、ボムを集めて、パズルで遊ぶ。</p>
      </div>

      <div className="card login-card">
        <h2 className="section-title" style={{ fontSize: '1.15rem', marginBottom: '20px' }}>
          {isLoginMode ? 'ログイン' : '新しくアカウントを作る'}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="field-label" htmlFor="login-id">ユーザーID</label>
            <input
              id="login-id"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="例：yudai"
              className="input"
              autoComplete="username"
              maxLength={20}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="login-pw">パスワード</label>
            <input
              id="login-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLoginMode ? 'パスワード' : '4文字以上'}
              className="input"
              autoComplete={isLoginMode ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p className="text-error small" style={{ margin: 0 }}>{error}</p>}

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={isSubmitting} style={{ marginTop: '4px' }}>
            {isSubmitting ? '送信中…' : (isLoginMode ? 'ログイン' : '登録してはじめる')}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={switchMode}>
            {isLoginMode ? 'アカウントをお持ちでない方はこちら' : 'すでにアカウントをお持ちの方はこちら'}
          </button>
        </div>
      </div>

      <style>{`
        .login-wrap {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
        }
        .login-brand {
          text-align: center;
          margin-bottom: 28px;
        }
        .login-title {
          font-size: 2rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          margin: 0;
        }
        .login-catch {
          color: var(--text-2);
          margin: 8px 0 0;
        }
        .login-card {
          width: 100%;
          max-width: 400px;
          padding: 28px;
        }
      `}</style>
    </div>
  );
}
