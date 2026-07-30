# 챔피언스 한 줄 계산기 (champ-oneline)

> https://raontale.github.io/champ-oneline/

포켓몬 **챔피언스** 규칙에 맞춘 한 줄 입력 데미지/결정력/내구력 계산기.
[간단 포켓몬 계산기](https://tiredhermitcrab.github.io/SimplePokeCalc/)의 "한 줄 입력" 방식을 참고하되,
계산 엔진을 최신 [@smogon/calc](https://github.com/smogon/damage-calc)로 교체하고 챔피언스 규칙을 반영했다.

## 챔피언스 규칙 반영
- **능력 포인트 0~32** (기존 노력치 252 → 챔피언스 32). `a32`, `공32+`, `h32 b32` 등
- 레벨 50 고정, `@smogon/calc`의 gen 0(=Champions) 메커니즘 사용
- 기술만 입력하면 **결정력**, 맨 앞에 `vs`를 붙이면 **내구력**이 나온다
- 테라스탈·다이맥스·구애류 위력보정 없음 (입력 시 무시하고 알림)

## 입력법
- **모드** : `공격정보 기술 vs 방어정보`(데미지) / `공격정보 기술`(결정력) / `vs 방어정보`(내구력)
- **능력 포인트** : `a32`(공격) `c32`(특공) `h32 b32`, 한글 `공32 방32`, 성격보정 `a32+`.
  묶음 `hd32+`(=`h32 d32+`), 한글자판 그대로 `ㅁ32`(a)·`ㅗ`(h)·`ㅠ`(b)·`ㅊ`(c)·`ㅇ`(d)·`ㄴ`(s)
- **랭크업** : `+2`·`-1`(공/특공), 능력치별 `+2b32`·`-2b`, 묶음 `+2ha32+`(체력은 랭크 없이 건너뜀) → 바디프레스·어시스트파워 지원. 결정력 분해에선 랭크가 별도 배율로 표시
- **특성** : 미입력 시 사용률 1위 자동. 바꾸려면 이름 입력(`두꺼운지방 마릴리`)
- **타입 변환** : `~타입`(변환자재/리베로) 예 `물타입 마스카나`
- **도구·상태** : `생명의구슬` `목탄` `진화의휘석` … / `화상` `맹독` 등
- **날씨/필드/벽** : 상단 토글 또는 글로 `맑음` `사이코필드` `리플렉터` 등 (글이 우선, 토글 자동 동기화)
- **기타** : `N타`(연타·기술별 최대) `N데스`(성묘·총대장 쓰러진 수) `급소` `분산`(더블 광역) `50%`(잔여 체력)

## 결정력(공격력 지표)
`floor(위력 × 공격 × 자속 × 도구 × …)` 를 분해해서 표시한다.
예) `공격 200 × 위력 120 × 자속 1.5 × 단단한발톱 1.3 × 쾌청 1.5 × 생명의구슬 1.3`

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

## 라이선스 / 출처
- 계산 엔진: [@smogon/calc](https://github.com/smogon/damage-calc) (MIT) — `vendor/calc/LICENSE`
- 입력 방식 아이디어: [간단 포켓몬 계산기](https://tiredhermitcrab.github.io/SimplePokeCalc/)
