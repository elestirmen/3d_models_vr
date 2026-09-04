#!/usr/bin/env python3
"""Kullanım ölçümü günlüğünü özetler.

Olaylar nginx tarafından `oku_events` biçimiyle yazılır:

    2026-09-05T00:12:34+00:00 v=1&e=model_open&id=kutuphane

Günlük satırları container'ın standart çıktısına gider, bu yüzden:

    docker logs personal-web 2>/dev/null | python3 tools/report_events.py
    docker logs --since 24h personal-web | python3 tools/report_events.py --since-hours 24

Dosyadan okumak için:

    python3 tools/report_events.py events.log
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import parse_qs

LINE_RE = re.compile(r"^(?P<time>\d{4}-\d{2}-\d{2}T[\d:]+[+\-][\d:]+)\s+(?P<args>v=\d+&\S*)$")


def _parse(lines) -> list[dict[str, str]]:
  events: list[dict[str, str]] = []
  for raw in lines:
    match = LINE_RE.match(raw.strip())
    if not match:
      continue
    params = {k: v[0] for k, v in parse_qs(match.group("args")).items()}
    params["_time"] = match.group("time")
    events.append(params)
  return events


def _within(events: list[dict[str, str]], hours: float | None) -> list[dict[str, str]]:
  if not hours:
    return events
  cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)
  kept = []
  for event in events:
    try:
      stamp = dt.datetime.fromisoformat(event["_time"])
    except ValueError:
      continue
    if stamp >= cutoff:
      kept.append(event)
  return kept


def _median(values: list[float]) -> float:
  if not values:
    return 0.0
  ordered = sorted(values)
  middle = len(ordered) // 2
  if len(ordered) % 2:
    return ordered[middle]
  return (ordered[middle - 1] + ordered[middle]) / 2


def report(events: list[dict[str, str]]) -> None:
  if not events:
    print("Olay bulunamadı. Ölçüm ucu henüz istek almamış olabilir.")
    return

  kinds = Counter(event.get("e", "?") for event in events)
  opens = Counter(event.get("id", "?") for event in events if event.get("e") == "model_open")
  completes = [event for event in events if event.get("e") == "load_complete"]
  abandons = [event for event in events if event.get("e") == "load_abandoned"]
  tiers = Counter(event.get("t", "?") for event in events if event.get("e") == "tier_reached")
  ar_checks = [event for event in events if event.get("e") == "ar_available"]
  ar_ready = sum(1 for event in ar_checks if event.get("a") == "1")
  errors = Counter(event.get("k", "?") for event in events if event.get("e") == "error")

  print(f"Toplam olay: {len(events)}   ({events[0]['_time']} → {events[-1]['_time']})")
  print()

  print("En çok açılan binalar")
  for model_id, count in opens.most_common(10):
    print(f"  {count:5d}  {model_id}")
  if not opens:
    print("  (yok)")
  print()

  total_open = sum(opens.values())
  if total_open:
    completion = len(completes) / total_open * 100
    print(f"Yükleme tamamlama oranı: %{completion:.0f} "
          f"({len(completes)} tamamlandı / {total_open} açılış)")
    durations = [float(e["ms"]) for e in completes if e.get("ms", "").isdigit()]
    if durations:
      print(f"  ortanca süre: {_median(durations) / 1000:.1f} sn   "
            f"en yavaş: {max(durations) / 1000:.1f} sn")
    if abandons:
      percents = [float(e["p"]) for e in abandons if e.get("p", "").isdigit()]
      print(f"  terk: {len(abandons)} kez"
            + (f", ortanca %{_median(percents):.0f} noktasında" if percents else ""))
    print()

  if tiers:
    print("Ulaşılan kalite kademeleri")
    for tier, count in tiers.most_common():
      print(f"  {count:5d}  {tier}")
    print()

  if ar_checks:
    print(f"AR yeteneği: {ar_ready}/{len(ar_checks)} cihazda kullanılabilir "
          f"(%{ar_ready / len(ar_checks) * 100:.0f})")
    print(f"  AR başlatma: {kinds.get('ar_entered', 0)}   yerleştirme: {kinds.get('ar_placed', 0)}")
    print()

  extras = [
    ("Ekran görüntüsü", kinds.get("snapshot", 0)),
    ("Paylaşım", kinds.get("share", 0)),
    ("Çevrimdışı kayıt", kinds.get("offline_saved", 0)),
  ]
  used = [f"{label}: {count}" for label, count in extras if count]
  if used:
    print("Araç kullanımı — " + " · ".join(used))
    print()

  if errors:
    print("Hatalar")
    for kind, count in errors.most_common():
      print(f"  {count:5d}  {kind}")


def main() -> int:
  parser = argparse.ArgumentParser(description=__doc__,
                                   formatter_class=argparse.RawDescriptionHelpFormatter)
  parser.add_argument("logfile", nargs="?", type=Path,
                      help="günlük dosyası (verilmezse standart girdi okunur)")
  parser.add_argument("--since-hours", type=float, default=None,
                      help="yalnızca son N saati özetle")
  args = parser.parse_args()

  if args.logfile:
    if not args.logfile.is_file():
      print(f"ERROR: {args.logfile} bulunamadı")
      return 2
    lines = args.logfile.read_text(encoding="utf-8", errors="replace").splitlines()
  else:
    lines = sys.stdin.read().splitlines()

  report(_within(_parse(lines), args.since_hours))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
