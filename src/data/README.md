# 데이터 편집 가이드

포켓몬/기술/도구 데이터를 고칠 때 **어디를 만지는지**만 알면 된다. 두 종류가 있다.

| 고치려는 것 | 편집할 파일 | 자동생성? |
|---|---|---|
| **신규 포켓몬 추가** (업데이트로 입국한 종족) | [`champions_data.js`](champions_data.js) `speciesOverrides` | ❌ 직접 편집, 즉시 반영 |
| **기술·도구 수치** (위력·타입·고정데미지·도구 배수 등) | [`champions_data.js`](champions_data.js) | ❌ 직접 편집, 즉시 반영 |
| **한글 이름·별칭·줄임말** (기존 포켓몬/기술/도구/특성) | [`../../tools/overrides.json`](../../tools/overrides.json) | ✅ → `ko.js` 재생성 필요 |

> `ko.js` 는 **자동 생성물이라 직접 고치지 말 것.** 기존 이름은 `overrides.json` 에서 고친다.
> `learnsets.js`(포켓몬별 학습기·기술 정보)도 자동 생성물 — `node tools/build_learnsets.js` 로 재생성한다.

---

## 0. 신규 포켓몬을 추가하고 싶다 → `champions_data.js` 의 `speciesOverrides`

챔피언스 업데이트로 **엔진(gen0)에 아직 없는 포켓몬**이 들어왔을 때 쓴다.
(엔진에 이미 있는데 한글명만 없으면 → 아래 3번 `overrides.json`.)

`champions_data.js` 맨 위 `speciesOverrides` 에 한 마리당 한 블록을 넣는다:

```js
Rillaboom: {                 // key = 영문 종족명 (폼은 하이픈: 'Garchomp-Mega-Z')
  ko: '고릴타',               // 화면 표시·입력에 쓸 한글명
  aliases: ['고릴라'],         // 줄임말·별칭 (선택)
  baseStats: {hp: 100, atk: 125, def: 90, spa: 60, spd: 70, spe: 85},
  types: ['Grass'],           // 영문 타입 1~2개
  weightkg: 90,               // 무게(kg) — 헤비봄버·풀묶기용
  abilities: ['Overgrow', 'Grassy Surge'], // 첫 번째가 기본(미입력 시 자동)
},
```

이 한 블록만 넣으면 **파싱·데미지/결정력/내구 계산·화면 표시·자동완성**이 기존 포켓몬과
똑같이 붙는다. 재생성·빌드 필요 없음. (`champions_data.js` 안에 작동 예시 `Rillaboom`
과 템플릿이 주석으로 들어 있으니 복사해서 채우면 된다.)

- **영문 종족명 key** 는 @smogon/calc 표기 기준. 폼은 하이픈(`Tornadus-Therian`),
  신규 메가는 새 폼명(`Garchomp-Mega-Z`)으로 넣는다.
- **종족값·타입·무게** 는 도감에서 확인해 그대로 적는다.
- **특성 영문명** 은 calc 표기(예: `Grassy Surge`). 한글 특성명이 `ko.js` 에 있으면
  자동으로 한글로 표시된다.

> 참고: 엔진에 없는 종족이라 `tools/build_ko.js` 재생성과는 무관하다. 이름 사전(`ko.js`)에
> 넣는 게 아니라, 앱 로드 시 `parse.js` 가 자동으로 합친다.

---

## 1. 한글 이름을 고치고 싶다 → `tools/overrides.json`

이름 사전(`ko.js`)은 외부 도감 데이터 + `overrides.json` 을 합쳐 만든다. 자동 매칭이
틀리거나 별칭(줄임말)을 추가하려면 `overrides.json` 의 해당 칸에 넣는다.

- `moveAlias` : 기술 줄임말 → 정식명 (예 `"하펌": "하이드로펌프"`)
- `itemAlias` / `pokemonAlias` : 도구·포켓몬 별칭
- `moveKo` / `itemKo` / `abilityKo` / `speciesKo` : 번역이 없거나 틀린 정식 한글명 직접 지정
- `speciesSlug` : calc 종족명 ↔ 도감 폼 slug 매칭 보정

고친 뒤 **사전을 다시 만든다**:

```bash
node tools/build_ko.js
```

실행하면 매칭 실패·유령 기술 등을 경고로 알려준다.

## 1.5 자주 쓰는 줄임말을 넣고 싶다 → `champions_data.js` 의 `userAliases`

빌드 없이 **파일에 적고 새로고침이면 끝.** `'줄임말': '정식 한글명'` 형태로 넣으면,
입력 인식과 **자동완성**이 기존 별칭과 똑같이 동작한다.

```js
userAliases: {
  '삼드': '삼삼드래',      // '삼드' 입력 → 삼삼드래로 인식 + 자동완성에 삼삼드래 노출
  '생구슬': '생명의구슬',
},
```

- 정식명은 **이미 인식되는 이름**(포켓몬/기술/도구/특성 아무거나)이어야 한다.
- 오타로 정식명을 못 찾으면 브라우저 콘솔에 경고가 뜬다.
- (참고: `tools/overrides.json` 의 `*Alias` 는 빌드용 정식 별칭 창구다. `userAliases` 는
  재생성 없이 바로 쓰는 개인 줄임말용.)

## 2. 기술·도구 수치를 고치고 싶다 → `champions_data.js`

계산 로직(`../engine.js`)은 이 파일의 표를 **읽기만** 하므로, 수치는 여기서만 고치면 된다.
기술 key 는 영문명의 `toID`(소문자·기호 제거). 예: `"Metal Claw"` → `metalclaw`.

- **유령 기술 / 위력·타입이 틀린 기술** → `moveOverrides` 에 `{basePower, type, category}`
  (`tools/build_ko.js` 실행 시 "유령 기술" 경고로 목록이 나온다)
- **고정 데미지 기술** → `fixedDamage` (`숫자` | `'level'` | `'ownHP'`)
- **일격기·분노의앞니 등 방어측 의존 기술** → `specialMoves` (kind) + `specialNotes` (문구)
- **무게로 위력이 변하는 기술** → `weightMoves`
- **위력업 도구 배수** → `itemMults` (`{all}` / `{physical}` / `{special}`)

이 파일은 자동 반영이라 재생성이 필요 없다. `index.html` 이 `ko.js` 다음에 로드한다.

## 3. 고친 뒤 검증

브라우저 없이 파싱→계산→표시 전체를 확인한다:

```bash
node tools/test_pipeline.js
```
