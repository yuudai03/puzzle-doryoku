import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '../api';

// ==========================================
// 設定
// ==========================================
// 動作確認で短くしたいときは frontend/.env に REACT_APP_TIMER_DEBUG=true と書いて npm start し直す
// （DEBUGモードでは「1分 = 1秒」で動く）
const DEBUG_MODE = process.env.REACT_APP_TIMER_DEBUG === 'true';
const SECONDS_PER_MINUTE = DEBUG_MODE ? 1 : 60;

const PRESETS = {
  standard: { label: '25 / 5', focus: 25, short: 5, long: 15 },
  deep: { label: '50 / 10', focus: 50, short: 10, long: 20 },
  custom: { label: 'カスタム' },
};
const LONG_BREAK_EVERY = 4;       // 何セットごとに長い休憩を入れるか
const CUSTOM_LONG_BREAK = 15;     // カスタム時の長い休憩（分）
const BOMB_MIN_MINUTES = 25;      // これ以上の集中でボム獲得（バックエンドと同じ値）
const SETTINGS_KEY = 'pomodoroSettings';

const MODE_INFO = {
  focus: { label: '集中', color: 'var(--accent)', soft: 'var(--accent-soft)' },
  short: { label: '休憩', color: 'var(--break)', soft: 'var(--break-soft)' },
  long: { label: '長い休憩', color: 'var(--long)', soft: 'var(--long-soft)' },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 保存しておいた設定を読み込む（読めなければ初期値）
const loadSettings = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (saved && PRESETS[saved.presetKey]) return saved;
  } catch (e) {
    // localStorage が使えない環境では初期値
  }
  return { presetKey: 'standard', customFocus: 25, customShort: 5, autoStart: false };
};

