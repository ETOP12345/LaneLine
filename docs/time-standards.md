# Time Standards

Verified October 28, 2026. `time-standards.json` contains published cuts, not estimates or course conversions. `standards-engine.js` compares times in integer hundredths of a second and matches division, age, event, and course.

## Sources

- [PNS standards index](https://www.pns.org/page/fast-times/time-standards)
- [2026 PNS 14&U Short Course Championships](https://www.pns.org/pnws2/UserFiles/Image/QuickUpload/2026-14u-sc-champs-standards_019804.pdf). LCM and SCM values are entry cuts for this short-course meet.
- [2026 Northwest Age Group Regionals](https://www.pns.org/pnws2/UserFiles/Image/QuickUpload/2026-nwag-time-standards_095580.pdf). Reference only: 2027 standards were not linked on the PNS index when verified. Single-age cuts are preserved; an unknown age within an age range is not guessed. Only SCY and LCM are imported because the SCM distance labels are ambiguous.
- [2027 Spring Western Region Sectionals](https://www.pns.org/pnws2/UserFiles/Image/QuickUpload/2027-western-region-sectional-time-standards-002592_044132.pdf). The spring table is used, not the separate summer table.
- [2027 Washington Open meet packet](https://www.gomotionapp.com/mtmac/__eventform__/1607138_1523accf-f0db-4df9-9208-8484d618529a.pdf). Direct qualifying cuts only; bonus-event allowances are not qualifying cuts. The printed men's 1500 LCM `18.40.00` is normalized to `18:40.00`.
- [2027 Futures](https://www.usaswimming.org/docs/default-source/timesdocuments/time-standards/2027/13240385687_2027_events_tyrfutureschampionships_timestandards.pdf). First-page 18&U standards.
- [2026 Winter Juniors](https://www.usaswimming.org/docs/default-source/timesdocuments/time-standards/2026/11320828118_events_timestandards_2026_speedowinterjrs.pdf).
- [2027 Summer Juniors](https://www.usaswimming.org/docs/default-source/timesdocuments/time-standards/2027/13240385687_2027_events_speedojuniornationalchampionships_timestandards.pdf).
- [2024-2028 national motivational standards](https://www.pns.org/pnws2/UserFiles/Image/QuickUpload/2024-2028-usas-motivational-standards_002036.pdf). Both divisions, all published age groups and courses. B is retained for classification but omitted from target displays.

## Rebuilding and Checking

Place the source PDFs in ignored `tmp/standards/` using the filenames in `scripts/build-time-standards.py`, then run that generator with Python and pdfplumber installed. National championship image-only tables are explicitly transcribed in the generator after visual verification. Run `node --test test/standards.test.js` to check known values, complete data validity, age/course matching, and exact drops.

Targets are sorted by their actual cut, since meet difficulty differs by event. Missing published cuts remain unavailable. A met cut is only a time comparison: qualifying dates, age at the meet, membership, and entry rules still need checking against the meet packet. Regional reference targets are excluded from the current meet-cuts-met list.
