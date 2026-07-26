// 파싱 결과를 @smogon/calc 객체로 옮기고 세 가지 계산을 수행한다.
//   damage     : 실제 데미지 (엔진 그대로)
//   firepower  : 결정력 — 타입 상성이 전부 1배인 더미에게 넣은 최대 데미지를 A×위력 스케일로 환산
//   durability : 내구력 — 실효 체력 × 실효 방어(랭크·벽·날씨 반영)
(() => {
  'use strict';

  const GEN_NUM = 0; // @smogon/calc 에서 챔피언스는 0세대로 들어가 있다
  const gen = () => window.calc.Generations.get(GEN_NUM);

  // 메가폼 → 대응 메가스톤 (메가폼을 고르면 도구를 자동으로 끼워 준다)
  const megaStoneFor = (() => {
    let map = null;
    return speciesName => {
      if (!map) {
        map = {};
        const stones = window.calc.MEGA_STONES || {};
        for (const stone of Object.keys(stones)) {
          for (const base of Object.keys(stones[stone])) map[stones[stone][base]] = stone;
        }
      }
      return map[speciesName] || null;
    };
  })();

  const PHYSICAL_DEF = {Physical: 'def', Special: 'spd'};
  const ATTACK_STAT = {Physical: 'atk', Special: 'spa'};

  function buildField(f) {
    const {Field} = window.calc;
    return new Field({
      gameType: f.gameType,
      weather: f.weather || undefined,
      terrain: f.terrain || undefined,
      isGravity: !!f.global.isGravity,
      isMagicRoom: !!f.global.isMagicRoom,
      isWonderRoom: !!f.global.isWonderRoom,
      attackerSide: f.attackerSide,
      defenderSide: f.defenderSide,
    });
  }

  /** 파싱된 side → calc Pokemon 옵션 */
  function toOptions(side) {
    const opts = {
      level: 50,
      evs: Object.assign({}, side.sp),   // 챔피언스에서는 evs 자리가 능력 포인트다
      nature: side.nature || 'Serious',
      boosts: {},
    };
    if (side.ability) {
      opts.ability = side.ability; opts.abilityOn = true;   // 입력/선택된 특성 (명시 → 활성)
    } else {
      // 특성 미입력이면 사용률 1위를 기본값으로 (roster는 사용률 내림차순 정렬됨).
      // abilityOn=false 라 패시브(천하장사·까칠한피부 등)는 적용되고 토글형은 비활성 유지.
      const roster = (window.KO && window.KO.speciesAbilities && window.KO.speciesAbilities[side.species]) || [];
      if (roster[0]) { opts.ability = roster[0].en; opts.abilityOn = false; }
    }
    if (side.alliesFainted) opts.alliesFainted = side.alliesFainted; // 총대장 등
    if (side.status) opts.status = side.status;
    if (side.noItem) opts.item = '';
    else if (side.item) opts.item = side.item;
    else {
      const stone = megaStoneFor(side.species);
      if (stone) opts.item = stone;
    }
    return opts;
  }

  function makePokemon(side) {
    const {Pokemon} = window.calc;
    const opts = toOptions(side);
    // 변환자재/리베로 등 타입 변경: 사용자가 지정한 타입으로 오버라이드
    if (side.typeOverride && side.typeOverride.length) {
      opts.overrides = Object.assign({}, opts.overrides, {types: side.typeOverride.slice()});
    }
    const p = new Pokemon(gen(), side.species, opts);
    if (side.hpPercent != null) {
      p.originalCurHP = Math.max(1, Math.round(p.rawStats.hp * side.hpPercent / 100));
    }
    return p;
  }

  function makeMove(side) {
    const {Move} = window.calc;
    const opts = Object.assign({}, side.moveOpts);
    if (side.crit) opts.isCrit = true;
    // 성묘(Last Respects): 챔피언스 엔진 미구현 → 위력 50×(1+쓰러진 아군 수) 직접 지정.
    if (window.calc.toID(side.move) === 'lastrespects') {
      opts.overrides = Object.assign({}, opts.overrides, {basePower: 50 * (1 + (side.alliesFainted || 0))});
    }
    return new Move(gen(), side.move, opts);
  }

  // 랭크업을 능력치에 적용한다. 능력치별 랭크(+2b32 → boosts)를 우선 반영하고,
  // 단순 +2 는 공격측=공격능력치(바디프레스=방어), 방어측=방어능력치에 적용한다.
  // (어시스트파워/바디프레스는 엔진이 boosts 를 보고 알아서 처리한다.)
  function applyBoosts(attacker, defender, move, atkSide, defSide) {
    const atkStat = move.named && move.named('Body Press') ? 'def'
      : (move.category === 'Special' ? 'spa' : 'atk');
    const defStat = move.category === 'Special' ? 'spd' : 'def';
    if (atkSide) {
      for (const st of Object.keys(atkSide.boosts || {})) attacker.boosts[st] = atkSide.boosts[st];
      if (atkSide.boost) attacker.boosts[atkStat] = atkSide.boost;
    }
    if (defSide) {
      for (const st of Object.keys(defSide.boosts || {})) defender.boosts[st] = defSide.boosts[st];
      if (defSide.boost) defender.boosts[defStat] = defSide.boost;
    }
  }

  function damage(spec) {
    const g = gen();
    const attacker = makePokemon(spec.attacker);
    const defender = makePokemon(spec.defender);
    const move = makeMove(spec.attacker);
    const field = buildField(spec.field);
    applyBoosts(attacker, defender, move, spec.attacker, spec.defender);
    const result = window.calc.calculate(g, attacker, defender, move, field);
    return {result, attacker, defender, move, field};
  }

  // ── 결정력 ────────────────────────────────────────────────────────────────
  // 결정력 = 실효 위력 × 실효 공격 × 자속 × 위력보정도구(생구 등).
  // 데미지 공식에서 방어·레벨·+2 항을 뺀 "공격력 지표"로, 엔진 헬퍼 함수를 직접 호출해
  // 위력보정(테크니션 등)·공격보정(천하장사 등)·자속·도구까지 엔진과 동일하게 반영한다.
  function makeDummy() {
    const {Pokemon} = window.calc;
    return new Pokemon(gen(), 'Ditto', {
      level: 50,
      overrides: {
        types: ['???', '???'],
        baseStats: {hp: 200, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
        abilities: {0: 'Pressure'},
        weightkg: 100,
      },
      ability: 'Pressure',
      item: '',
      evs: {},
      nature: 'Serious',
    });
  }

  const WEATHER_KO = {Sun: '쾌청', Rain: '비', Sand: '모래', Snow: '싸라기눈'};
  const TERRAIN_KO = {Electric: '일렉트릭필드', Grassy: '그래스필드', Misty: '미스트필드', Psychic: '사이코필드'};

  // 날씨의 데미지 배율(base damage 단계 처리분 — 헬퍼 조합엔 안 들어가서 따로 곱한다).
  function weatherMultOf(moveType, weather) {
    if (weather === 'Sun') return moveType === 'Fire' ? 1.5 : moveType === 'Water' ? 0.5 : 1;
    if (weather === 'Rain') return moveType === 'Water' ? 1.5 : moveType === 'Fire' ? 0.5 : 1;
    return 1;
  }
  // 필드의 "일반 타입보정"(같은 타입 기술 ×1.3, 미스트필드는 드래곤 ×0.5). 무브 고유 위력상승과 분리하기 위함.
  function terrainTypeMultOf(moveType, terrain, grounded) {
    if (!terrain || !grounded) return 1;
    if ((terrain === 'Electric' && moveType === 'Electric') ||
        (terrain === 'Grassy' && moveType === 'Grass') ||
        (terrain === 'Psychic' && moveType === 'Psychic')) return 1.3;
    if (terrain === 'Misty' && moveType === 'Dragon') return 0.5;
    return 1;
  }
  // 상대(또는 자신) 무게에 따라 위력이 변하는 기술 — 결정력 모드엔 상대가 없어 더미(100kg) 기준으로 표시.
  const WEIGHT_MOVES = new Set(['grassknot', 'lowkick', 'heavyslam', 'heatcrash']);
  const koAbility = en => (window.KO && window.KO.koName.ability && window.KO.koName.ability[en]) || en;
  const koItem = en => (window.KO && window.KO.koName.item && window.KO.koName.item[en]) || en;

  // 위력업 도구의 데미지 배수(별도 레이어). 생명의구슬은 1.3(게임 5324/4096 대신 관례값).
  function itemMultOf(itemEn, move) {
    if (!itemEn) return 1;
    if (itemEn === 'Life Orb') return 1.3;
    if (itemEn === 'Muscle Band') return move.category === 'Physical' ? 1.1 : 1;
    if (itemEn === 'Wise Glasses') return move.category === 'Special' ? 1.1 : 1;
    const bt = window.calc.getItemBoostType ? window.calc.getItemBoostType(itemEn) : null; // 타입강화 도구(목탄 등) 1.2
    if (bt && move.hasType && move.hasType(bt)) return 1.2;
    return 1;
  }

  function firepower(spec) {
    const g = gen();
    const calc = window.calc;
    const attacker = makePokemon(spec.attacker);
    const dummy = makeDummy();
    const move = makeMove(spec.attacker);
    const field = buildField(spec.field);
    applyBoosts(attacker, dummy, move, spec.attacker, null); // 랭크업 반영

    // 위력업 도구는 별도 레이어로 분리 → 엔진 계산엔 도구 없는 클론을 쓴다.
    const noItem = attacker.clone(); noItem.item = '';
    const itemMult = itemMultOf(attacker.item, move);

    const desc = {};
    const bp = calc.calculateBasePowerChampions(g, noItem, dummy, move, field, false, desc, 0);
    const attack = calc.calculateAttackChampions(g, noItem, dummy, move, field, desc, false);
    const stabMod = calc.getStabMod(noItem, move, desc);
    const finalMods = calc.calculateFinalModsChampions(g, noItem, dummy, move, field, desc, false, 1);
    const finalMod = calc.chainMods(finalMods, 41, 131072);
    const weatherMult = weatherMultOf(move.type, spec.field.weather); // ★ 날씨(base damage 단계) 보정
    // 화상: 물리기 최종 데미지 절반 (근성/속임수 제외) — final damage 단계라 따로 곱한다.
    const applyBurn = attacker.hasStatus('brn') && move.category === 'Physical' &&
      !attacker.hasAbility('Guts') && !move.named('Facade');
    const burnMult = applyBurn ? 0.5 : 1;

    const hits = move.hits && move.hits > 1 ? move.hits : 1;
    const single = bp * attack * (stabMod / 4096) * (finalMod / 4096) * weatherMult * burnMult * itemMult;
    const value = Math.max(0, Math.floor(single) * hits);

    // ── 배율 분해(표시용) ──
    // 필드의 "일반 타입보정(×1.3/×0.5)"만 필드로 빼고, 와이드포스처럼 필드에서 위력 자체가
    // 오르는 무브 고유 효과는 위력에 남긴다. 특성은 엔진 재호출 비율로 뽑는다.
    const grounded = calc.isGrounded ? calc.isGrounded(attacker, field) : true;
    const terrainTypeMult = terrainTypeMultOf(move.type, spec.field.terrain, grounded);

    const neutral = noItem.clone(); neutral.ability = 'Pressure'; neutral.abilityOn = false;
    const d2 = {};
    const bpNeutral = calc.calculateBasePowerChampions(g, neutral, dummy, move, field, false, d2, 0); // 특성만 뺀 위력(필드·무브특효 포함)
    const atkNeutral = calc.calculateAttackChampions(g, neutral, dummy, move, field, d2, false);       // 특성 뺀 공격

    const r2 = x => Math.round(x * 100) / 100;
    const cat = move.category === 'Special' ? '특공' : '공격';
    const abilityBpMult = bpNeutral ? bp / bpNeutral : 1;
    const abilityMult = (atkNeutral ? attack / atkNeutral : 1) * abilityBpMult;
    const shownBp = Math.round(bp / (terrainTypeMult * abilityBpMult)); // 무브특효 포함, 필드·특성 제외

    const weightBased = WEIGHT_MOVES.has(calc.toID(move.name));
    const factors = [];
    factors.push({num: `${cat} ${atkNeutral}`});
    factors.push({num: `위력 ${shownBp}${weightBased ? '(상대무게 100kg 기준)' : ''}`});
    if (stabMod !== 4096) factors.push({label: '자속', mult: r2(stabMod / 4096)});
    if (Math.abs(abilityMult - 1) > 0.005) factors.push({label: koAbility(attacker.ability), mult: r2(abilityMult)});
    if (Math.abs(terrainTypeMult - 1) > 0.005) factors.push({label: TERRAIN_KO[spec.field.terrain] || '필드', mult: r2(terrainTypeMult)});
    if (weatherMult !== 1) factors.push({label: WEATHER_KO[spec.field.weather] || '날씨', mult: r2(weatherMult)});
    if (burnMult !== 1) factors.push({label: '화상', mult: 0.5});
    if (Math.abs(itemMult - 1) > 0.005) {
      factors.push({label: koItem(attacker.item), mult: r2(itemMult)});
    }
    if (hits > 1) factors.push({num: `${hits}타`});

    return {value, attacker, move, field, effBp: bp, effAtk: attack, factors};
  }

  // ── 내구력 ────────────────────────────────────────────────────────────────
  // 실효 체력 × 실효 방어. 랭크업, 리플렉터/빛의장막/오로라베일, 모래·눈 보정을 반영한다.
  // 0.411 = 데미지 공식 상수를 내구 쪽에 몰아넣은 관례값. 데미지% ≒ 결정력 ÷ 내구 가 성립한다.
  const DURABILITY_K = 0.411;
  function durability(spec) {
    const side = spec.defender;
    const p = makePokemon(side);
    const f = spec.field;

    const boostMult = b => (b > 0 ? (2 + b) / 2 : b < 0 ? 2 / (2 - b) : 1);
    // 능력치별 랭크(+2b) 우선, 없으면 단순 +2 를 방어·특방 양쪽에.
    const b = side.boosts || {};
    const defRank = b.def != null ? b.def : (side.boost || 0);
    const spdRank = b.spd != null ? b.spd : (side.boost || 0);

    const hp = side.hpPercent != null ? p.originalCurHP : p.rawStats.hp;

    let def = Math.floor(p.rawStats.def * boostMult(defRank));
    let spd = Math.floor(p.rawStats.spd * boostMult(spdRank));

    const mods = {physical: [], special: []};
    if (f.weather === 'Snow' && p.types.indexOf('Ice') >= 0) {
      def = Math.floor(def * 1.5); mods.physical.push('싸라기눈');
    }
    if (f.weather === 'Sand' && p.types.indexOf('Rock') >= 0) {
      spd = Math.floor(spd * 1.5); mods.special.push('모래바람');
    }
    const screens = f.defenderSide;
    const doubled = f.gameType === 'Doubles' ? 2732 / 4096 * 2 : 2;
    if (screens.isReflect || screens.isAuroraVeil) {
      def = Math.floor(def * doubled);
      mods.physical.push(screens.isAuroraVeil ? '오로라베일' : '리플렉터');
    }
    if (screens.isLightScreen || screens.isAuroraVeil) {
      spd = Math.floor(spd * doubled);
      mods.special.push(screens.isAuroraVeil ? '오로라베일' : '빛의장막');
    }

    // 내구지수(HP×방어)를 데미지 관례 상수 0.411로 나눠 결정력과 같은 스케일에 맞춘다.
    // 이렇게 하면 데미지% ≒ 결정력 ÷ 내구 가 성립한다. (한국 커뮤니티 표준 내구 공식)
    return {
      pokemon: p,
      hp,
      physical: Math.floor(hp * def / DURABILITY_K),
      special: Math.floor(hp * spd / DURABILITY_K),
      def, spd, defRank, spdRank, mods,
    };
  }

  window.CC = Object.assign(window.CC || {}, {damage, firepower, durability, GEN_NUM});
})();
