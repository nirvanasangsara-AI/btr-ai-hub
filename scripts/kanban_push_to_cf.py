#!/usr/bin/env python3
"""
kanban_push_to_cf.py
Hermes Kanban DB → CF KV 푸시 스크립트
- cron 또는 Hermes heartbeat cron으로 실행
- ~/.hermes/kanban.db 읽어 running/todo/ready/blocked 태스크만 추출
- POST /api/kanban-push → CF KV(HUB_CONFIG) 저장

필요 환경 변수:
  CF_ADMIN_PASSWORD  (ADMIN_PASSWORD와 동일)
  CF_ADMIN_SECRET    (ADMIN_SECRET와 동일)
  BTR_HUB_URL        (default: https://btr-ai-hub.pages.dev)
"""

import json
import os
import sqlite3
import sys
import base64
from datetime import datetime, timezone
from pathlib import Path
import urllib.request
import urllib.error

DB_PATH = Path.home() / ".hermes" / "kanban.db"
HUB_URL = os.getenv("BTR_HUB_URL", "https://btr-ai-hub.pages.dev")
ENDPOINT = f"{HUB_URL}/api/kanban-push"

def get_token():
    pwd = os.getenv("CF_ADMIN_PASSWORD", "")
    sec = os.getenv("CF_ADMIN_SECRET", "")
    if not pwd or not sec:
        # Try keychain (macOS)
        try:
            import subprocess
            pwd = subprocess.check_output(
                ["security", "find-generic-password", "-s", "btr-cf-admin-password", "-w"],
                stderr=subprocess.DEVNULL
            ).decode().strip()
            sec = subprocess.check_output(
                ["security", "find-generic-password", "-s", "btr-cf-admin-secret", "-w"],
                stderr=subprocess.DEVNULL
            ).decode().strip()
        except Exception:
            pass
    if not pwd or not sec:
        print("ERROR: CF_ADMIN_PASSWORD/CF_ADMIN_SECRET 미설정", file=sys.stderr)
        sys.exit(1)
    return base64.b64encode(f"{pwd}:{sec}".encode()).decode()

def fetch_tasks():
    if not DB_PATH.exists():
        print(f"ERROR: {DB_PATH} 없음", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # 활성 태스크: running/todo/ready/blocked (done은 최근 2h만)
    cur.execute("""
        SELECT
            t.id, t.title, t.assignee, t.status, t.priority,
            t.created_at, t.started_at, t.completed_at,
            r.summary, r.outcome
        FROM tasks t
        LEFT JOIN runs r ON r.id = t.current_run_id
        WHERE t.status IN ('running','todo','ready','blocked')
           OR (t.status = 'done' AND t.completed_at > unixepoch('now') - 7200)
        ORDER BY t.priority DESC, t.started_at DESC
        LIMIT 80
    """)
    rows = [dict(r) for r in cur.fetchall()]

    # parent 관계
    cur.execute("""
        SELECT parent_id, child_id FROM task_parents
        WHERE child_id IN ({})
    """.format(",".join("?" * len(rows))), [r["id"] for r in rows])
    parents_map = {}
    for pid, cid in cur.fetchall():
        parents_map.setdefault(cid, []).append(pid)

    conn.close()

    tasks = []
    for r in rows:
        tasks.append({
            "id": r["id"],
            "title": r["title"] or "",
            "assignee": r["assignee"] or "",
            "status": r["status"] or "todo",
            "priority": r["priority"] or 0,
            "started_at": r["started_at"],
            "completed_at": r["completed_at"],
            "summary": (r["summary"] or "")[:200],
            "parents": parents_map.get(r["id"], []),
        })
    return tasks

def push(tasks, token):
    payload = {
        "tasks": tasks,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        ENDPOINT,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Admin-Token": token,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode()
            print(f"OK: {len(tasks)} tasks pushed → {resp.status} {body}")
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    token = get_token()
    tasks = fetch_tasks()
    push(tasks, token)
