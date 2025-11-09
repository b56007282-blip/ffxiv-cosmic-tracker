#!/usr/bin/env python3
"""
FFXIV 宇宙探索进度爬虫（Python 版）
功能与 Node 版完全一致：
1. 清旧 *-changes.json
2. 对比上一周期快照
3. 生成历史快照 & 变化日志并复制到 public
4. GMT+8 时间
5. lastUpdate 强制截断为 xx:00:00 或 xx:30:00
"""
import asyncio
import aiohttp
import json
import re
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional

# ---------- 目录与工具 ----------
REPO_ROOT = Path(__file__).resolve().parent.parent
HISTORY_DIR = REPO_ROOT / "data" / "history"
PUBLIC_DIR = REPO_ROOT / "public"
PUBLIC_FILE = PUBLIC_DIR / "data.json"
HISTORY_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

def now8() -> datetime:
    return datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8)))

def fmt8(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")

def round_to_00_or_30(dt: datetime) -> datetime:
    """截断到最近的 00 分或 30 分"""
    return dt.replace(minute=(dt.minute // 30) * 30, second=0, microsecond=0)

# ---------- 国服 ----------
async def fetch_cn() -> List[Dict[str, Any]]:
    url = "https://ff14act.web.sdo.com/api/cosmicData/getCosmicData"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    params = {"t": int(datetime.now().timestamp() * 1000)}
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, headers=headers, params=params, timeout=15) as resp:
                data = await resp.json()
                if data.get("code") != 10000 or not isinstance(data.get("data"), list) or not data["data"]:
                    return []
                last_update_rounded = round_to_00_or_30(now8())
                return [
                    {
                        "region": item.get("area_name") or "国服",
                        "server": item.get("group_name") or "未知服务器",
                        "progress": min(max(int(item.get("ProgressRate", 0)) / 10, 0), 100),
                        "level": int(item.get("DevelopmentGrade", 0)),
                        "lastUpdate": item.get("data_time") or last_update_rounded.strftime("%Y-%m-%d %H:%M:%S"),
                        "source": "cn",
                    }
                    for item in data["data"]
                ]
        except Exception as e:
            print(f"[CN] 抓取失败: {e}")
            return []

# ---------- 国际服 ----------
async def fetch_na() -> List[Dict[str, Any]]:
    url = "https://na.finalfantasyxiv.com/lodestone/cosmic_exploration/report/"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    region_map = {
        "Aether": "国际服-北美", "Crystal": "国际服-北美", "Dynamis": "国际服-北美", "Primal": "国际服-北美",
        "Chaos": "国际服-欧洲", "Light": "国际服-欧洲", "Materia": "国际服-大洋洲",
        "Elemental": "国际服-日本", "Gaia": "国际服-日本", "Mana": "国际服-日本", "Meteor": "国际服-日本",
    }
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, headers=headers, timeout=20) as resp:
                html = await resp.text()
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "lxml")
            servers = []
            for card in soup.select(".cosmic__report__card"):
                name = card.select_one(".cosmic__report__card__name p")
                if not name:
                    continue
                name = name.get_text(strip=True)
                progress = 100 if "completed" in card.get("class", []) else 0
                gauge = card.select_one(".cosmic__report__status__progress__bar")
                if gauge:
                    m = re.search(r"gauge-(\d+)", gauge.get("class", ""))
                    if m:
                        progress = round(int(m[1]) / 8 * 100, 1)
                level = int(card.select_one(".cosmic__report__grade__level p").get_text(strip=True) or 0)
                dc = card.select_one(".cosmic__report__dc__title")
                dc = dc.get_text(strip=True) if dc else ""
                last_update_rounded = round_to_00_or_30(now8())
                servers.append({
                    "region": region_map.get(dc, "国际服-未知区域"),
                    "server": name,
                    "dc": dc,
                    "progress": progress,
                    "level": level,
                    "lastUpdate": last_update_rounded.strftime("%Y-%m-%d %H:%M:%S"),
                    "source": "na",
                })
            return servers
        except Exception as e:
            print(f"[NA] 抓取失败: {e}")
            return []

# ---------- 读取上一周期干净快照 ----------
def load_last_snap() -> dict:
    try:
        files = [
            (f, datetime.strptime(f.stem, "%Y-%m-%d-%H-%M"))
            for f in HISTORY_DIR.glob("*.json")
            if not f.name.endswith("-changes.json")
        ]
        if not files:
            return {}
        latest = sorted(files, key=lambda x: x[1], reverse=True)[0][0]
        data = json.loads(latest.read_text(encoding="utf-8"))
        return {f"{it['region']}-{it['server']}": it["progress"] for it in data if it.get("source")}
    except Exception as e:
        print(f"读取历史快照失败: {e}")
        return {}

# ---------- 主流程 ----------
async def main():
    # 1. 只清旧 changes.json
    for f in HISTORY_DIR.glob("*-changes.json"):
        f.unlink(missing_ok=True)

    # 2. 并发抓取
    cn, na = await asyncio.gather(fetch_cn(), fetch_na())
    current = cn + na
    if not current:
        print("未获取到任何数据")
        return

    # 3. 对比变化
    last_map = load_last_snap()
    changes = [
        {
            "serverId": f"{it['region']}-{it['server']}",
            "oldProgress": old,
            "newProgress": it["progress"],
            "changeTime": now8().strftime("%Y-%m-%d %H:%M:%S"),
        }
        for it in current
        if (old := last_map.get(f"{it['region']}-{it['server']}")) is not None and old != it["progress"]
    ]

    # 4. 写文件
    ts = now8().strftime("%Y-%m-%d-%H-%M")
    snapshot = HISTORY_DIR / f"{ts}.json"
    snapshot.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")
    PUBLIC_FILE.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")
    if changes:
        change_file = HISTORY_DIR / f"{ts}.changes.json"
        change_file.write_text(json.dumps(
            {"type": "progress_changes", "count": len(changes), "changes": changes},
            ensure_ascii=False, indent=2), encoding="utf-8")
        (PUBLIC_DIR / f"{ts}.changes.json").write_text(change_file.read_text(encoding="utf-8"), encoding="utf-8")

    # 5. 日志
    print(f"保存 {len(current)} 条数据 → {snapshot} & {PUBLIC_FILE}")
    if changes:
        print(f"本次变化: {', '.join(c['serverId'] for c in changes)}")
    else:
        print("本次无变化")

if __name__ == "__main__":
    asyncio.run(main())
