// src/components/PuzzleBoard.jsx

import React, { useState, useEffect, useRef } from 'react';
import { authFetch } from '../api';
import {
  createBoard,
  removeBlocks,
  dropBlocks,
  calculateScore,
  activateBomb,
  ROWS,
  COLS
} from '../logic/puzzle';

import { particleEngine } from '../effects/particles';
import { shakeScreen } from '../effects/animations';
import { playSound } from '../effects/audio';

export default function PuzzleBoard({ onBack, userId }) {
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState(0);
  const [bombCount, setBombCount] = useState(0); 
  const [isBombMode, setIsBombMode] = useState(false);

  const [isGameStarted, setIsGameStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60); 
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameOverReason, setGameOverReason] = useState(""); 
  
  const [isPaused, setIsPaused] = useState(false);
  const [hoveredBlock, setHoveredBlock] = useState({ x: -1, y: -1 });

  const [comboCount, setComboCount] = useState(0);
  const comboTimerRef = useRef(null);
  const [popups, setPopups] = useState([]);


  useEffect(() => {
    return () => {
      if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    };
  }, []);

  // 🌟 バックエンド新仕様対応：インベントリ取得
  useEffect(() => {
    particleEngine.init();
    setBoard(createBoard());

    const fetchInventory = async () => {
      if (!userId) return; 
      try {
        const response = await authFetch('/api/user/inventory');
        if (response.ok) {
          const data = await response.json();
          // API側で「有効期限内のボム」だけを計算して返してくれるので、そのままセット！
          // ※バックエンドのJSONの形が data.items.bomb 以外に変わっていても拾えるように安全対策
          const validBombs = data.items?.bomb ?? data.bomb_count ?? data.valid_bombs ?? 0;
          setBombCount(validBombs); 
        }
      } catch (error) {
        console.error('🔌 通信エラー:', error);
      }
    };
    fetchInventory();
  }, [userId]);

  const handleGameOver = (reason) => {
    setGameOverReason(reason);
    setIsGameOver(true);
    if (!userId) return;
    authFetch('/api/game/score', {
      method: 'POST',
      body: JSON.stringify({ score: score }),
    }).catch(() => {});
  };

  const hasAvailableMoves = (currentBoard) => {
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const color = currentBoard[y][x].color;
        if (color === 0 || color === 5 || visited[y][x]) continue;

        let connectedCount = 0;
        const stack = [{ cx: x, cy: y }];
        visited[y][x] = true;

        while (stack.length > 0) {
          const { cx, cy } = stack.pop();
          connectedCount++;

          const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]]; 
          for (const [dx, dy] of directions) {
            const nx = cx + dx;
            const ny = cy + dy;

            if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
              if (!visited[ny][nx] && currentBoard[ny][nx].color === color) {
                visited[ny][nx] = true;
                stack.push({ cx: nx, cy: ny });
              }
            }
          }
        }

        if (connectedCount >= 3) {
          return true;
        }
      }
    }
    return false; 
  };

  useEffect(() => {
    if (isGameStarted && timeLeft > 0 && !isGameOver && !isPaused) {
      const timerId = setInterval(() => setTimeLeft((t) => t - 1), 1000);
      return () => clearInterval(timerId);
    } else if (isGameStarted && timeLeft === 0 && !isGameOver) {
      handleGameOver("TIME UP!");
    }
  }, [isGameStarted, timeLeft, isGameOver, isPaused]);

  useEffect(() => {
    if (isGameStarted && !isGameOver && board.length > 0) {
      const canMove = hasAvailableMoves(board);
      if (!canMove && bombCount <= 0) {
        handleGameOver("GAME OVER!");
      }
    }
  }, [board, bombCount, isGameStarted, isGameOver]);

  useEffect(() => {
    if (!isGameStarted || isGameOver || isPaused) return;

    const ROCK_INTERVAL_MS = 4000; 

    const rockInterval = setInterval(() => {
      setBoard(prevBoard => {
        const newBoard = prevBoard.map(row => row.map(block => ({ ...block })));
        
        const validTargets = [];
        for (let y = 0; y < newBoard.length; y++) {
          for (let x = 0; x < newBoard[y].length; x++) {
            if (newBoard[y][x].color >= 1 && newBoard[y][x].color <= 4) {
              validTargets.push({ x, y });
            }
          }
        }

        if (validTargets.length > 0) {
          const rand = validTargets[Math.floor(Math.random() * validTargets.length)];
          newBoard[rand.y][rand.x].color = 5; 
          playSound('bomb'); 
          shakeScreen(false); 
        }
        return newBoard;
      });
    }, ROCK_INTERVAL_MS);

    return () => clearInterval(rockInterval);
  }, [isGameStarted, isGameOver, isPaused]);


  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleBlockClick = (e, x, y) => {
    if (!isGameStarted || !board || board.length === 0 || isGameOver || isPaused) return;
    if (!isBombMode && (board[y][x].color === 0 || board[y][x].color === 5)) return; 

    const targetColor = getBlockColor(board[y][x].color);
    const wasBombAction = isBombMode;

    let resultBoard;
    let removedCount = 0;
    let usedBombThisTurn = false; 

    if (isBombMode) {
      const result = activateBomb(board, x, y);
      resultBoard = result.newBoard;
      removedCount = result.removedCount;
      usedBombThisTurn = true; 
      
      setBombCount(prev => prev - 1);
      setIsBombMode(false);
      setHoveredBlock({ x: -1, y: -1 });

      // 🌟 バックエンド新仕様対応：ボム消費API
      // APIを叩くだけで、裏側で勝手に「一番古いボム」から消費してくれます！フロントは楽チン！
      authFetch('/api/game/use_bomb', {
        method: 'POST'
      }).catch(err => console.error("💣 ボム消費エラー:", err));

    } else {
      const result = removeBlocks(board, x, y);
      resultBoard = result.newBoard;
      removedCount = result.removedCount;
    }

    if (removedCount > 0) {
      let earnedScore = calculateScore(removedCount, comboCount);
      
      if (usedBombThisTurn) {
        earnedScore *= 2;
      }
      
      setScore(prevScore => prevScore + earnedScore);

      const rect = e.target.getBoundingClientRect();
      const clickX = rect.left + rect.width / 2;
      const clickY = rect.top + rect.height / 2;

      if (wasBombAction) {
        playSound('bomb'); 
        shakeScreen(true); 
        particleEngine.emit(clickX, clickY, targetColor, true); 
      } else {
        playSound('pop'); 
        shakeScreen(false); 
        particleEngine.emit(clickX, clickY, targetColor, false); 
      }

      const popupId = Date.now() + Math.random();
      setPopups(prev => [...prev, {
        id: popupId,
        x: x * 56 + 25, 
        y: y * 56 + 25, 
        count: removedCount,
        color: targetColor === 'transparent' ? '#ffffff' : targetColor
      }]);

      setTimeout(() => {
        setPopups(prev => prev.filter(p => p.id !== popupId));
      }, 800);

      setBoard(resultBoard);

      setComboCount(prev => prev + 1);
      if (comboTimerRef.current) {
        clearTimeout(comboTimerRef.current);
      }
      comboTimerRef.current = setTimeout(() => {
        setComboCount(0); 
      }, 2000);
      
      setTimeout(() => {
        const droppedBoard = dropBlocks(resultBoard);
        setBoard(droppedBoard);
      }, 250); 
    }
  };

  const getBlockColor = (value) => {
    switch (value) {
      case 1: return '#E24B4A';
      case 2: return '#378ADD';
      case 3: return '#1D9E75';
      case 4: return '#EF9F27';
      case 5: return '#B4B2A9'; 
      default: return 'transparent';
    }
  };

  const currentMultiplier = Math.min(1 + (comboCount * 0.2), 5.0).toFixed(1);

  if (board.length === 0) return null;

  const canUseBomb = isGameStarted && bombCount > 0 && !isGameOver && !isPaused;

  return (
    <div className="page puzzle-page">
      <style>
        {`
          @keyframes floatUpFade {
            0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            50% { transform: translate(-50%, -100%) scale(1.3); }
            100% { opacity: 0; transform: translate(-50%, -150%) scale(1); }
          }
        `}
      </style>

      <div className="page-header" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-ghost btn-back" onClick={onBack}>← ホーム</button>
        {isGameStarted && !isGameOver && (
          <button className="btn btn-sm" onClick={() => setIsPaused(true)}>一時停止</button>
        )}
      </div>

      {/* ---- スコアなど ---- */}
      <div className="puzzle-stats">
        <div className="stat">
          <p className="stat-label">残り時間</p>
          <p className="stat-value" style={{ color: timeLeft <= 10 ? 'var(--danger)' : 'var(--text)' }}>{formatTime(timeLeft)}</p>
        </div>
        <div className="stat">
          <p className="stat-label">スコア</p>
          <p className="stat-value">{score.toLocaleString()}</p>
        </div>
        <div className="stat">
          <p className="stat-label">ボム（有効期限内）</p>
          <p className="stat-value" style={{ color: 'var(--bomb)' }}>{bombCount}<span className="stat-unit">個</span></p>
        </div>
      </div>

      <div className="puzzle-combo" style={{ visibility: comboCount > 0 ? 'visible' : 'hidden' }}>
        <span style={{ fontWeight: 700 }}>{comboCount} コンボ</span>
        <span className="badge" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}>×{currentMultiplier}</span>
      </div>

      {/* ---- 盤面 ---- */}
      <div className="puzzle-board" style={{ opacity: isGameOver || isPaused ? 0.35 : 1 }}>
        <div className="puzzle-board-inner game-container">
          {board.map((row, y) =>
            row.map((block, x) => {
              const isHoveredBombRange = isBombMode &&
                                         hoveredBlock.x !== -1 && hoveredBlock.y !== -1 &&
                                         Math.abs(hoveredBlock.x - x) <= 1 &&
                                         Math.abs(hoveredBlock.y - y) <= 1;
              const isActiveHover = isHoveredBombRange && block.color !== 0 && !isGameOver && !isPaused;

              return (
                <div
                  key={block.id}
                  onClick={(e) => handleBlockClick(e, x, y)}
                  onMouseEnter={() => isBombMode && setHoveredBlock({ x, y })}
                  onMouseLeave={() => isBombMode && setHoveredBlock({ x: -1, y: -1 })}
                  className="puzzle-block"
                  style={{
                    left: `${x * 56}px`,
                    top: `${y * 56}px`,
                    backgroundColor: getBlockColor(block.color),
                    cursor: block.color === 0 || block.color === 5 || isGameOver || !isGameStarted || isPaused ? 'default' : (isBombMode ? 'crosshair' : 'pointer'),
                    opacity: block.color === 0 ? 0 : (isBombMode ? (isHoveredBombRange ? 1 : 0.35) : 1),
                    transform: block.color === 0 ? 'scale(0)' : (isActiveHover ? 'scale(1.06)' : 'scale(1)'),
                    boxShadow: isActiveHover
                      ? '0 0 0 3px #2C2C2A'
                      : (block.color !== 0 && block.color !== 5 ? 'inset 0 -4px 0 rgba(0,0,0,0.12)' : 'none'),
                    zIndex: isHoveredBombRange ? 2 : 1,
                  }}
                >
                  {block.color === 5 && <span style={{ fontSize: '24px' }}>🪨</span>}
                </div>
              );
            })
          )}

          {popups.map(popup => (
            <div key={popup.id} className="puzzle-popup" style={{
              left: `${popup.x}px`,
              top: `${popup.y}px`,
              color: popup.color,
            }}>
              +{popup.count}
            </div>
          ))}
        </div>
      </div>

      {/* ---- ボムボタン ---- */}
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <button
          onClick={() => {
            if (canUseBomb) {
              setIsBombMode(!isBombMode);
              if (isBombMode) setHoveredBlock({ x: -1, y: -1 });
            }
          }}
          disabled={!canUseBomb}
          className="btn btn-lg"
          style={{
            minWidth: '240px',
            background: isBombMode ? 'var(--bomb)' : 'var(--surface)',
            borderColor: 'var(--bomb)',
            color: isBombMode ? '#fff' : 'var(--bomb)',
            fontWeight: 700,
          }}
        >
          {isBombMode ? '使う場所をタップ（もう一度押すとキャンセル）' : `ボムを使う（残り${bombCount}個）`}
        </button>
        <p className="text-3 small" style={{ marginTop: '10px' }}>
          同じ色が3つ以上つながったブロックをタップで消せます。岩はボムでしか壊せません。
        </p>
      </div>

      {/* ---- スタート ---- */}
      {!isGameStarted && !isGameOver && (
        <div className="modal-overlay">
          <div className="modal" style={{ textAlign: 'center' }}>
            <h2 className="page-title" style={{ marginBottom: '8px' }}>パズル</h2>
            <p className="text-2" style={{ margin: '0 0 20px' }}>
              制限時間は60秒。ボムは {bombCount}個 持っています。
            </p>
            <button onClick={() => setIsGameStarted(true)} className="btn btn-primary btn-lg btn-block">スタート</button>
            <button onClick={onBack} className="btn btn-ghost btn-block" style={{ marginTop: '8px' }}>ホームへ戻る</button>
          </div>
        </div>
      )}

      {/* ---- 一時停止 ---- */}
      {isPaused && (
        <div className="modal-overlay">
          <div className="modal" style={{ textAlign: 'center' }}>
            <h2 className="page-title" style={{ marginBottom: '20px' }}>一時停止中</h2>
            <button onClick={() => setIsPaused(false)} className="btn btn-primary btn-lg btn-block">再開する</button>
            <button onClick={onBack} className="btn btn-ghost btn-block" style={{ marginTop: '8px' }}>ホームへ戻る</button>
          </div>
        </div>
      )}

      {/* ---- 終了 ---- */}
      {isGameOver && (
        <div className="modal-overlay">
          <div className="modal" style={{ textAlign: 'center' }}>
            <p className="text-2" style={{ margin: 0 }}>
              {gameOverReason === 'TIME UP!' ? '時間切れ' : '消せるブロックがなくなりました'}
            </p>
            <p className="text-3 small" style={{ margin: '16px 0 0' }}>スコア</p>
            <p className="num" style={{ fontSize: '3rem', fontWeight: 700, margin: '0 0 20px', lineHeight: 1.2 }}>
              {score.toLocaleString()}
            </p>
            <button onClick={onBack} className="btn btn-primary btn-lg btn-block">ホームへ戻る</button>
          </div>
        </div>
      )}

      <style>{`
        .puzzle-page {
          max-width: 560px;
        }
        .puzzle-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .puzzle-combo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 32px;
          margin: 10px 0;
          color: var(--gold);
        }
        .puzzle-board {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 14px;
          width: fit-content;
          margin: 0 auto;
          transition: opacity 0.3s;
        }
        .puzzle-board-inner {
          position: relative;
          width: 442px;
          height: 442px;
        }
        .puzzle-block {
          position: absolute;
          width: 50px;
          height: 50px;
          border-radius: 10px;
          display: flex;
          justify-content: center;
          align-items: center;
          transition: top 0.4s cubic-bezier(0.25, 1, 0.5, 1), left 0.4s ease, transform 0.2s ease, opacity 0.2s ease, box-shadow 0.15s;
        }
        .puzzle-popup {
          position: absolute;
          pointer-events: none;
          z-index: 10;
          font-size: 30px;
          font-weight: 700;
          text-shadow: 0 0 4px #fff, 0 0 8px #fff;
          animation: floatUpFade 0.8s ease-out forwards;
        }
        @media (max-width: 520px) {
          .puzzle-board { transform: scale(0.72); transform-origin: top center; margin-bottom: -125px; }
        }
      `}</style>
    </div>
  );
}
