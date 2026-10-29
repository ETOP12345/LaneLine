"""Build standards data from downloaded official PDFs and checked image tables."""
import json
import re
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
PDFS = ROOT / "tmp" / "standards"
STROKES = {"FR": "free", "BK": "back", "BR": "breast", "FL": "fly", "IM": "im"}
TIME = re.compile(r"\d{1,2}(?::\d{2})?\.\d{2}")
DATA = {"verifiedOn": "2026-10-28", "motivational": {}, "meets": []}

def key(group, age, event, course):
    return f"{group}|{age}|{event.lower()} {course.lower()}"

def event_name(raw, course):
    raw = re.sub(r"\s+", " ", raw.strip()).lower()
    if not re.fullmatch(r"\d+(?:/\d+)? (?:free|back|breast|fly|im)", raw):
        return None
    distance, stroke = raw.split(" ")
    if "/" in distance:
        first, second = distance.split("/")
        distance = second if course == "SCY" else first
    return f"{distance} {stroke}"

def meet(id, label, edition, url, age_type="open", **extra):
    value = {"id": id, "label": label, "edition": edition, "sourceUrl": url,
             "ageType": age_type, "cuts": {}, **extra}
    DATA["meets"].append(value)
    return value

mot_url = "https://www.pns.org/pnws2/UserFiles/Image/QuickUpload/2024-2028-usas-motivational-standards_002036.pdf"
DATA["motivationalSource"] = {"edition": "2024-2028", "sourceUrl": mot_url}
with pdfplumber.open(PDFS / "motivational.pdf") as document:
    for page in document.pages:
        age = None
        for line in page.extract_text().splitlines():
            heading = re.search(r"(10 & under|\d+-\d+) Girls Event", line)
            if heading:
                age = "10&u" if heading[1] == "10 & under" else heading[1]
            event = re.search(r"\b(\d+) (FR|BK|BR|FL|IM) (SCY|SCM|LCM)\b", line)
            if not age or not event:
                continue
            girls = TIME.findall(line[:event.start()])
            boys = TIME.findall(line[event.end():])
            if len(girls) != 6 or len(boys) != 6:
                raise ValueError(f"Unexpected motivational row: {line}")
            name = f"{event[1]} {STROKES[event[2]]}"
            for gender, values, labels in [
                ("girls", girls, ["B", "BB", "A", "AA", "AAA", "AAAA"]),
                ("boys", boys, ["AAAA", "AAA", "AA", "A", "BB", "B"]),
            ]:
                DATA["motivational"][key(gender, age, name, event[3])] = dict(zip(labels, values))
assert len(DATA["motivational"]) == 446

pns = meet("pns-champs", "PNS SC Champs", "2026", "https://www.pns.org/pnws2/UserFiles/Image/QuickUpload/2026-14u-sc-champs-standards_019804.pdf", "age-group", maxAge=14)
with pdfplumber.open(PDFS / "pns-2026.pdf") as document:
    for page in document.pages:
        age = None
        for line in page.extract_text().splitlines():
            header = re.search(r"Girls (10&U|11-12|13-14) Events Boys", line)
            if header:
                age = header[1].lower()
            parts = line.split()
            if not age or len(parts) < 8:
                continue
            event = " ".join(parts[3:-3])
            for gender, times, courses in [
                ("girls", parts[:3], ["SCM", "LCM", "SCY"]),
                ("boys", parts[-3:], ["SCY", "LCM", "SCM"]),
            ]:
                for time, course in zip(times, courses):
                    name = event_name(event, course)
                    if name and TIME.fullmatch(time):
                        pns["cuts"][key(gender, age, name, course)] = time
assert pns["cuts"]["girls|11-12|100 breast scy"] == "1:20.89"

regional = meet("regionals", "Northwest Regional", "2026 reference", "https://www.pns.org/pnws2/UserFiles/Image/QuickUpload/2026-nwag-time-standards_095580.pdf", "single-age", minAge=0, maxAge=18, reference=True,
                note="2027 standards are not linked on PNS's official standards page. 2026 targets are reference only; single-age cuts apply.")
