import React, { useState, useEffect, useRef, useCallback } from 'react';

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
  custom: { label: 'CUSTOM' },
};
const LONG_BREAK_EVERY = 4;       // 何セットごとに長い休憩を入れるか
const CUSTOM_LONG_BREAK = 15;     // カスタム時の長い休憩（分）
const BOMB_MIN_MINUTES = 25;      // これ以上の集中でボム獲得（バックエンドと同じ値）
const SETTINGS_KEY = 'pomodoroSettings';

const MODE_INFO = {
  focus: { label: '-- CURRENT MISSION: FOCUS --', color: '#38bdf8' },
  short: { label: '-- CURRENT MISSION: RELAX --', color: '#2ed573' },
  long: { label: '-- CURRENT MISSION: LONG RELAX --', color: '#a29bfe' },
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

  const API_BASE = "http://127.0.0.1:5000";
  const accentColor = MODE_INFO[mode].color;
  const totalTime = durationOf(mode);

  // ==========================================
  // データ取得
  // ==========================================
  const fetchToday = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/pomodoro/today?user_id=${currentUser.id}`);
      if (!response.ok) return;
      const data = await response.json();
      setToday({ minutes: data.today_minutes, sessions: data.today_sessions, target: data.target_minutes });
      setRecentSubjects(data.recent_subjects || []);
      setBombs(data.bomb_count ?? 0);
    } catch (error) {
      console.error("今日の記録の取得エラー:", error);
    }
  }, [currentUser.id]);

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
      const response = await fetch(`${API_BASE}/api/pomodoro/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
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

  const progressPercent = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0;
  const dotsFilled = mode === 'long' ? LONG_BREAK_EVERY : focusCount % LONG_BREAK_EVERY;
  const todayPercent = Math.min(100, (today.minutes / today.target) * 100);
  const settingsLocked = isActive;

  return (
    <div className="container theme-home" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', textAlign: 'center', position: 'relative', padding: '80px 20px 40px', boxSizing: 'border-box' }}>
      <button className="btn-back" onClick={onBack}>← HOME</button>

      {/* ---- 時間設定 ---- */}
      <div className="preset-row" style={{ opacity: settingsLocked ? 0.4 : 1 }}>
        {Object.entries(PRESETS).map(([key, p]) => (
          <button
            key={key}
            className={`btn-preset ${presetKey === key ? 'active' : ''}`}
            onClick={() => setPresetKey(key)}
            disabled={settingsLocked}
          >
            {p.label}
          </button>
        ))}
      </div>

      {presetKey === 'custom' && (
        <div className="custom-row" style={{ opacity: settingsLocked ? 0.4 : 1 }}>
          <label>
            集中
            <input
              type="number" min="5" max="60" value={customFocus} disabled={settingsLocked}
              onChange={(e) => setCustomFocus(clamp(parseInt(e.target.value, 10) || 5, 5, 60))}
            />
            分
          </label>
          <label>
            休憩
            <input
              type="number" min="1" max="30" value={customShort} disabled={settingsLocked}
              onChange={(e) => setCustomShort(clamp(parseInt(e.target.value, 10) || 1, 1, 30))}
            />
            分
          </label>
          <span style={{ fontSize: '12px', opacity: 0.6 }}>長い休憩 {CUSTOM_LONG_BREAK}分</span>
        </div>
      )}

      {/* ---- モード表示 ---- */}
      <div style={{ marginTop: '20px', marginBottom: '10px' }}>
        <h2 style={{ color: accentColor, letterSpacing: '0.3em', fontSize: '1.2rem', fontFamily: 'monospace', transition: 'color 0.5s', margin: '0 0 10px' }}>
          {MODE_INFO[mode].label}
        </h2>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }} title={`${LONG_BREAK_EVERY}セットごとに長い休憩`}>
          {Array.from({ length: LONG_BREAK_EVERY }).map((_, i) => (
            <span key={i} style={{
              width: '12px', height: '12px', borderRadius: '50%',
              border: `2px solid ${accentColor}`,
              backgroundColor: i < dotsFilled ? accentColor : 'transparent',
              boxShadow: i < dotsFilled ? `0 0 8px ${accentColor}` : 'none',
              transition: 'all 0.3s'
            }} />
          ))}
        </div>
        {DEBUG_MODE && (
          <p style={{ color: '#ffa502', fontFamily: 'monospace', fontSize: '12px', margin: '8px 0 0' }}>
            [DEBUG MODE] 1分＝1秒で動作中
          </p>
        )}
      </div>

      {/* ---- タイマー ---- */}
      <div className="time-display" style={{ textShadow: `0 0 30px ${accentColor}` }}>
        {formatTime()}
      </div>

      <div style={{ width: '600px', maxWidth: '90%', height: '4px', backgroundColor: 'rgba(255, 255, 255, 0.1)', marginBottom: '30px', borderRadius: '2px', overflow: 'hidden', boxShadow: `0 0 10px ${accentColor}33` }}>
        <div style={{ height: '100%', width: `${progressPercent}%`, backgroundColor: accentColor, boxShadow: `0 0 15px ${accentColor}`, transition: 'width 0.25s linear, background-color 0.5s' }}></div>
      </div>

      {/* ---- 教科入力 ---- */}
      {mode === 'focus' && (
        <div style={{ marginBottom: '20px', width: '600px', maxWidth: '90%' }}>
          <input type="text" className="input-subject" placeholder="[ ENTER TARGET SUBJECT ] 例：基本情報、英語..." value={subject} onChange={(e) => setSubject(e.target.value)} disabled={isActive} maxLength={50} />
          {recentSubjects.length > 0 && (
            <div className="subject-chips">
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
            <p style={{ fontSize: '12px', color: '#ffa502', margin: '8px 0 0' }}>
              ※ ボムは{BOMB_MIN_MINUTES}分以上の集中で獲得できます
            </p>
          )}
        </div>
      )}

      {message.text && (
        <p style={{ color: message.isError ? '#ff4757' : '#2ed573', fontFamily: 'monospace', marginTop: 0, marginBottom: '20px' }}>
          {message.text}
        </p>
      )}

      {/* ---- 今日の記録 ---- */}
      <div className="stats-panel" style={{ backgroundColor: `${accentColor}11`, border: `1px solid ${accentColor}33` }}>
        <div>
          <p className="stat-label" style={{ color: accentColor }}>TODAY_FOCUS</p>
          <p className="stat-value">{today.minutes}<span className="stat-unit"> / {today.target}分</span></p>
          <div style={{ width: '140px', height: '4px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden', margin: '6px auto 0' }}>
            <div style={{ height: '100%', width: `${todayPercent}%`, backgroundColor: todayPercent >= 100 ? '#ffa502' : accentColor, transition: 'width 0.5s' }} />
          </div>
        </div>
        <div className="stat-divider" style={{ backgroundColor: `${accentColor}33` }}></div>
        <div>
          <p className="stat-label" style={{ color: accentColor }}>TODAY_SESSIONS</p>
          <p className="stat-value">{today.sessions}</p>
        </div>
        <div className="stat-divider" style={{ backgroundColor: `${accentColor}33` }}></div>
        <div>
          <p className="stat-label" style={{ color: '#ff4757' }}>BOMB_STOCK</p>
          <p className="stat-value" style={{ color: '#ff4757', textShadow: '0 0 10px rgba(255, 71, 87, 0.5)' }}>{bombs}</p>
        </div>
      </div>

      {/* ---- 操作ボタン ---- */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={handleStartPause} className="btn-timer-main" style={{ borderColor: accentColor, backgroundColor: isActive ? 'transparent' : accentColor, color: isActive ? accentColor : '#020617', boxShadow: isActive ? 'none' : `0 0 15px ${accentColor}44` }}>
          {isActive ? 'PAUSE' : 'START'}
        </button>
        <button onClick={handleReset} className="btn-timer-sub">RESET</button>
        {mode !== 'focus' && (
          <button onClick={handleSkipBreak} className="btn-timer-sub">SKIP ▶</button>
        )}
      </div>

      <label className="auto-start">
        <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
        終わったら次を自動でスタート
      </label>
      <p style={{ fontSize: '12px', opacity: 0.4, marginTop: '6px' }}>Space キーでスタート / 一時停止</p>

      <style>{`
        .btn-back { position: absolute; top: 30px; left: 40px; background: transparent; color: #d1d5db; border: none; font-size: 26px; font-weight: 500; cursor: pointer; transition: all 0.3s ease; padding: 10px; letter-spacing: 0.05em; }
        .btn-back:hover { color: white; transform: translateX(-5px); text-shadow: 0 0 10px rgba(255, 255, 255, 0.4); }

        .preset-row { display: flex; gap: 10px; transition: opacity 0.3s; }
        .btn-preset { background: rgba(15, 23, 42, 0.5); color: rgba(255,255,255,0.7); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 4px; font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold; padding: 8px 18px; cursor: pointer; letter-spacing: 0.1em; transition: all 0.2s; }
        .btn-preset:hover:not(:disabled) { border-color: #38bdf8; color: white; }
        .btn-preset.active { background: #38bdf8; color: #020617; border-color: #38bdf8; box-shadow: 0 0 12px rgba(56, 189, 248, 0.5); }
        .btn-preset:disabled { cursor: not-allowed; }

        .custom-row { display: flex; gap: 20px; align-items: center; margin-top: 12px; color: rgba(255,255,255,0.8); font-family: 'Courier New', monospace; flex-wrap: wrap; justify-content: center; }
        .custom-row input { width: 60px; margin: 0 6px; padding: 6px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 4px; color: white; font-size: 16px; text-align: center; }

        .time-display { font-size: 12rem; font-family: 'Courier New', monospace; font-weight: 900; color: white; line-height: 1; margin-bottom: 20px; transition: text-shadow 0.5s; }
        @media (max-width: 700px) { .time-display { font-size: 6rem; } }

        .input-subject { width: 100%; padding: 15px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 4px; color: white; font-family: 'Courier New', monospace; font-size: 1.2rem; text-align: center; letter-spacing: 0.1em; outline: none; transition: all 0.3s; box-sizing: border-box; }
        .input-subject:focus { border-color: #38bdf8; box-shadow: 0 0 15px rgba(56, 189, 248, 0.4); }
        .input-subject:disabled { opacity: 0.5; cursor: not-allowed; }

        .subject-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 10px; }
        .chip { background: transparent; color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.25); border-radius: 999px; padding: 4px 14px; font-size: 13px; cursor: pointer; transition: all 0.2s; }
        .chip:hover:not(:disabled) { border-color: #38bdf8; color: white; }
        .chip.active { border-color: #38bdf8; color: #38bdf8; background: rgba(56, 189, 248, 0.1); }
        .chip:disabled { opacity: 0.4; cursor: not-allowed; }

        .stats-panel { display: flex; gap: 32px; margin-bottom: 30px; padding: 20px 36px; border-radius: 4px; transition: all 0.5s; flex-wrap: wrap; justify-content: center; }
        .stat-label { font-size: 12px; margin: 0; transition: color 0.5s; }
        .stat-value { font-size: 2rem; margin: 0; font-weight: bold; color: white; }
        .stat-unit { font-size: 0.9rem; opacity: 0.6; font-weight: normal; }
        .stat-divider { width: 1px; }

        .btn-timer-main { width: 280px; padding: 20px; font-family: 'Courier New', monospace; font-size: 1.5rem; font-weight: 900; cursor: pointer; transition: all 0.3s; letter-spacing: 0.2em; }
        .btn-timer-main:hover { transform: scale(1.02); }
        .btn-timer-sub { width: 140px; background: transparent; color: rgba(255, 255, 255, 0.6); border: 1px solid rgba(255,255,255,0.3); font-family: 'Courier New', monospace; font-size: 1rem; font-weight: bold; cursor: pointer; transition: all 0.3s; letter-spacing: 0.1em; }
        .btn-timer-sub:hover { background: rgba(255,255,255,0.1); color: white; border-color: white; }

        .auto-start { margin-top: 24px; color: rgba(255,255,255,0.7); font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .auto-start input { width: 16px; height: 16px; accent-color: #38bdf8; cursor: pointer; }
      `}</style>
    </div>
  );
}