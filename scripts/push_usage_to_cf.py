#!/usr/bin/env python3
"""
push_usage_to_cf.py
Claude Code 세션 트랜스크립트 → CF KV(실사용 토큰/비용) 푸시 스크립트

무엇을 하나:
  - ~/.claude/projects/**/*.jsonl 트랜스크립트를 읽어
  - 어시스턴트 메시지의 usage(input/output/cache_read/cache_creation)와 model을 집계
  - (1) usage_chart : 최근 30일 · 모델별 일별 토큰 (리본차트용)
    (2) usage_roi   : 구독별 API 환산가치 (ROI 패널용, Claude Code → anthropic 구독)
  - POST /api/usage-push → CF KV(HUB_CONFIG) 저장

왜:
  정액 구독(Claude Max 등)은 공급사가 토큰 미터를 안 열어주지만,
  Claude Code는 세션 트랜스크립트에 메시지별 usage를 남긴다. 이걸 모아
  "이번 달 실제로 API로 썼다면 얼마?"(API 환산가치)를 계산해 본전 여부를 본다.

필요 환경 변수:
  CF_ADMIN_PASSWORD  (ADMIN_PASSWORD와 동일)
  CF_ADMIN_SECRET    (ADMIN_SECRET와 동일)
  BTR_HUB_URL        (default: https://btr-ai-hub.pages.dev)
  CLAUDE_PROJECTS_DIR(default: ~/.claude/projects)

cron 예: 매시 07분   7 * * * *  /usr/bin/python3 /path/push_usage_to_cf.py
"""

import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
HUB_URL = os.getenv("BTR_HUB_URL", "https://btr-ai-hub.pages.dev")
ENDPOINT = f"{HUB_URL}/api/usage-push"
PROJECTS_DIR = Path(os.getenv("CLAUDE_PROJECTS_DIR", str(Path.home() / ".claude" / "projects")))

# 모델 단가 (USD / 1M 토큰) — 프론트/Function과 동일 기준
MODEL_PRICE = {
    "opus": {"in": 5.0, "out": 25.0},
    "sonnet": {"in": 3.0, "out": 15.0},
    "haiku": {"in": 1.0, "out": 5.0},
    "gpt": {"in": 1.25, "out": 10.0},
    "gemini": {"in": 1.25, "out": 10.0},
    "grok": {"in": 3.0, "out": 15.0},
    "deepseek": {"in": 0.27, "out": 1.10},
}
DEFAULT_PRICE = {"in": 3.0, "out": 15.0}


def price_for(model: str) -> dict:
    m = (model or "").lower()
    for key, p in MODEL_PRICE.items():
        if key in m:
            return p
    return DEFAULT_PRICE


def friendly(model: str) -> str:
    m = (model or "").lower()
    for fam in ("opus", "sonnet", "haiku"):
        if fam in m:
            ver = re.search(r"(\d+)[-.](\d+)", m)
            return f"{fam.capitalize()} {ver.group(1)}.{ver.group(2)}" if ver else fam.capitalize()
    if "gpt" in m:
        return "GPT"
    if "gemini" in m:
        return "Gemini"
    if "grok" in m:
        return "Grok"
    if "deepseek" in m:
        return "DeepSeek"
    return model or "기타"


def to_kst_date(ts: str):
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(KST).date()
    except Exception:
        return None


def extract_usage(obj: dict):
    """트랜스크립트 한 줄에서 (model, usage) 추출. 없으면 None."""
    msg = obj.get("message") if isinstance(obj.get("message"), dict) else None
    role = (msg or {}).get("role") or obj.get("role") or obj.get("type")
    if role != "assistant":
        return None
    usage = (msg or {}).get("usage") or obj.get("usage")
    model = (msg or {}).get("model") or obj.get("model")
    if not isinstance(usage, dict):
        return None
    return model, usage


