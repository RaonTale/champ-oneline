# 챔피언스 데미지 계산기 (champcalc)

포켓몬 **챔피언스** 규칙에 맞춘 한 줄 입력 데미지 계산기.
[간단 포켓몬 계산기](https://tiredhermitcrab.github.io/SimplePokeCalc/)의 "한 줄 입력" 방식을 참고하되,
계산 엔진을 최신 [@smogon/calc](https://github.com/smogon/damage-calc)로 교체하고 챔피언스 규칙을 반영했다.

## 챔피언스 규칙 반영
- **능력 포인트 0~32** (기존 노력치 252 → 챔피언스 32). `a32`, `공32+`, `h32 b32` 등
- 레벨 50 고정, `@smogon/calc`의 gen 0(=Champions) 메커니즘 사용
- 기술만 입력하면 **결정력**, 맨 앞에 `vs`를 붙이면 **내구력**이 나온다

## 구조
```
champcalc/
├── index.html          진입점 (스크립트 로드 순서 = 참조 champions.html 과 동일)
├── css/style.css       라이트/다크 대응 UI
├── src/
│   ├── parse.js        한 줄 입력 → 계산 스펙 (별칭/줄임말/모드 판별)
│   ├── engine.js       스펙 → @smogon/calc 객체, 데미지/결정력/내구력 계산
│   ├── describe.js     결과 → 한글 문장
│   ├── app.js          입력창 ↔ 결과 실시간 연결
│   └── data/ko.js      자동 생성 한글 사전 (직접 수정 금지)
├── vendor/calc/        @smogon/calc 컴파일 산출물 (calc.pokemonshowdown.com 기준)
└── tools/              데이터 빌드/검증 스크립트 (Node)
    ├── build_ko.js         src/data/ko.js 생성
    ├── overrides.json      수동 보정(별칭/폼 이름/신규 특성)
    ├── loadcalc.js         Node에서 vendor/calc 로드
    ├── dump_calc_data.js   gen0 종족/기술/… 목록 덤프
    ├── test_pipeline.js    parse→engine→describe 전체 검증
    └── probe_coverage.js   한글 데이터 커버리지 점검

```
## 실행
로컬에서 `python -m http.server 8085 -d .` 후 http://localhost:8085
(배포: https://raontale.github.io/champ-oneline/)

## 라이선스 / 출처
- 계산 엔진: [@smogon/calc](https://github.com/smogon/damage-calc) (MIT) — `vendor/calc/LICENSE`
- 입력 방식 아이디어: [간단 포켓몬 계산기](https://tiredhermitcrab.github.io/SimplePokeCalc/)
