import React, { useState, useEffect } from 'react';
import './App.css';

import Login from './components/Login';
import Home from './components/Home';
import Timer from './components/Timer';
import Ranking from './components/Ranking';
import PuzzleBoard from './components/PuzzleBoard';
import Profile from './components/Profile';
import Friends from './components/Friend';
import Missions from './components/Missions';
import Guide from './components/Guide';

import { authFetch, getToken, saveAuth, clearAuth, setUnauthorizedHandler } from './api';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState('home');
  // 保存済みのトークンを確認している間は true（ログイン画面が一瞬出るのを防ぐ）
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    // トークンが期限切れ・不正になったら、ログイン画面に戻す
    setUnauthorizedHandler((message) => {
      setCurrentUser(null);
      setView('home');
      alert(message);
    });

    // リロードしたとき：保存してあるトークンがまだ使えるか確認して、使えればログイン状態に戻す
    const restoreSession = async () => {
      if (!getToken()) {
        setIsCheckingAuth(false);
        return;
      }
      try {
        const response = await authFetch('/api/auth/me');
        if (response.ok) {
          const data = await response.json();
          setCurrentUser({ id: data.user_id });
        } else {
          clearAuth();
        }
      } catch (error) {
        console.error('ログイン状態の確認に失敗しました:', error);
      } finally {
        setIsCheckingAuth(false);
      }
    };
    restoreSession();

    return () => setUnauthorizedHandler(null);
  }, []);

  const handleLogin = (userId, token) => {
    saveAuth(userId, token);
    setCurrentUser({ id: userId });
    setView('home');
  };

  const handleLogout = () => {
    if (window.confirm("ログアウトしますか？")) {
      clearAuth();
      setCurrentUser(null);
      setView('home');
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="center-screen">読み込み中…</div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  if (view === 'home') {
    return (
      <div>
        <Home
          onNavigate={setView}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  if (view === 'timer') {
    return <Timer onBack={() => setView('home')} currentUser={currentUser} />;
  }

  if (view === 'ranking') {
    return <Ranking onBack={() => setView('home')} currentUser={currentUser} />;
  }

  if (view === 'game') {
    return <PuzzleBoard onBack={() => setView('home')} userId={currentUser.id} />;
  }

  if (view === 'profile') {
    return <Profile onBack={() => setView('home')} currentUser={currentUser} />;
  }

  if (view === 'friends') {
    return <Friends onBack={() => setView('home')} currentUser={currentUser} />;
  }

  if (view === 'missions') {
    return <Missions onBack={() => setView('home')} currentUser={currentUser} />;
  }

  if (view === 'guide') {
    return <Guide onBack={() => setView('home')} />;
  }

  return null;
}

export default App;
