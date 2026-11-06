import sqlite3
import os
from functools import wraps
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)

# ==========================================
# 認証まわりの設定
# ==========================================
# トークンの署名に使う秘密鍵。本番では必ず環境変数 SECRET_KEY に長いランダム文字列を設定する
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-me')
TOKEN_MAX_AGE = 60 * 60 * 24 * 7  # トークンの有効期限（7日）
token_serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'], salt='auth-token')


def create_token(user_id):
    """ユーザーIDを署名付きのトークンにする（改ざんすると検証に失敗する）"""
    return token_serializer.dumps(user_id)


def login_required(f):
    """リクエストヘッダーの「Authorization: Bearer <トークン>」を検証し、
    正しければ g.user_id にログイン中のユーザーIDを入れてから本体を実行する"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({"status": "error", "message": "ログインが必要です"}), 401

        token = auth_header[len('Bearer '):]
        try:
            user_id = token_serializer.loads(token, max_age=TOKEN_MAX_AGE)
        except SignatureExpired:
            return jsonify({"status": "error", "message": "ログインの有効期限が切れました。もう一度ログインしてください"}), 401
        except BadSignature:
            return jsonify({"status": "error", "message": "トークンが不正です"}), 401

        # 削除されたユーザーのトークンは使えないようにする
        conn = get_db_connection()
        user = conn.execute('SELECT id FROM users WHERE id = ?', (user_id,)).fetchone()
        conn.close()
        if not user:
            return jsonify({"status": "error", "message": "ユーザーが見つかりません"}), 401

        g.user_id = user_id
        return f(*args, **kwargs)
    return wrapper

# ゲームバランス用の設定値
DAILY_TARGET_MINUTES = 100  # デイリーミッションの目標時間（分）
BOMB_MIN_MINUTES = 25       # この分数以上の集中でボムを1個獲得（短い設定でボムを量産できないように）

# データベースのパス設定
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'hackathon.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ==========================================
# 1. 認証機能 (Auth API)
# ==========================================

# 新規登録
@app.route('/api/auth/register', methods=['POST'])
def register_user():
    data = request.get_json(silent=True) or {}
    user_id = (data.get('user_id') or '').strip()
    password = data.get('password')

    if not user_id or not password:
        return jsonify({"status": "error", "message": "user_idとpasswordは必須です"}), 400
    if len(user_id) > 20:
        return jsonify({"status": "error", "message": "ユーザーIDは20文字以内にしてください"}), 400
    if len(password) < 4:
        return jsonify({"status": "error", "message": "パスワードは4文字以上にしてください"}), 400

    hashed_password = generate_password_hash(password)
    conn = get_db_connection()
    c = conn.cursor()

    try:
        c.execute('INSERT INTO users (id, password, study_minutes, bomb_count) VALUES (?, ?, 0, 0)', (user_id, hashed_password))
        conn.commit()
        return jsonify({
            "status": "success",
            "message": "登録が完了しました！",
            "user_id": user_id,
            "token": create_token(user_id)
        }), 201
    except sqlite3.IntegrityError:
        return jsonify({"status": "error", "message": "そのユーザーIDは既に使われています"}), 409
    finally:
        conn.close()

# ログイン
@app.route('/api/auth/login', methods=['POST'])
def login_user():
    data = request.get_json(silent=True) or {}
    user_id = (data.get('user_id') or '').strip()
    password = data.get('password')

    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    user = c.fetchone()
    conn.close()

    if user and check_password_hash(user['password'], password):
        return jsonify({
            "status": "success",
            "message": "ログイン成功",
            "user_id": user['id'],
            "token": create_token(user['id'])
        })
    else:
        return jsonify({"status": "error", "message": "IDまたはパスワードが間違っています"}), 401

# ログイン中のユーザー確認（保存しておいたトークンがまだ使えるか調べる）
@app.route('/api/auth/me', methods=['GET'])
@login_required
def get_me():
    return jsonify({"status": "success", "user_id": g.user_id})

# ==========================================
# 2. ユーザー＆アイテム機能 (User API)
# ==========================================

# ポモドーロ完了通知（ボムと勉強時間を追加＋教材ごとの記録）
@app.route('/api/pomodoro/finish', methods=['POST'])
@login_required
def finish_pomodoro():
    data = request.get_json(silent=True) or {}
    user_id = g.user_id  # トークンから特定したログイン中のユーザー
    study_minutes = data.get('study_minutes', 25)
    subject_name = (data.get('subject_name') or 'その他').strip()[:50] or 'その他'

    if not user_id:
        return jsonify({"status": "error", "message": "user_idは必須です"}), 400

    # 勉強時間は 1〜60分の整数だけ受け付ける（不正な値で時間やボムを稼げないように）
    if not isinstance(study_minutes, int) or isinstance(study_minutes, bool) or not (1 <= study_minutes <= 60):
        return jsonify({"status": "error", "message": "study_minutesは1〜60の整数で指定してください"}), 400

    conn = get_db_connection()
    c = conn.cursor()

    c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    user = c.fetchone()

    if not user:
        conn.close()
        return jsonify({"status": "error", "message": "ユーザーが見つかりません"}), 404

    # 1. usersテーブルの累計時間だけを増やす（ボムはここで増やさない）
    c.execute('''
        UPDATE users 
        SET study_minutes = COALESCE(study_minutes, 0) + ?
        WHERE id = ?
    ''', (study_minutes, user_id))
    
    # 2. study_logsテーブルに学習記録を追加
    c.execute('''
        INSERT INTO study_logs (user_id, subject_name, study_minutes)
        VALUES (?, ?, ?)
    ''', (user_id, subject_name, study_minutes))

    # 🌟 3. 25分以上の集中なら、bombsテーブルに「3日後の有効期限付き」でボムを追加！
    bomb_given = 1 if study_minutes >= BOMB_MIN_MINUTES else 0
    if bomb_given:
        c.execute('''
            INSERT INTO bombs (user_id, expires_at) 
            VALUES (?, datetime('now', 'localtime', '+3 days'))
        ''', (user_id,))

    conn.commit()

    # 🌟 4. 最新の「有効なボムの数」を計算してフロントに返す
    c.execute('''
        SELECT COUNT(*) as valid_bombs FROM bombs 
        WHERE user_id = ? AND expires_at > datetime('now', 'localtime')
    ''', (user_id,))
    updated_user = c.fetchone()
    current_bombs = updated_user['valid_bombs'] if updated_user else 0
    conn.close()

    return jsonify({
        "status": "success",
        "reward": {
            "item_type": "bomb",
            "amount_given": bomb_given,
            "total_bombs_owned": current_bombs
        }
    })

# 今日の学習記録（タイマー画面用）：今日の集中時間・セット数・最近使った教科・ボム数
@app.route('/api/pomodoro/today', methods=['GET'])
@login_required
def get_today_summary():
    user_id = g.user_id  # トークンから特定したログイン中のユーザー
    if not user_id:
        return jsonify({"status": "error", "message": "user_idは必須です"}), 400

    conn = get_db_connection()
    c = conn.cursor()

    # 今日の合計時間とセット数
    c.execute('''
        SELECT COUNT(*) as sessions, COALESCE(SUM(study_minutes), 0) as minutes
        FROM study_logs
        WHERE user_id = ? AND date(created_at, 'localtime') = date('now', 'localtime')
    ''', (user_id,))
    today = c.fetchone()

    # 最近使った教科（新しい順に最大6件、未入力の NO_TARGET は除く）
    c.execute('''
        SELECT subject_name, MAX(id) as last_id
        FROM study_logs
        WHERE user_id = ? AND subject_name IS NOT NULL AND subject_name != 'NO_TARGET'
        GROUP BY subject_name
        ORDER BY last_id DESC
        LIMIT 6
    ''', (user_id,))
    recent_subjects = [row['subject_name'] for row in c.fetchall()]

    # 有効なボム数
    c.execute('''
        SELECT COUNT(*) as valid_bombs FROM bombs
        WHERE user_id = ? AND expires_at > datetime('now', 'localtime')
    ''', (user_id,))
    bombs = c.fetchone()['valid_bombs']

    conn.close()

    return jsonify({
        "status": "success",
        "today_minutes": today['minutes'],
        "today_sessions": today['sessions'],
        "target_minutes": DAILY_TARGET_MINUTES,
        "recent_subjects": recent_subjects,
        "bomb_count": bombs,
        "bomb_min_minutes": BOMB_MIN_MINUTES
    })

# アイテム（ボム）所持数の確認
@app.route('/api/user/inventory', methods=['GET'])
@login_required
def get_inventory():
    user_id = g.user_id  # トークンから特定したログイン中のユーザー
    
    if not user_id:
        return jsonify({"status": "error", "message": "user_idは必須です"}), 400

    conn = get_db_connection()
    c = conn.cursor()
    
    # 🌟 bombsテーブルから「有効期限内のボム」だけを数える
    c.execute('''
        SELECT COUNT(*) as valid_bombs FROM bombs 
        WHERE user_id = ? AND expires_at > datetime('now', 'localtime')
    ''', (user_id,))
    bomb_record = c.fetchone()
    current_bombs = bomb_record['valid_bombs'] if bomb_record else 0
    
    conn.close()

    return jsonify({
        "status": "success",
        "user_id": user_id,
        "items": {"bomb": current_bombs} # 🌟 計算した最新のボム数を返す！
    })

# プロフィール情報（累計、ボム、ハイスコア、教材別データ）の取得
@app.route('/api/user/profile', methods=['GET'])
@login_required
def get_profile():
    # ?user_id=xxx があればその人のプロフィール（ランキングから見る用）、なければ自分
    user_id = request.args.get('user_id') or g.user_id

    if not user_id:
        return jsonify({"status": "error", "message": "user_idは必須です"}), 400

    conn = get_db_connection()
    c = conn.cursor()
    
    # 1. ユーザーの基本情報（累計時間）※古いbomb_countはもう見ません
    c.execute('SELECT study_minutes FROM users WHERE id = ?', (user_id,))
    user = c.fetchone()

    if not user:
        conn.close()
        return jsonify({"status": "error", "message": "ユーザーが見つかりません"}), 404

    # 🌟 2. bombsテーブルから「有効期限内のボム」だけを数える
    c.execute('''
        SELECT COUNT(*) as valid_bombs FROM bombs 
        WHERE user_id = ? AND expires_at > datetime('now', 'localtime')
    ''', (user_id,))
    bomb_record = c.fetchone()
    current_bombs = bomb_record['valid_bombs'] if bomb_record else 0

    # 3. ハイスコアを取得
    c.execute('SELECT MAX(score) as max_score FROM scores WHERE user_id = ?', (user_id,))
    score_record = c.fetchone()
    high_score = score_record['max_score'] if score_record['max_score'] else 0

    # 4. 教材(subject_name)ごとの合計勉強時間を取得
    c.execute('''
        SELECT subject_name, SUM(study_minutes) as total_minutes
        FROM study_logs
        WHERE user_id = ?
        GROUP BY subject_name
        ORDER BY total_minutes DESC
    ''', (user_id,))
    logs = c.fetchall()
    study_stats = [{"subject": row["subject_name"], "minutes": row["total_minutes"]} for row in logs]

    conn.close()

    return jsonify({
        "status": "success",
        "user_id": user_id,
        "study_minutes": user['study_minutes'] or 0,
        "bomb_count": current_bombs,      # 🌟 計算した最新のボム数を返す！
        "high_score": high_score,
        "study_stats": study_stats
    })

# ==========================================
# 3. ゲーム＆ランキング機能 (Game API)
# ==========================================

# ゲーム終了時のスコア送信
@app.route('/api/game/score', methods=['POST'])
@login_required
def submit_score():
    data = request.get_json(silent=True) or {}
    user_id = g.user_id  # トークンから特定したログイン中のユーザー
    score = data.get('score', 0)

    if not user_id:
        return jsonify({"status": "error", "message": "user_idは必須です"}), 400
    if not isinstance(score, int) or isinstance(score, bool) or score < 0:
        return jsonify({"status": "error", "message": "scoreは0以上の整数で指定してください"}), 400

    conn = get_db_connection()
    c = conn.cursor()
    c.execute('INSERT INTO scores (user_id, score) VALUES (?, ?)', (user_id, score))
    conn.commit()

    c.execute('SELECT MAX(score) as max_score FROM scores WHERE user_id = ?', (user_id,))
    max_record = c.fetchone()
    conn.close()

    is_high_score = (max_record['max_score'] == score)

    return jsonify({
        "status": "success",
        "saved_score": score,
        "is_high_score": is_high_score
    })

# ⑦ ランキング取得（トップ10：1人1つの最高スコアのみ！）
@app.route('/api/game/ranking', methods=['GET'])
def get_ranking():
    conn = get_db_connection()
    c = conn.cursor()
    
    # 🌟 修正：GROUP BY でユーザーをまとめ、MAX() で最高スコアだけを抽出！
    c.execute('''
        SELECT user_id, MAX(score) as score, created_at 
        FROM scores 
        GROUP BY user_id 
        ORDER BY score DESC 
        LIMIT 10
    ''')
    ranking_data = c.fetchall()
    conn.close()

    ranking_list = []
    for rank, row in enumerate(ranking_data, start=1):
        ranking_list.append({
            "rank": rank,
            "user_id": row["user_id"],
            "score": row["score"], # SQL側で "as score" と名付けたので、今まで通りこれで取れます！
            "date": row["created_at"]
        })

    return jsonify({
        "status": "success",
        "ranking": ranking_list
    })

# ==========================================
# 4. フレンド機能 (Friend API)
# ==========================================

# フレンド申請を送る
@app.route('/api/friends/request', methods=['POST'])
@login_required
def request_friend():
    data = request.get_json(silent=True) or {}
    user_id = g.user_id  # トークンから特定したログイン中のユーザー
    friend_id = data.get('friend_id')   

    if not user_id or not friend_id:
        return jsonify({"status": "error", "message": "user_idとfriend_idは必須です"}), 400
    if user_id == friend_id:
        return jsonify({"status": "error", "message": "自分自身には申請できません"}), 400

    conn = get_db_connection()
    c = conn.cursor()

    c.execute('SELECT id FROM users WHERE id = ?', (friend_id,))
    if not c.fetchone():
        conn.close()
        return jsonify({"status": "error", "message": "そのIDのユーザーは存在しません"}), 404

    try:
        c.execute("INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, 'pending')", (user_id, friend_id))
        conn.commit()
        return jsonify({"status": "success", "message": f"{friend_id}にフレンド申請を送りました！"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"status": "error", "message": "すでに申請済み、またはフレンドです"}), 409
    finally:
        conn.close()

# フレンド申請を承認する
@app.route('/api/friends/accept', methods=['POST'])
@login_required
def accept_friend():
    data = request.get_json(silent=True) or {}
    user_id = g.user_id  # トークンから特定したログイン中のユーザー
    friend_id = data.get('friend_id')   

    conn = get_db_connection()
    c = conn.cursor()

    c.execute('''
        UPDATE friends 
        SET status = 'accepted' 
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
    ''', (friend_id, user_id)) 

    if c.rowcount == 0:
        conn.close()
        return jsonify({"status": "error", "message": "承認できる申請が見つかりません"}), 404

    try:
        c.execute("INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')", (user_id, friend_id))
        conn.commit()
    except sqlite3.IntegrityError:
        pass
    
    conn.close()
    return jsonify({"status": "success", "message": f"{friend_id}の申請を承認しました！"})

# フレンド一覧と承認待ち一覧の取得
@app.route('/api/friends/list', methods=['GET'])
@login_required
def get_friends():
    user_id = g.user_id  # トークンから特定したログイン中のユーザー
    
    conn = get_db_connection()
    c = conn.cursor()
    
    # 承認済みのフレンド一覧
    c.execute('''
        SELECT f.friend_id, u.study_minutes 
        FROM friends f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ? AND f.status = 'accepted'
    ''', (user_id,))
    accepted_friends = [{"friend_id": row["friend_id"], "study_minutes": row["study_minutes"]} for row in c.fetchall()]
    
    # 承認待ちの申請一覧
    c.execute('''
        SELECT f.user_id as requester_id, u.study_minutes 
        FROM friends f
        JOIN users u ON f.user_id = u.id
        WHERE f.friend_id = ? AND f.status = 'pending'
    ''', (user_id,))
    pending_requests = [{"requester_id": row["requester_id"], "study_minutes": row["study_minutes"]} for row in c.fetchall()]
    
    conn.close()

    return jsonify({
        "status": "success",
        "user_id": user_id,
        "friends": accepted_friends,
        "pending_requests": pending_requests
    })

# フレンドを解除する（お互いの登録を削除）
@app.route('/api/friends/remove', methods=['POST'])
@login_required
def remove_friend():
    data = request.get_json(silent=True) or {}
    user_id = g.user_id  # トークンから特定したログイン中のユーザー
    friend_id = data.get('friend_id')

    if not friend_id:
        return jsonify({"status": "error", "message": "friend_idは必須です"}), 400

    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        DELETE FROM friends
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    ''', (user_id, friend_id, friend_id, user_id))
    deleted = c.rowcount
    conn.commit()
    conn.close()

    if deleted == 0:
        return jsonify({"status": "error", "message": "フレンドが見つかりません"}), 404
    return jsonify({"status": "success", "message": f"{friend_id}とのフレンドを解除しました"})

# ボム消費API (POST) - 有効期限対応版
@app.route('/api/game/use_bomb', methods=['POST'])
@login_required
def use_bomb():
    data = request.get_json(silent=True) or {}
    user_id = g.user_id  # トークンから特定したログイン中のユーザー

    if not user_id:
        return jsonify({"status": "error", "message": "user_idは必須です"}), 400

    conn = get_db_connection()
    c = conn.cursor()

    # 🌟 1. 有効期限内のボムの中で、一番期限が近い（古い）ボムのIDを探す
    c.execute('''
        SELECT id FROM bombs 
        WHERE user_id = ? AND expires_at > datetime('now', 'localtime')
        ORDER BY expires_at ASC
        LIMIT 1
    ''', (user_id,))
    oldest_bomb = c.fetchone()

    # ボムがない、または全て期限切れの場合
    if not oldest_bomb:
        conn.close()
        return jsonify({"status": "error", "message": "有効なボムがありません"}), 400

    # 🌟 2. 見つかったボムを1つ削除（消費）する
    c.execute('DELETE FROM bombs WHERE id = ?', (oldest_bomb['id'],))
    conn.commit()

    # 🌟 3. 残りのボムの数を再計算して返す
    c.execute('''
        SELECT COUNT(*) as valid_bombs FROM bombs 
        WHERE user_id = ? AND expires_at > datetime('now', 'localtime')
    ''', (user_id,))
    remaining = c.fetchone()['valid_bombs']
    
    conn.close()

    return jsonify({
        "status": "success",
        "message": "ボムを1つ消費しました",
        "remaining_bombs": remaining
    })

# ==========================================
# 5. ミッション機能 (Missions API)
# ==========================================

# ⑫ デイリーミッション進捗確認API (GET)
@app.route('/api/missions/daily', methods=['GET'])
@login_required
def get_daily_mission():
    user_id = g.user_id  # トークンから特定したログイン中のユーザー
    if not user_id:
        return jsonify({"status": "error", "message": "user_idは必須です"}), 400

    conn = get_db_connection()
    c = conn.cursor()

    # ① 今日の合計勉強時間を計算 (SQLiteの機能で今日の日付を判定)
    c.execute('''
        SELECT SUM(study_minutes) as today_minutes 
        FROM study_logs 
        WHERE user_id = ? AND date(created_at, 'localtime') = date('now', 'localtime')
    ''', (user_id,))
    row = c.fetchone()
    today_minutes = row['today_minutes'] if row['today_minutes'] else 0

    # ② 今日すでに報酬を受け取っているか確認
    c.execute('''
        SELECT * FROM daily_rewards 
        WHERE user_id = ? AND reward_date = date('now', 'localtime')
    ''', (user_id,))
    is_claimed = c.fetchone() is not None

    conn.close()

    target_minutes = DAILY_TARGET_MINUTES

    return jsonify({
        "status": "success",
        "today_minutes": today_minutes,
        "target_minutes": target_minutes,
        "is_cleared": today_minutes >= target_minutes, # 目標達成しているか(True/False)
        "is_claimed": is_claimed                       # 受け取り済みか(True/False)
    })

# ⑬ デイリーミッション報酬受け取りAPI (POST)
@app.route('/api/missions/claim', methods=['POST'])
@login_required
def claim_daily_reward():
    data = request.get_json(silent=True) or {}
    user_id = g.user_id  # トークンから特定したログイン中のユーザー

    if not user_id:
        return jsonify({"status": "error", "message": "user_idは必須です"}), 400

    conn = get_db_connection()
    c = conn.cursor()

    c.execute('''
        SELECT SUM(study_minutes) as today_minutes 
        FROM study_logs 
        WHERE user_id = ? AND date(created_at, 'localtime') = date('now', 'localtime')
    ''', (user_id,))
    row = c.fetchone()
    today_minutes = row['today_minutes'] if row['today_minutes'] else 0

    target_minutes = DAILY_TARGET_MINUTES

    if today_minutes < target_minutes:
        conn.close()
        return jsonify({"status": "error", "message": "まだミッションをクリアしていません"}), 400

    try:
        # 報酬履歴に記録
        c.execute('''
            INSERT INTO daily_rewards (user_id, reward_date) 
            VALUES (?, date('now', 'localtime'))
        ''', (user_id,))
        
        # 🌟 ボムを「3日後の有効期限付き」で追加！
        c.execute('''
            INSERT INTO bombs (user_id, expires_at) 
            VALUES (?, datetime('now', 'localtime', '+3 days'))
        ''', (user_id,))
        
        conn.commit()
        return jsonify({"status": "success", "message": "デイリーミッション達成！ボムを獲得しました！"}), 200
    except sqlite3.IntegrityError:
        return jsonify({"status": "error", "message": "今日の報酬はすでに受け取り済みです"}), 409
    finally:
        conn.close()

if __name__ == '__main__':
    app.run(debug=True, port=5000)