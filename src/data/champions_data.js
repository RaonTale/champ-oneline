// 챔피언스 보정 데이터 — 사람이 직접 편집한다 (자동 생성되는 ko.js 와 다름).
//
// gen0(=Champions) 엔진에 데이터가 없거나 값이 다른 기술·도구를 여기서 보강한다.
// 계산 로직(engine.js)은 이 표를 "읽기만" 하므로, 수치를 고칠 때 여기만 손대면 된다.
//
//   기술 key 는 영문명의 toID (소문자 + 기호 제거). 예: "Metal Claw" → "metalclaw".
//   ko.js(한글 사전)는 tools/build_ko.js 로 자동 생성되므로 직접 고치지 말 것.
//   자세한 편집 안내는 src/data/README.md 참고.
(() => {
  'use strict';

  window.CHAMP = {
    // ── 0) 신규 포켓몬 추가 ──────────────────────────────────────────────────
    // 챔피언스 업데이트로 "입국"한, 아직 엔진(gen0)에 없는 포켓몬을 여기에 추가한다.
    //   key = 영문 종족명(폼은 하이픈, 예: 'Garchomp-Mega-Z').
    //   ko       화면에 표시할 한글명 (입력도 이 이름으로)
    //   aliases  줄임말·별칭(선택)
    //   baseStats 종족값 {hp,atk,def,spa,spd,spe}
    //   types    ['Grass'] 또는 ['Water','Ground'] (영문 타입)
    //   weightkg 무게(kg) — 헤비봄버·풀묶기 등 무게 기술용
    //   abilities 특성 영문명 배열, 첫 번째가 기본(미입력 시 자동 적용)
    // 이 한 블록만 채우면 파싱·계산·표시·자동완성까지 전부 붙는다.
    //
    // ⚠️ 여기 항목은 전부 "임시 다리"다. 엔진(vendor/calc)을 업데이트해서 해당 포켓몬이
    //    정식 수록되면 그 항목을 반드시 삭제할 것. (안 지우면 임시 종족값이 정식 데이터를 덮어쓴다.)
    speciesOverrides: {
      // 고릴타 — ⚠️ 엔진 업데이트로 정식 수록되면 삭제
      Rillaboom: {
        ko: '고릴타', aliases: ['고릴라'],
        baseStats: {hp: 100, atk: 125, def: 90, spa: 60, spd: 70, spe: 85},
        types: ['Grass'], weightkg: 90,
        abilities: ['Overgrow', 'Grassy Surge'],
      },
      // 드닐레이브 — ⚠️ 엔진 업데이트로 정식 수록되면 삭제 (종족값·무게는 전국도감 표준값)
      Baxcalibur: {
        ko: '드닐레이브', aliases: ['드닐'],
        baseStats: {hp: 115, atk: 145, def: 92, spa: 75, spd: 86, spe: 87},
        types: ['Dragon', 'Ice'], weightkg: 210,
        abilities: ['Thermal Exchange', 'Ice Body'],
      },
      // 메가한카리아스Z — ⚠️ 엔진 업데이트로 정식 수록되면 삭제
      //   기존 메가진화와 다른 신규 폼. 부유·순수 드래곤. 무게는 미지정이라 한카리아스 기준(95kg).
      'Garchomp-Mega-Z': {
        ko: '메가한카리아스Z', aliases: ['메가한카Z', '한카Z'],
        baseStats: {hp: 108, atk: 130, def: 85, spa: 141, spd: 85, spe: 151},
        types: ['Dragon'], weightkg: 95,
        abilities: ['Levitate'],
      },
      // 메가앱솔Z — ⚠️ 엔진 업데이트로 정식 수록되면 삭제. 예리함(Sharpness)은 엔진 지원(정상 작동).
      'Absol-Mega-Z': {
        ko: '메가앱솔Z', aliases: ['앱솔Z'],
        baseStats: {hp: 65, atk: 154, def: 60, spa: 75, spd: 60, spe: 151},
        types: ['Dark', 'Ghost'], weightkg: 49,
        abilities: ['Sharpness'],
      },
      // 메가루카리오Z — ⚠️ 엔진 업데이트로 정식 수록되면 삭제.
      //   파동의방호(받는 접촉기 데미지 ½)는 엔진에 없는 신규 특성 → 지금은 표기만, 효과 미반영.
      'Lucario-Mega-Z': {
        ko: '메가루카리오Z', aliases: ['메가루카Z', '루카Z'],
        baseStats: {hp: 70, atk: 100, def: 70, spa: 164, spd: 70, spe: 151},
        types: ['Fighting', 'Steel'], weightkg: 57.5,
        abilities: ['파동의방호'],
      },
    },

    // ── 내 줄임말 ────────────────────────────────────────────────────────────
    // 자주 쓰는 줄임말을 여기 넣으면 입력 인식 + 자동완성에 바로 반영된다 (빌드 불필요, 새로고침이면 끝).
    //   '줄임말': '정식 한글명'   (정식명은 이미 인식되는 이름이어야 함 — 포켓몬/기술/도구/특성 아무거나)
    // 예시는 주석 처리해 뒀다. 앞의 // 를 지우고 쓰거나 새 줄을 추가하면 된다.
    userAliases: {
      // '삼드': '삼삼드래',
      // '지진뎀': '지진',
      // '더시': '더시마사리',
    },

    // ── 1) 기술 위력/타입/분류 보강 ─────────────────────────────────────────
    // gen0 엔진에 데이터가 비어 있거나(유령 기술) 값이 다른 기술을 실제 값으로 채운다.
    // 값 = {basePower, type, category}. 넣으면 결정력·데미지 모두 반영된다.
    moveOverrides: {
      metalclaw: {basePower: 50, type: 'Steel', category: 'Physical'},

      // ↓ 사전엔 있으나 gen0 엔진 데이터가 없는 "유령 기술"들 (tools/build_ko.js 실행 시 경고로 나옴).
      //   값 확인 후 주석을 해제하면 바로 계산된다. 선공 2배·가변 타입·연타 등 특수 처리는
      //   아직 미반영이라, 우선 표준 기본 위력만 적어 둔다.
      // anchorshot:      {basePower: 80,  type: 'Steel',    category: 'Physical'},
      // astralbarrage:   {basePower: 120, type: 'Ghost',    category: 'Special'},
      // bloodmoon:       {basePower: 140, type: 'Normal',   category: 'Special'},
      // boltbeak:        {basePower: 85,  type: 'Electric', category: 'Physical'}, // 선공 시 위력 2배
      // dragonhammer:    {basePower: 90,  type: 'Dragon',   category: 'Physical'},
      // fishiousrend:    {basePower: 85,  type: 'Water',    category: 'Physical'}, // 선공 시 위력 2배
      // geargrind:       {basePower: 50,  type: 'Steel',    category: 'Physical'}, // 2연타
      // hyperdrill:      {basePower: 100, type: 'Normal',   category: 'Physical'},
      // revelationdance: {basePower: 90,  type: 'Normal',   category: 'Special'},  // 타입 = 사용자의 1번째 타입
      // snipeshot:       {basePower: 80,  type: 'Water',    category: 'Special'},
      // tripledive:      {basePower: 30,  type: 'Water',    category: 'Physical'}, // 3연타
    },

    // ── 2) 아군 수 등으로 위력이 변하는 기술 (동적 위력) ────────────────────
    // 값 = (side) => 위력. side 는 파싱 결과(alliesFainted 등)를 담고 있다.
    dynamicPower: {
      lastrespects: side => 50 * (1 + (side.alliesFainted || 0)), // 성묘: 쓰러진 아군 수만큼 위력 +50
    },

    // ── 3) 고정 데미지 기술 ─────────────────────────────────────────────────
    // 위력과 무관하게 정해진 HP를 깎는다. 값 = 숫자 | 'level'(레벨=50) | 'ownHP'(자신 현재 HP).
    fixedDamage: {
      seismictoss: 'level', nightshade: 'level',
      dragonrage: 40, sonicboom: 20,
      finalgambit: 'ownHP',
    },

    // ── 4) 방어측/받은 피해에 의존하는 기술 ─────────────────────────────────
    // kind 로 동작이 정해진다:
    //   ohko     명중 시 즉시 기절(데미지=풀피)   halfHP  상대 현재 HP의 절반
    //   endeavor 상대 HP를 자신과 같게            reflect 받은 피해 반사(계산 불가)
    //   stockpile 비축 횟수 의존(계산 불가)        item    내던진 도구 위력(엔진이 계산)
    specialMoves: {
      guillotine: 'ohko', horndrill: 'ohko', fissure: 'ohko', sheercold: 'ohko',
      superfang: 'halfHP', endeavor: 'endeavor',
      counter: 'reflect', mirrorcoat: 'reflect', metalburst: 'reflect', comeuppance: 'reflect',
      spitup: 'stockpile', fling: 'item',
    },
    // kind 별 안내 문구 (결정력·데미지 모드에 그대로 표시된다).
    specialNotes: {
      ohko: '일격필살기 — 명중하면 상대를 즉시 기절시킵니다 (vs 상대 입력 시 표시)',
      halfHP: '상대 현재 HP의 절반을 깎습니다 (vs 상대를 입력하면 계산됩니다)',
      endeavor: '상대 HP를 자신과 같게 만듭니다 (vs 상대를 입력하면 계산됩니다)',
      reflect: '받은 피해를 되돌려주는 기술이라 계산할 수 없습니다 (상대 공격에 의존)',
      stockpile: '비축 횟수에 따라 위력이 달라집니다',
      item: '내던지는 도구에 따라 위력이 정해집니다',
    },

    // ── 5) 무게로 위력이 변하는 기술 ────────────────────────────────────────
    // 결정력 모드엔 상대가 없어 100kg 기준으로 표시한다.
    weightMoves: ['grassknot', 'lowkick', 'heavyslam', 'heatcrash'],

    // ── 6) 위력업 도구 배수 (별도 레이어) ───────────────────────────────────
    // {all} 전체 적용 · {physical}/{special} 분류별 적용.
    // 목탄·자석 등 "타입 강화 도구"는 아래 typeBoostMult 로 자동 처리(엔진 getItemBoostType).
    itemMults: {
      'Life Orb': {all: 1.3},          // 생명의구슬 (관례값; 실제 게임은 5324/4096)
      'Muscle Band': {physical: 1.1},  // 힘의머리띠
      'Wise Glasses': {special: 1.1},  // 박식안경
    },
    typeBoostMult: 1.2, // 목탄 등 타입강화 도구가 같은 타입 기술에 주는 배수

    // ── 7) 내구 공식 상수 ───────────────────────────────────────────────────
    // 내구지수(HP×방어) ÷ 이 값 = 결정력과 같은 스케일. 데미지% ≒ 결정력 ÷ 내구.
    durabilityK: 0.411,
  };
})();
