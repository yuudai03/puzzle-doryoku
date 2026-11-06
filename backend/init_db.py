import sqlite3
import os
from werkzeug.security import generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'hackathon.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # ⚠️ 以前はここで DROP TABLE users をしていたため、実行するたびに全ユーザーが消えていた。
    #    CREATE TABLE IF NOT EXISTS だけにして、何度実行してもデータが残るようにした。
    #    完全にリセットしたいときは backend/hackathon.db を削除してから実行する。

    # users テーブル
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            study_minutes INTEGER DEFAULT 0,
            bomb_count INTEGER DEFAULT 0 -- ※過去の互換性のために残しますが、今後は使いません
        )
    ''')

    # scores テーブル
    c.execute('''
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            score INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # friends テーブル
    c.execute('''
        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            friend_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, friend_id)
        )
    ''')

    # study_logs テーブル
    c.execute('''
        CREATE TABLE IF NOT EXISTS study_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            subject_name TEXT,
            study_minutes INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # daily_rewards テーブル
    c.execute('''
        CREATE TABLE IF NOT EXISTS daily_rewards (
            user_id TEXT,
            reward_date TEXT,
            PRIMARY KEY (user_id, reward_date)
        )
    ''')

    # 🌟 新規追加：bombs テーブル（3日で消えるボムを個別に管理！）
    c.execute('''
        CREATE TABLE IF NOT EXISTS bombs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            expires_at TIMESTAMP -- 有効期限（獲得から3日後）
        )
    ''')

    # 初期ユーザー
    test_password = generate_password_hash("password123")
    c.execute('INSERT OR IGNORE INTO users (id, password, study_minutes, bomb_count) VALUES (?, ?, 0, 0)', ("user_123", test_password))

    conn.commit()
    conn.close()
    print(f"データベースの初期化が完了しました！\n保存場所: {DB_PATH}")

if __name__ == '__main__':
    init_db()