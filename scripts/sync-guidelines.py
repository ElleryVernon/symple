#!/usr/bin/env python3
"""KKEBI 상담 가이드라인 동기화 — Google Sheet(xlsx) → lib/counsel/guidelines/data/*.json

스프레드시트가 단일 진실 공급원(source of truth)이다. 시트가 갱신되면 이 스크립트를
다시 실행해 JSON을 재생성하고 커밋한다. 런타임은 생성된 JSON만 읽는다.

사용법:
  python3 scripts/sync-guidelines.py <xlsx 경로>
  python3 scripts/sync-guidelines.py --download <스프레드시트 ID>

운영 시트 ID: 1fmFk-nttOSakw5QSY_KEivejXxxhNhoQ
  python3 scripts/sync-guidelines.py --download 1fmFk-nttOSakw5QSY_KEivejXxxhNhoQ
재생성 후 반드시: node scripts/validate-guidelines.mjs

필요 패키지: openpyxl (pip install openpyxl)
"""

import json
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "lib" / "counsel" / "guidelines" / "data"

SHEETS = {
    "assessment": "03_AssessmentMap",
    "fallback_text": "06_ScenarioLibrary_Fallback",
    "call_guide": "12_KkebiCallGuide",
    "scenarios": "13_KkebiCallScenarios",
    "fallback_call": "14_KkebiCallFallbacks",
}

EMOJI_RE = re.compile(r"^\s*([^\w\s가-힣]+)")
MINUTES_RE = re.compile(r"^(\d+)\s*분?$")


def clean(value):
    """셀 값 정규화 — NFC, 트림. 빈 값은 None."""
    if value is None:
        return None
    if isinstance(value, datetime):
        # 시트에서 "1-5" 같은 척도 표기가 날짜로 자동 변환된 아티팩트 복원
        return f"{value.month}-{value.day}"
    text = unicodedata.normalize("NFC", str(value)).strip()
    return text or None


def rows_of(ws):
    rows = list(ws.iter_rows(values_only=True))
    header = [clean(c) for c in rows[0]]
    out = []
    for raw in rows[1:]:
        if all(c is None for c in raw):
            continue
        out.append({h: clean(c) for h, c in zip(header, raw) if h})
    return out


def parse_minutes(value):
    if value is None:
        return None
    m = MINUTES_RE.match(value)
    return int(m.group(1)) if m else value


def main():
    try:
        import openpyxl
    except ImportError:
        sys.exit("openpyxl 이 필요합니다: pip install openpyxl")

    if len(sys.argv) >= 3 and sys.argv[1] == "--download":
        url = f"https://docs.google.com/spreadsheets/d/{sys.argv[2]}/export?format=xlsx"
        path = Path("/tmp/kkebi-guidelines.xlsx")
        print(f"다운로드: {url}")
        urllib.request.urlretrieve(url, path)
    elif len(sys.argv) >= 2:
        path = Path(sys.argv[1])
    else:
        sys.exit(__doc__)

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # ── 03_AssessmentMap → assessment-map.json ──────────────────────────────
    assessment = rows_of(wb[SHEETS["assessment"]])
    write("assessment-map.json", assessment, indent=1)

    # ── 12_KkebiCallGuide → call-guide.json (분류체계) ───────────────────────
    guide_rows = rows_of(wb[SHEETS["call_guide"]])
    chief_complaints, emotions, stages = [], [], []
    for r in guide_rows:
        if r.get("row_type") == "chief_complaint":
            emoji_match = EMOJI_RE.match(r.get("notes") or "")
            chief_complaints.append({
                "code": r["code"],
                "label_ko": r["label_ko"],
                "label_en": r["label_en"],
                "emoji": emoji_match.group(1).strip() if emoji_match else None,
            })
        elif r.get("row_type") == "emotion":
            emotions.append({
                "code": r["code"],
                "label_ko": r["label_ko"],
                "group": r["group"],
            })
        elif r.get("row_type") == "cbt_stage":
            stages.append({
                "code": r["code"],
                "label_ko": r["label_ko"],
                "label_en": r["label_en"],
                "note": r.get("notes"),
            })
    write("call-guide.json", {
        "chief_complaints": chief_complaints,
        "emotions": emotions,
        "stages": stages,
    }, indent=1)

    # ── 13_KkebiCallScenarios → scenarios.ko.json + subthemes.json ──────────
    scenario_rows = rows_of(wb[SHEETS["scenarios"]])
    ko_scenarios = []
    subthemes, seen_subthemes = [], set()
    for r in scenario_rows:
        if r.get("language") != "ko":
            continue  # 봇은 한국어 운영 — en 시나리오는 시트에만 둔다
        for key in list(r):
            if key.endswith("_minutes"):
                r[key] = parse_minutes(r[key])
        ko_scenarios.append(r)
        sub_key = (r["chief_complaint_code"], r["subtheme_code"])
        if sub_key not in seen_subthemes:
            seen_subthemes.add(sub_key)
            subthemes.append({
                "chief_complaint_code": r["chief_complaint_code"],
                "code": r["subtheme_code"],
                "label_ko": r["subtheme_label"],
            })
    # 시나리오는 용량이 커서 비압축 출력(공백 없음)으로 번들 크기를 줄인다
    write("scenarios.ko.json", ko_scenarios, indent=None)
    write("subthemes.json", subthemes, indent=1)

    # ── 06 + 14 → fallbacks.json (모드 태그 병합) ────────────────────────────
    text_fallbacks = rows_of(wb[SHEETS["fallback_text"]])
    call_fallbacks = [r for r in rows_of(wb[SHEETS["fallback_call"]]) if r.get("language") == "ko"]
    write("fallbacks.json", {"text": text_fallbacks, "call": call_fallbacks}, indent=1)

    print(f"완료 → {OUT_DIR}")
    print(f"  시나리오(ko): {len(ko_scenarios)} / 서브테마: {len(subthemes)}")
    print(f"  폴백 — 텍스트: {len(text_fallbacks)}, 콜: {len(call_fallbacks)}")
    print(f"  주호소: {len(chief_complaints)}, 감정: {len(emotions)}, 단계: {len(stages)}")


def write(name, data, indent):
    path = OUT_DIR / name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent,
                  separators=(",", ":") if indent is None else None)
        f.write("\n")
    print(f"  {name}: {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