export default function Timer({ onBack, currentUser }) {
  const initialSettings = useRef(loadSettings()).current;

  // ---- 設定 ----
  const [presetKey, setPresetKey] = useState(initialSettings.presetKey);
  const [customFocus, setCustomFocus] = useState(initialSettings.customFocus);
  const [customShort, setCustomShort] = useState(initialSettings.customShort);
  const [autoStart, setAutoStart] = useState(initialSettings.autoStart);

  const settings = presetKey === 'custom'
    ? { focus: customFocus, short: customShort, long: CUSTOM_LONG_BREAK }
    : PRESETS[presetKey];
  const durationOf = (m) => settings[m] * SECONDS_PER_MINUTE;

  // ---- タイマー状態 ----
  const [mode, setMode] = useState('focus'); // 'focus' | 'short' | 'long'
  const [timeLeft, setTimeLeft] = useState(settings.focus * SECONDS_PER_MINUTE);
  const [isActive, setIsActive] = useState(false);
  const [focusCount, setFocusCount] = useState(0); // この画面で終えた集中セット数

  // ---- 記録・表示用 ----
  const [subject, setSubject] = useState("");
  const [bombs, setBombs] = useState(0);
  const [today, setToday] = useState({ minutes: 0, sessions: 0, target: 100 });
  const [recentSubjects, setRecentSubjects] = useState([]);
  const [message, setMessage] = useState({ text: "", isError: false });

  // 終了予定時刻（ミリ秒）。「残り＝終了時刻−現在時刻」で計算するので、タブを裏に回してもずれない
  const endAtRef = useRef(null);
  // 完了処理が二重に走らないためのフラグ
  const completingRef = useRef(false);
  // 通知音用
  const audioCtxRef = useRef(null);

  const totalTime = durationOf(mode);

  // ==========================================
  // データ取得
  // ==========================================
  const fetchToday = useCallback(async () => {
    try {
      const response = await authFetch('/api/pomodoro/today');
      if (!response.ok) return;
      const data = await response.json();
      setToday({ minutes: data.today_minutes, sessions: data.today_sessions, target: data.target_minutes });
      setRecentSubjects(data.recent_subjects || []);
      setBombs(data.bomb_count ?? 0);
    } catch (error) {
      console.error("今日の記録の取得エラー:", error);
    }
  }, []);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  // 設定を保存
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ presetKey, customFocus, customShort, autoStart }));
    } catch (e) {
      // 保存できなくても動作には影響しない
    }
  }, [presetKey, customFocus, customShort, autoStart]);

  // 止まっているときに時間設定を変えたら、表示中の時間も合わせる
  useEffect(() => {
    if (!isActive) {
      endAtRef.current = null;
      setTimeLeft(durationOf(mode));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey, customFocus, customShort]);

  // ==========================================
  // 通知（音＋ブラウザ通知）
  // ==========================================
  const prepareNotification = () => {
    // ブラウザの制限で、音と通知の許可は「ボタンを押したとき」に準備しておく必要がある
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const playChime = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    // ド・ミ・ソの3音
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    });
  };

  const notify = (title, body) => {
    playChime();
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body });
      } catch (e) {
        // 通知が出せない環境では音だけ
      }
    }
  };
  // ==========================================
  // 操作
  // ==========================================
  const startTimer = (seconds) => {
    endAtRef.current = Date.now() + seconds * 1000;
    completingRef.current = false;
    setIsActive(true);
  };

  const handleStartPause = () => {
    if (isActive) {
      // 一時停止：残り時間はそのまま保持
      setIsActive(false);
      endAtRef.current = null;
    } else {
      if (timeLeft <= 0) return;
      prepareNotification();
      startTimer(timeLeft);
    }
  };

  const handleReset = () => {
    setIsActive(false);
    endAtRef.current = null;
    completingRef.current = false;
    setTimeLeft(durationOf(mode));
  };

  // 休憩をスキップして次の集中へ
  const handleSkipBreak = () => {
    setIsActive(false);
    endAtRef.current = null;
    completingRef.current = false;
    setMode('focus');
    setTimeLeft(durationOf('focus'));
  };

  // スペースキーでスタート/一時停止（入力欄に入力中は除く）
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      handleStartPause();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // ==========================================
  // カウントダウン
  // ==========================================
  useEffect(() => {
    if (!isActive) return;

    const tick = () => {
      if (!endAtRef.current) return;
      const remaining = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [isActive]);

  // 00:00 になったら1秒見せてから完了処理
  useEffect(() => {
    if (!isActive || timeLeft > 0 || completingRef.current) return;
    completingRef.current = true;
    const timeout = setTimeout(() => {
      handleTimerComplete();
    }, 1000);
    return () => {
      clearTimeout(timeout);
      completingRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, timeLeft]);

  // タブのタイトルに残り時間を表示
  useEffect(() => {
    const original = document.title;
    if (isActive) {
      const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
      const secs = (timeLeft % 60).toString().padStart(2, '0');
      document.title = `${mins}:${secs} ${mode === 'focus' ? '集中中' : '休憩中'}`;
    }
    return () => { document.title = original; };
  }, [isActive, timeLeft, mode]);

  // ==========================================
  // 完了処理
  // ==========================================
  const handleTimerComplete = async () => {
    setIsActive(false);
    endAtRef.current = null;
    completingRef.current = false;

    if (mode !== 'focus') {
      // 休憩おわり → 集中へ
      notify('休憩おわり！', '次の集中を始めましょう');
      setMode('focus');
      setTimeLeft(durationOf('focus'));
      if (autoStart) startTimer(durationOf('focus'));
      return;
    }

    // 集中おわり → 休憩へ
    const newFocusCount = focusCount + 1;
    const nextMode = newFocusCount % LONG_BREAK_EVERY === 0 ? 'long' : 'short';
    setFocusCount(newFocusCount);
    setMode(nextMode);
    setTimeLeft(durationOf(nextMode));
    notify(
      '集中おわり！おつかれさま',
      `${nextMode === 'long' ? '長い休憩' : '休憩'} ${settings[nextMode]}分にしましょう`
    );
    if (autoStart) startTimer(durationOf(nextMode));

    const targetSubject = subject.trim() === "" ? "NO_TARGET" : subject.trim();

    // APIへのデータ送信は裏側で行う
    try {
      const response = await authFetch('/api/pomodoro/finish', {
        method: 'POST',
        body: JSON.stringify({
          study_minutes: settings.focus,
          subject_name: targetSubject
        })
      });

      if (!response.ok) {
        throw new Error(`APIエラー (status: ${response.status})`);
      }

      const data = await response.json();
      const gotBomb = data.reward?.amount_given > 0;
      setMessage({
        text: gotBomb
          ? `+${settings.focus}分 記録しました！ 💣ボムを1個獲得`
          : `+${settings.focus}分 記録しました！（ボムは${BOMB_MIN_MINUTES}分以上の集中で獲得）`,
        isError: false
      });
      fetchToday();
    } catch (error) {
      // 保存に失敗したときは、ボムを増やしたように見せず、エラーを表示する
      console.error("DB保存に失敗しました:", error);
      setMessage({ text: "記録の保存に失敗しました。サーバーが起動しているか確認してください。", isError: true });
    }
  };
  // ==========================================
  // 表示
  // ==========================================
  const formatTime = () => {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = totalTime > 0 ? 100 - (timeLeft / totalTime) * 100 : 0;
  const dotsFilled = mode === 'long' ? LONG_BREAK_EVERY : focusCount % LONG_BREAK_EVERY;
  const todayPercent = Math.min(100, (today.minutes / today.target) * 100);
  const settingsLocked = isActive;
  const modeInfo = MODE_INFO[mode];

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={onBack}>← ホーム</button>
      </div>

      {/* ---- 時間設定 ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div className="segmented" role="group" aria-label="時間の設定">
          {Object.entries(PRESETS).map(([key, p]) => (
            <button
              key={key}
              className={presetKey === key ? 'active' : ''}
              onClick={() => setPresetKey(key)}
              disabled={settingsLocked}
            >
              {p.label}
            </button>
          ))}
        </div>

        {presetKey === 'custom' && (
          <div className="timer-custom">
            <label>
              集中
              <input
                type="number" className="input" min="5" max="60" value={customFocus} disabled={settingsLocked}
                onChange={(e) => setCustomFocus(clamp(parseInt(e.target.value, 10) || 5, 5, 60))}
              />
              分
            </label>
            <label>
              休憩
              <input
                type="number" className="input" min="1" max="30" value={customShort} disabled={settingsLocked}
                onChange={(e) => setCustomShort(clamp(parseInt(e.target.value, 10) || 1, 1, 30))}
              />
              分
            </label>
            <span className="text-3 small">長い休憩 {CUSTOM_LONG_BREAK}分</span>
          </div>
        )}
      </div>

      {/* ---- タイマー本体 ---- */}
      <section className="card timer-card">
        <div className="timer-mode">
          <span className="badge" style={{ background: modeInfo.soft, color: modeInfo.color }}>{modeInfo.label}</span>
          <div className="timer-dots" title={`${LONG_BREAK_EVERY}セットごとに長い休憩`}>
            {Array.from({ length: LONG_BREAK_EVERY }).map((_, i) => (
              <span key={i} style={{
                borderColor: modeInfo.color,
                background: i < dotsFilled ? modeInfo.color : 'transparent'
              }} />
            ))}
          </div>
        </div>

        <div className="timer-time num">{formatTime()}</div>

        <div className="progress" style={{ margin: '0 auto 24px', maxWidth: '360px' }}>
          <span style={{ width: `${progressPercent}%`, background: modeInfo.color }} />
        </div>

        {DEBUG_MODE && (
          <p className="small" style={{ color: 'var(--gold)', margin: '-12px 0 16px' }}>
            デバッグモード：1分＝1秒で動いています
          </p>
        )}

        <div className="timer-actions">
          <button onClick={handleStartPause} className="btn btn-primary btn-lg" style={{ minWidth: '160px', background: modeInfo.color, borderColor: modeInfo.color }}>
            {isActive ? '一時停止' : (timeLeft < totalTime ? '再開' : 'スタート')}
          </button>
          <button onClick={handleReset} className="btn">リセット</button>
          {mode !== 'focus' && (
            <button onClick={handleSkipBreak} className="btn">休憩をスキップ</button>
          )}
        </div>

        <label className="timer-auto">
          <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
          終わったら次を自動でスタート
        </label>
        <p className="text-3 small" style={{ margin: '4px 0 0' }}>スペースキーでもスタート／一時停止できます</p>
      </section>

      {/* ---- 教科入力 ---- */}
      {mode === 'focus' && (
        <section className="card">
          <label className="field-label" htmlFor="timer-subject">何を勉強する？</label>
          <input
            id="timer-subject" type="text" className="input"
            placeholder="例：基本情報、英語、統計学"
            value={subject} onChange={(e) => setSubject(e.target.value)}
            disabled={isActive} maxLength={50}
          />
          {recentSubjects.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
              {recentSubjects.map((s) => (
                <button
                  key={s}
                  className={`chip ${subject === s ? 'active' : ''}`}
                  onClick={() => setSubject(s)}
                  disabled={isActive}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {settings.focus < BOMB_MIN_MINUTES && (
            <p className="small" style={{ color: 'var(--gold)', margin: '10px 0 0' }}>
              ボムは{BOMB_MIN_MINUTES}分以上の集中でもらえます
            </p>
          )}
        </section>
      )}

      {message.text && (
        <p className={`small ${message.isError ? 'text-error' : 'text-success'}`} style={{ textAlign: 'center', margin: '16px 0' }}>
          {message.text}
        </p>
      )}

      {/* ---- 今日の記録 ---- */}
      <section className="stat-grid" style={{ marginTop: '16px' }}>
        <div className="stat">
          <p className="stat-label">今日の集中</p>
          <p className="stat-value">{today.minutes}<span className="stat-unit">/ {today.target}分</span></p>
          <div className="progress" style={{ marginTop: '8px' }}>
            <span style={{ width: `${todayPercent}%`, background: todayPercent >= 100 ? 'var(--gold)' : 'var(--accent)' }} />
          </div>
        </div>
        <div className="stat">
          <p className="stat-label">今日のセット数</p>
          <p className="stat-value">{today.sessions}<span className="stat-unit">セット</span></p>
        </div>
        <div className="stat">
          <p className="stat-label">ボム</p>
          <p className="stat-value" style={{ color: 'var(--bomb)' }}>{bombs}<span className="stat-unit">個</span></p>
        </div>
      </section>

      <style>{`
        .timer-custom {
          display: flex;
          gap: 16px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: center;
          color: var(--text-2);
          font-size: 0.9rem;
        }
        .timer-custom label {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .timer-custom .input {
          width: 72px;
          padding: 6px 8px;
          text-align: center;
        }
        .timer-card {
          text-align: center;
          padding: 28px 24px 24px;
          margin-top: 20px;
        }
        .timer-mode {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
        }
        .timer-dots {
          display: flex;
          gap: 6px;
        }
        .timer-dots span {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 2px solid;
          transition: background-color 0.3s;
        }
        .timer-time {
          font-size: 6.5rem;
          font-weight: 700;
          line-height: 1.1;
          letter-spacing: 0.02em;
          margin: 16px 0 20px;
        }
        .timer-actions {
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .timer-auto {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 20px;
          color: var(--text-2);
          font-size: 0.9rem;
          cursor: pointer;
        }
        .timer-auto input {
          width: 16px;
          height: 16px;
          accent-color: var(--accent);
        }
        @media (max-width: 600px) {
          .timer-time { font-size: 4.5rem; }
        }
      `}</style>
    </div>
  );
}