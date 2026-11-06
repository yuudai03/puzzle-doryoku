// src/api.js
// バックエンドとの通信をまとめたファイル。
// 各画面は fetch の代わりに authFetch を使うと、ログイン中のトークンが自動でつく。

// APIのURL。デプロイ時は frontend/.env などで REACT_APP_API_BASE を設定する
export const API_BASE = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:5000';

const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUserId';

// ---- ログイン情報の保存（リロードしてもログインしたままにするため） ----
const safeGet = (key) => {
  try { return localStorage.getItem(key); } catch (e) { return null; }
};
const safeSet = (key, value) => {
  try { localStorage.setItem(key, value); } catch (e) { /* 保存できなくても動く */ }
};
const safeRemove = (key) => {
  try { localStorage.removeItem(key); } catch (e) { /* 何もしない */ }
};

export const getToken = () => safeGet(TOKEN_KEY);
export const getSavedUserId = () => safeGet(USER_KEY);

export const saveAuth = (userId, token) => {
  safeSet(TOKEN_KEY, token);
  safeSet(USER_KEY, userId);
};

export const clearAuth = () => {
  safeRemove(TOKEN_KEY);
  safeRemove(USER_KEY);
};

// ---- トークンが無効になったとき（期限切れなど）に呼ぶ処理を App.js から登録する ----
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = handler;
};

// ---- トークン付きの fetch ----
// 使い方は fetch とほぼ同じ。URLは '/api/...' のようにパスだけ渡す。
export async function authFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    ...options,
    headers,
  });

  // 401 = ログインが切れている → ログイン画面に戻す
  if (response.status === 401 && token) {
    let message = 'ログインの有効期限が切れました。もう一度ログインしてください';
    try {
      const data = await response.clone().json();
      if (data && data.message) message = data.message;
    } catch (e) {
      // JSONでなければデフォルトのメッセージ
    }
    clearAuth();
    if (unauthorizedHandler) unauthorizedHandler(message);
  }

  return response;
}