def collect():
    if not PROJECTS_DIR.exists():
        print(f"ERROR: {PROJECTS_DIR} 없음 (CLAUDE_PROJECTS_DIR 확인)", file=sys.stderr)
        sys.exit(1)

    today = datetime.now(KST).date()
    window_start = today - timedelta(days=29)
    month = datetime.now(KST).strftime("%Y-%m")

    # 리본차트: (date, model) -> tokens(in+out)
    day_model = defaultdict(int)
    # ROI: 이번 달 anthropic 구독으로 합산 (Claude 모델만)
    roi_in = roi_out = roi_cache = 0
    roi_top = defaultdict(int)  # model -> tokens (top_model 판정용)

    files = list(PROJECTS_DIR.glob("**/*.jsonl"))
    for fp in files:
        try:
            with fp.open("r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    ext = extract_usage(obj)
                    if not ext:
                        continue
                    model, usage = ext
                    d = to_kst_date(obj.get("timestamp") or obj.get("ts") or "")
                    if d is None:
                        continue
                    tin = int(usage.get("input_tokens") or 0)
                    tout = int(usage.get("output_tokens") or 0)
                    tcache = int(usage.get("cache_read_input_tokens") or 0)
                    fam = friendly(model)

                    # 리본(최근 30일)
                    if window_start <= d <= today:
                        day_model[(d.strftime("%m-%d"), fam)] += tin + tout

                    # ROI(이번 달, Claude 모델만 → anthropic 구독)
                    if d.strftime("%Y-%m") == month and ("claude" in (model or "").lower() or fam.split()[0] in ("Opus", "Sonnet", "Haiku")):
                        roi_in += tin
                        roi_out += tout
                        roi_cache += tcache
                        roi_top[fam] += tin + tout
        except Exception as e:
            print(f"WARN: {fp} 읽기 실패 {e}", file=sys.stderr)

    # usage_chart 조립 (최근 30일 라벨)
    labels = [(window_start + timedelta(days=i)).strftime("%m-%d") for i in range(30)]
    models = sorted({m for (_, m) in day_model.keys()})
    datasets = []
    for m in models:
        data = [day_model.get((lab, m), 0) for lab in labels]
        if sum(data) > 0:
            datasets.append({"label": m, "data": data, "fill": True})
    usage_chart = {"labels": labels, "datasets": datasets, "_window": "30d", "month": month}

    # usage_roi 조립 (Claude Code = anthropic 구독)
    subscriptions = {}
    if roi_in or roi_out:
        p = price_for("opus")  # Claude 상위가 기준(보수적으로 Opus 단가)
        # 모델 믹스가 있으면 top 모델 단가로 환산
        top_model = max(roi_top, key=roi_top.get) if roi_top else "Opus"
        p = price_for(top_model)
        api_equiv = (roi_in / 1e6) * p["in"] + (roi_out / 1e6) * p["out"] + (roi_cache / 1e6) * p["in"] * 0.1
        subscriptions["anthropic"] = {
            "tokens_in": roi_in,
            "tokens_out": roi_out,
            "cache_read": roi_cache,
            "top_model": top_model,
            "api_equiv_usd": round(api_equiv, 2),
        }
    usage_roi = {"subscriptions": subscriptions, "month": month,
                 "updated": datetime.now(timezone.utc).isoformat()}

    print(f"집계: 파일 {len(files)}개 · 모델 {len(datasets)}개 · "
          f"ROI in={roi_in:,} out={roi_out:,} cache={roi_cache:,}", file=sys.stderr)
    return {"usage_chart": usage_chart, "usage_roi": usage_roi}


def get_token():
    pwd = os.getenv("CF_ADMIN_PASSWORD", "")
    sec = os.getenv("CF_ADMIN_SECRET", "")
    if (not pwd or not sec):
        try:
            import subprocess
            pwd = subprocess.check_output(
                ["security", "find-generic-password", "-s", "btr-cf-admin-password", "-w"],
                stderr=subprocess.DEVNULL).decode().strip()
            sec = subprocess.check_output(
                ["security", "find-generic-password", "-s", "btr-cf-admin-secret", "-w"],
                stderr=subprocess.DEVNULL).decode().strip()
        except Exception:
            pass
    if not pwd or not sec:
        print("ERROR: CF_ADMIN_PASSWORD/CF_ADMIN_SECRET 미설정", file=sys.stderr)
        sys.exit(1)
    return base64.b64encode(f"{pwd}:{sec}".encode()).decode()


def push(payload, token):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        ENDPOINT, data=data,
        headers={"Content-Type": "application/json", "X-Admin-Token": token},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            print(f"OK: {resp.status} {resp.read().decode()}")
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    payload = collect()
    if "--dry-run" in sys.argv:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        sys.exit(0)
    push(payload, get_token())