with pdfplumber.open(PDFS / "regionals-2026.pdf") as document:
    course = None
    for row in document.pages[0].extract_tables()[0]:
        if row[19] in ["SCY", "LCM", "SCM"]:
            course = row[19]
            continue
        if course not in ["SCY", "LCM"]:
            continue
        event = re.sub(r"(?<=\d)(?=[A-Za-z])", " ", row[19] or "")
        name = event_name(event, course)
        if not name:
            continue
        for gender, ages, columns in [
            ("girls", ["15-18", "14", "13", "12", "11", "10&u"], [0, 3, 6, 9, 12, 15]),
            ("boys", ["10&u", "11", "12", "13", "14", "15-18"], [21, 24, 27, 30, 33, 36]),
        ]:
            for age, column in zip(ages, columns):
                time = row[column] or ""
                if TIME.fullmatch(time):
                    regional["cuts"][key(gender, age, name, course)] = time
assert regional["cuts"]["girls|11|50 free scy"] == "29.39"
assert regional["cuts"]["girls|12|50 free scy"] == "27.79"

sectionals = meet("sectionals", "Spring Sectionals", "2027", "https://www.pns.org/pnws2/UserFiles/Image/QuickUpload/2027-western-region-sectional-time-standards-002592_044132.pdf",
                  note="Spring Western Region standards. Distance events have alternate-distance qualification rules; compare direct cuts here.")
with pdfplumber.open(PDFS / "sectionals-2027.pdf") as document:
    text = document.pages[0].extract_text().split("2027 Summer Western Region")[0]
    count = 0
    for line in text.splitlines():
        parts = line.replace("#", "").split()
        if len(parts) < 7 or not all(TIME.fullmatch(t) for t in parts[:3] + parts[-3:]):
            continue
        raw = " ".join(parts[3:-3]).replace("Fr", "Free").replace("Bk", "Back").replace("Br", "Breast")
        raw = raw.replace("4/500 Free", "400/500 Free").replace("8/1000 Free", "800/1000 Free")
        if raw == "1500/1650":
            raw += " Free"
        if not event_name(raw, "SCY"):
            continue
        if count >= 14:
            break
        count += 1
        for gender, times in [("girls", parts[:3]), ("boys", parts[-3:])]:
            for course, time in zip(["SCY", "SCM", "LCM"], times):
                sectionals["cuts"][key(gender, "open", event_name(raw, course), course)] = time
assert sectionals["cuts"]["boys|open|100 breast scy"] == "1:01.53"
assert sectionals["cuts"]["girls|open|50 free scy"] == "24.99"
assert len(sectionals["cuts"]) == 84

washington = meet("washington-open", "Washington Open", "2027", "https://www.gomotionapp.com/mtmac/__eventform__/1607138_1523accf-f0db-4df9-9208-8484d618529a.pdf",
                  note="Direct individual entry cuts. One qualifier permits up to three bonus events of 200Y or shorter; bonus entry is not the same as meeting a direct cut. SCM and converted entry times are not accepted.")
with pdfplumber.open(PDFS / "washington-2027.pdf") as document:
    for line in document.pages[4].extract_text().splitlines():
        row = re.match(r"^\d+ ([\d:.]+) ([\d:.]+) (\d+) (FREESTYLE|FREE|BACKSTROKE|BACK|BREASTSTROKE|BREAST|BUTTERFLY|FLY|IM)(?: \(\d\))? ([\d:.]+) ([\d:.]+) \d+$", line)
        if not row:
            continue
        gl, gy, distance, stroke, by, bl = row.groups()
        stroke = {"FREESTYLE":"free", "FREE":"free", "BACKSTROKE":"back", "BACK":"back", "BREASTSTROKE":"breast", "BREAST":"breast", "BUTTERFLY":"fly", "FLY":"fly", "IM":"im"}[stroke]
        for gender, times in [("girls", [gy, gl]), ("boys", [by, bl])]:
            for course, time in zip(["SCY", "LCM"], times):
                # The source uses 18.40.00 for men's 1500 and one-digit decimals elsewhere.
                if time.count(".") == 2:
                    time = time.replace(".", ":", 1)
                if ":" in time:
                    minutes, seconds = time.split(":")
                    time = f"{int(minutes)}:{float(seconds):05.2f}"
                else:
                    time = f"{float(time):.2f}"
                d = {"500":"400", "1000":"800", "1650":"1500"}.get(distance, distance) if course == "LCM" else distance
                washington["cuts"][key(gender, "open", f"{d} {stroke}", course)] = time
assert washington["cuts"]["boys|open|200 breast scy"] == "2:24.00"

def national(id, label, edition, url, rows, **extra):
    item = meet(id, label, edition, url, maxAge=18, **extra)
    for raw in rows.strip().splitlines():
        event, gy, gl, by, bl = raw.split("|")
        for gender, times in [("girls", [gy, gl]), ("boys", [by, bl])]:
            for course, time in zip(["SCY", "LCM"], times):
                item["cuts"][key(gender, "open", event_name(event, course), course)] = time

