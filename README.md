# KOOK YANG 7 작업일지

예인선 KOOK YANG 7 (MMSI 440066190)의 AIS 항적을 매일 누적해 지도와 작업 추정 일지로 보여주는 웹앱입니다.
휴대폰 브라우저에서 열고 "홈 화면에 추가"하면 앱처럼 쓸 수 있습니다.

- `data.json`: 누적 항적 (매일 19:30 마감 후 자동 갱신). `snapshots`는 예전 주변 선박 기록으로 더 이상 쌓지 않음 — 작업 상대 본선은 도선 배정 기록(`pilot.json`)에서 가져옴
- `pilot.json`: 도선 배정 대조 결과 (작업 번호는 매달 1번부터, 예: 2026-11 #3)
- 보기: 주간(월~일)·월간 보고 전환, `make_pdf.py`·`report.js`도 week|month 단위 지원
- `analyze.js`: 작업 구간 판정
- `basemap.json`: 육지 윤곽 (대산항 상세 · 광역 · 전국), © OpenStreetMap contributors
