# 데이터 편집 가이드

포켓몬/기술/도구 데이터를 고칠 때 **어디를 만지는지**만 알면 된다. 두 종류가 있다.

| 고치려는 것 | 편집할 파일 | 자동생성? |
|---|---|---|
| **한글 이름·별칭·줄임말** (포켓몬/기술/도구/특성) | [`../../tools/overrides.json`](../../tools/overrides.json) | ✅ → `ko.js` 재생성 필요 |
| **기술·도구 수치** (위력·타입·고정데미지·도구 배수 등) | [`champions_data.js`](champions_data.js) | ❌ 직접 편집, 즉시 반영 |

> `ko.js` 는 **자동 생성물이라 직접 고치지 말 것.** 이름은 `overrides.json` 에서 고친다.

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