# These official PDFs are image-only. Values below were checked on their rendered first pages.
national("futures", "Futures", "2027 (18&U)", "https://www.usaswimming.org/docs/default-source/timesdocuments/time-standards/2027/13240385687_2027_events_tyrfutureschampionships_timestandards.pdf", """
50 Free|23.89|27.39|21.29|24.59
100 Free|51.89|59.29|46.39|53.59
200 Free|1:52.29|2:07.79|1:41.59|1:57.79
400/500 Free|5:02.59|4:28.79|4:37.09|4:09.99
800/1000 Free|10:20.49|9:13.79|9:34.29|8:40.69
1500/1650 Free|17:14.39|17:40.19|16:05.49|16:38.99
50 Back|26.29|30.89|23.69|27.89
100 Back|57.09|1:06.79|51.49|1:00.59
200 Back|2:04.19|2:23.99|1:52.79|2:11.89
50 Breast|29.79|34.79|26.29|30.89
100 Breast|1:05.49|1:15.99|57.99|1:08.19
200 Breast|2:22.69|2:43.39|2:07.99|2:29.09
50 Fly|25.69|29.49|22.89|26.29
100 Fly|56.59|1:04.69|50.59|57.99
200 Fly|2:05.39|2:21.89|1:53.69|2:10.19
200 IM|2:06.39|2:26.19|1:53.89|2:12.79
400 IM|4:30.69|5:07.29|4:06.99|4:42.39
""", qualifyingStart="2026-06-01")
national("winter-juniors", "Winter Juniors", "2026", "https://www.usaswimming.org/docs/default-source/timesdocuments/time-standards/2026/11320828118_events_timestandards_2026_speedowinterjrs.pdf", """
50 Free|23.29|26.89|20.49|24.09
100 Free|50.39|58.19|44.89|52.59
200 Free|1:49.09|2:04.99|1:38.39|1:55.29
400/500 Free|4:53.59|4:26.69|4:28.79|4:04.99
800/1000 Free|10:11.49|9:06.79|9:22.69|8:28.19
1500/1650 Free|17:02.19|17:26.79|15:40.39|16:14.79
100 Back|55.09|1:04.79|49.19|58.79
200 Back|1:59.39|2:19.59|1:47.79|2:08.29
100 Breast|1:03.09|1:13.79|55.49|1:05.89
200 Breast|2:17.19|2:38.59|2:01.59|2:24.09
100 Fly|54.69|1:02.69|48.69|56.49
200 Fly|2:01.69|2:18.39|1:49.09|2:06.39
200 IM|2:02.19|2:22.09|1:49.59|2:09.29
400 IM|4:21.69|5:00.29|3:56.49|4:35.89
""", qualifyingStart="2025-11-01")
national("summer-juniors", "Summer Juniors", "2027", "https://www.usaswimming.org/docs/default-source/timesdocuments/time-standards/2027/13240385687_2027_events_speedojuniornationalchampionships_timestandards.pdf", """
50 Free|22.89|26.59|20.19|23.79
100 Free|49.79|57.59|44.29|51.89
200 Free|1:47.89|2:04.99|1:37.19|1:53.89
400/500 Free|4:49.99|4:23.59|4:25.39|4:02.19
800/1000 Free|10:03.79|9:06.79|9:13.19|8:23.09
1500/1650 Free|16:50.19|17:26.79|15:30.99|16:05.09
50 Back|25.19|29.79|22.49|26.69
100 Back|54.09|1:04.29|48.39|58.09
200 Back|1:57.49|2:18.99|1:46.09|2:06.79
50 Breast|28.79|33.49|25.29|29.59
100 Breast|1:02.19|1:13.09|54.79|1:04.79
200 Breast|2:14.89|2:38.29|1:59.69|2:21.99
50 Fly|24.69|28.09|21.99|25.29
100 Fly|53.79|1:02.39|47.99|55.79
200 Fly|2:00.09|2:18.39|1:47.49|2:05.09
200 IM|2:00.59|2:21.19|1:47.99|2:07.79
400 IM|4:18.09|5:00.29|3:52.69|4:33.09
""", qualifyingStart="2026-06-01")

output = ROOT / "time-standards.json"
output.write_text(json.dumps(DATA, indent=2) + "\n", encoding="utf-8")
print(f"Built {len(DATA['motivational'])} motivational rows and {len(DATA['meets'])} meets.")
