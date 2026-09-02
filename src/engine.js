// 파싱 결과를 @smogon/calc 객체로 옮기고 세 가지 계산을 수행한다.
//   damage     : 실제 데미지 (엔진 그대로)
//   firepower  : 결정력 — 타입 상성이 전부 1배인 더미에게 넣은 최대 데미지를 A×위력 스케일로 환산
//   durability : 내구력 — 실효 체력 × 실효 방어(랭크·벽·날씨 반영)
(() => {
  'use strict';

  const GEN_NUM = 0; // @smogon/calc 에서 챔피언스는 0세대로 들어가 있다
  const gen = () => window.calc.Generations.get(GEN_NUM);

  // 손편집 보정 데이터(src/data/champions_data.js). 수치·목록은 전부 여기서 읽는다.
  const CHAMP = window.CHAMP || {};
  const moveID = move => window.calc.toID(move.name);
  const specialKind = move => (CHAMP.specialMoves && CHAMP.specialMoves[moveID(move)]) || null;
  const specialNote = kind => (CHAMP.specialNotes && CHAMP.specialNotes[kind]) || '';

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
      // 메가폼이면 대응 메가스톤 자동 장착 — 단 gen0에 실제로 있는 도구일 때만.
      // (신규 커스텀 메가는 스톤이 아이템 데이터에 없어, 끼우면 엔진이 크래시한다. 스탯은 오버라이드로 이미 반영됨.)
      const stone = megaStoneFor(side.species);
      if (stone && gen().items.get(window.calc.toID(stone))) opts.item = stone;
    }
    return opts;
  }

  function makePokemon(side) {
    const {Pokemon} = window.calc;
    const opts = toOptions(side);
    // 신규 포켓몬(엔진 미수록): 종족값·타입·무게·특성을 오버라이드로 주입한다.
    const so = CHAMP.speciesOverrides && CHAMP.speciesOverrides[side.species];
    if (so) {
      const ovr = {};
      if (so.baseStats) ovr.baseStats = so.baseStats;
      if (so.types) ovr.types = so.types.slice();
      if (so.weightkg != null) ovr.weightkg = so.weightkg;
      if (so.abilities) ovr.abilities = so.abilities.reduce((m, a, i) => (m[i] = a, m), {});
      opts.overrides = Object.assign(ovr, opts.overrides);
    }
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
    // 기술 보강: 동적 위력(성묘 등) 우선, 없으면 정적 보강(유령 기술 위력/타입/분류).
    const id = window.calc.toID(side.move);
    const dyn = CHAMP.dynamicPower && CHAMP.dynamicPower[id];
    const ov = dyn ? {basePower: dyn(side)} : (CHAMP.moveOverrides && CHAMP.moveOverrides[id]);
    if (ov) opts.overrides = Object.assign({}, ov, opts.overrides);
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
    // 엔진이 계산 못 하는 방어측 HP 기반 기술(일격기·분노의앞니·죽기살기)은 직접 값 산출.
    const custom = defenderHpDamage(move, attacker, defender);
    if (custom) return {result, attacker, defender, move, field, customDamage: custom.dmg, ohko: custom.ohko};
    // 받은 피해에 의존해 계산 불가한 반사기·비축기는 안내만(내던지기는 엔진이 도구로 계산하므로 제외).
    const kind = specialKind(move);
    if (kind === 'reflect' || kind === 'stockpile')
      return {result, attacker, defender, move, field, specialText: specialNote(kind)};
    // 매치업 지표: 공격측 결정력 → 방어측 내구(기술 분류별). 상성 배율은 빠진 순수 공방 지표.
    let matchup = null;
    try {
      const fpRes = firepower(spec);
      if (fpRes && fpRes.value != null && !fpRes.notApplicable && !fpRes.fixedDamage) {
        const dur = durability({defender: spec.defender, field: spec.field});
        const special = move.category === 'Special';
        matchup = {fp: fpRes.value, dur: special ? dur.special : dur.physical, cat: special ? '특수' : '물리'};
      }
    } catch (e) { /* 무시 */ }
    // 기술 타입 + 상성 배율 (무효는 특성/타입 관계없이 0으로). 공격기에만.
    let moveType = null, effective = null;
    if (move.category !== 'Status') {
      moveType = move.type;
      const dmg = result.damage;
      const flat = Array.isArray(dmg) ? [].concat.apply([], dmg) : [dmg]; // 무효는 스칼라 0
      const maxDmg = flat.length ? Math.max.apply(null, flat) : 0;
      let te = 1;
      const gme = window.calc.getMoveEffectiveness;
      try {
        if (gme && defender.types && defender.types.length) {
          te = gme(g, move, defender.types[0], false, field.isGravity, false);
          if (defender.types[1]) te *= gme(g, move, defender.types[1], false, field.isGravity, false);
        }
      } catch (e) { te = 1; }
      effective = maxDmg <= 0 ? 0 : te;
    }
    return {result, attacker, defender, move, field, matchup, moveType, effective};
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
  const WEIGHT_MOVES = new Set(CHAMP.weightMoves || []);
  const koAbility = en => (window.KO && window.KO.koName.ability && window.KO.koName.ability[en]) || en;
  const koItem = en => (window.KO && window.KO.koName.item && window.KO.koName.item[en]) || en;

  // 고정 데미지 기술 — 위력·능력치와 무관하게 정해진 HP를 깎는다. (표: CHAMP.fixedDamage)
  function fixedDamageOf(attacker, move) {
    const v = CHAMP.fixedDamage && CHAMP.fixedDamage[moveID(move)];
    if (v == null) return 0;
    if (v === 'level') return attacker.level;   // = 50
    if (v === 'ownHP') return attacker.curHP();  // 목숨걸기: 자신의 현재 HP
    return v;                                    // 숫자(용의분노 40 등)
  }

  // 방어측 HP로 데미지가 정해지는 기술(엔진 미구현) — 데미지 모드에서 직접 계산. (표: CHAMP.specialMoves)
  function defenderHpDamage(move, attacker, defender) {
    switch (specialKind(move)) {
      case 'ohko': return {dmg: defender.maxHP(), ohko: true};                                   // 일격필살 = 풀피
      case 'halfHP': return {dmg: Math.max(1, Math.floor(defender.curHP() / 2)), ohko: false};    // 분노의앞니
      case 'endeavor': return {dmg: Math.max(0, defender.curHP() - attacker.curHP()), ohko: false}; // 죽기살기
      default: return null;
    }
  }

  // 위력업 도구의 데미지 배수(별도 레이어). 표: CHAMP.itemMults + 타입강화 도구는 typeBoostMult.
  function itemMultOf(itemEn, move) {
    if (!itemEn) return 1;
    const spec = CHAMP.itemMults && CHAMP.itemMults[itemEn];
    if (spec) {
      if (spec.all) return spec.all;
      if (spec.physical && move.category === 'Physical') return spec.physical;
      if (spec.special && move.category === 'Special') return spec.special;
    }
    const bt = window.calc.getItemBoostType ? window.calc.getItemBoostType(itemEn) : null; // 목탄 등 타입강화 도구
    if (bt && move.hasType && move.hasType(bt)) return CHAMP.typeBoostMult || 1.2;
    return 1;
  }

  function firepower(spec) {
    const g = gen();
    const calc = window.calc;
    const attacker = makePokemon(spec.attacker);
    const dummy = makeDummy();
    const move = makeMove(spec.attacker);
    const field = buildField(spec.field);

    // 고정 데미지 기술: 위력이 아니라 정해진 값만큼 깎는다(레벨 50 고정).
    //   지구던지기·나이트헤드 = 레벨(50), 용의분노 = 40, 음속날개 = 20, 목숨걸기 = 자신 HP.
    const fixed = fixedDamageOf(attacker, move);
    if (fixed > 0) {
      return {value: fixed, fixedDamage: true, finalGambit: move.named('Final Gambit'),
        attacker, move, field, factors: []};
    }

    // 방어측/받은 피해에 의존하는 기술(일격기·분노의앞니·반사기 등)은 안내만.
    const kind = specialKind(move);
    if (kind) {
      return {value: null, notApplicable: true, specialText: specialNote(kind), attacker, move, field, factors: []};
    }

    // 변화기(칼춤·나쁜음모 등)와 데이터가 없는 기술(챔피언스 미수록)은 결정력이 없다.
    if (move.category === 'Status' || move.bp == null) {
      return {value: null, notApplicable: true, statusMove: move.category === 'Status',
        noData: move.bp == null && move.category !== 'Status', attacker, move, field, factors: []};
    }

    applyBoosts(attacker, dummy, move, spec.attacker, null); // 랭크업 반영

    // 위력업 도구는 별도 레이어로 분리 → 엔진 계산엔 도구 없는 클론을 쓴다.
    const noItem = attacker.clone(); noItem.item = '';
    const itemMult = itemMultOf(attacker.item, move);

    const desc = {};
    // 트리플악셀처럼 히트마다 위력이 오르는 기술(hit×20)은 hit 인덱스(1~)가 필요하다.
    // 예전엔 hit=0을 넘겨 위력이 0이 됐다. 히트별로 각각 계산해 뒤에서 합산한다.
    const hitCount = move.hits && move.hits > 1 ? move.hits : 1;
    const perHitBp = [];
    for (let h = 1; h <= hitCount; h++) {
      perHitBp.push(calc.calculateBasePowerChampions(g, noItem, dummy, move, field, false, desc, h));
    }
    const bp = perHitBp[0];
    const attack = calc.calculateAttackChampions(g, noItem, dummy, move, field, desc, false);
    const stabMod = calc.getStabMod(noItem, move, desc);
    const finalMods = calc.calculateFinalModsChampions(g, noItem, dummy, move, field, desc, false, 1);
    const finalMod = calc.chainMods(finalMods, 41, 131072);
    const weatherMult = weatherMultOf(move.type, spec.field.weather); // ★ 날씨(base damage 단계) 보정
    // 화상: 물리기 최종 데미지 절반 (근성/속임수 제외) — final damage 단계라 따로 곱한다.
    const applyBurn = attacker.hasStatus('brn') && move.category === 'Physical' &&
      !attacker.hasAbility('Guts') && !move.named('Facade');
    const burnMult = applyBurn ? 0.5 : 1;

    const hits = hitCount;
    const perMult = attack * (stabMod / 4096) * (finalMod / 4096) * weatherMult * burnMult * itemMult;
    // 히트별 위력이 달라도(트리플악셀) 정확히 합산. 상수 위력 연타면 단순히 위력×타수와 같다.
    let value = 0;
    for (const bph of perHitBp) value += Math.floor(bph * perMult);
    value = Math.max(0, value);

    // ── 배율 분해(표시용) ──
    // 필드의 "일반 타입보정(×1.3/×0.5)"만 필드로 빼고, 와이드포스처럼 필드에서 위력 자체가
    // 오르는 무브 고유 효과는 위력에 남긴다. 특성은 엔진 재호출 비율로 뽑는다.
    const grounded = calc.isGrounded ? calc.isGrounded(attacker, field) : true;
    const terrainTypeMult = terrainTypeMultOf(move.type, spec.field.terrain, grounded);

    const neutral = noItem.clone(); neutral.ability = 'Pressure'; neutral.abilityOn = false;
    const d2 = {};
    const bpNeutral = calc.calculateBasePowerChampions(g, neutral, dummy, move, field, false, d2, 1); // 특성만 뺀 위력(필드·무브특효 포함)
    const atkNeutral = calc.calculateAttackChampions(g, neutral, dummy, move, field, d2, false);       // 특성 뺀 공격(랭크 포함)
    // 랭크업은 공격 수치에 녹이지 않고 별도 배율로 분리한다. (바디프레스는 방어 랭크가 대상)
    // 엔진은 boosts[stat] 가 숫자여야 하므로 키를 유지한 채 0으로 초기화한다.
    const noBoost = neutral.clone();
    noBoost.boosts = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
    const d3 = {};
    const atkNoBoost = calc.calculateAttackChampions(g, noBoost, dummy, move, field, d3, false);        // 랭크·특성 뺀 공격
    const rankMult = atkNoBoost ? atkNeutral / atkNoBoost : 1;

    const r2 = x => Math.round(x * 100) / 100;
    const cat = move.category === 'Special' ? '특공' : '공격';
    const abilityBpMult = bpNeutral ? bp / bpNeutral : 1;
    const abilityMult = (atkNeutral ? attack / atkNeutral : 1) * abilityBpMult;
    // 트리플악셀처럼 히트마다 위력이 다르면(가변) 합산 위력을 보여주고 "N타"를 따로 곱하지 않는다.
    const varHits = perHitBp.some(b => b !== perHitBp[0]);
    const sumBp = perHitBp.reduce((a, b) => a + b, 0);
    const shownBp = Math.round((varHits ? sumBp : bp) / (terrainTypeMult * abilityBpMult)); // 무브특효 포함, 필드·특성 제외

    const weightBased = WEIGHT_MOVES.has(calc.toID(move.name));
    const factors = [];
    factors.push({num: `${cat} ${atkNoBoost}`});
    factors.push({num: `위력 ${shownBp}${varHits ? ` (${hits}타 합산)` : ''}${weightBased ? '(상대무게 100kg 기준)' : ''}`});
    if (Math.abs(rankMult - 1) > 0.005) factors.push({label: '랭크', mult: r2(rankMult)});
    if (stabMod !== 4096) factors.push({label: '자속', mult: r2(stabMod / 4096)});
    if (Math.abs(abilityMult - 1) > 0.005) factors.push({label: koAbility(attacker.ability), mult: r2(abilityMult)});
    if (Math.abs(terrainTypeMult - 1) > 0.005) factors.push({label: TERRAIN_KO[spec.field.terrain] || '필드', mult: r2(terrainTypeMult)});
    if (weatherMult !== 1) factors.push({label: WEATHER_KO[spec.field.weather] || '날씨', mult: r2(weatherMult)});
    if (burnMult !== 1) factors.push({label: '화상', mult: 0.5});
    if (Math.abs(itemMult - 1) > 0.005) {
      factors.push({label: koItem(attacker.item), mult: r2(itemMult)});
    }
    if (hits > 1 && !varHits) factors.push({num: `${hits}타`});

    return {value, attacker, move, field, effBp: bp, effAtk: attack, factors};
  }

  // ── 내구력 ────────────────────────────────────────────────────────────────
  // 실효 체력 × 실효 방어. 랭크업, 리플렉터/빛의장막/오로라베일, 모래·눈 보정을 반영한다.
  // 0.411 = 데미지 공식 상수를 내구 쪽에 몰아넣은 관례값. 데미지% ≒ 결정력 ÷ 내구 가 성립한다.
  const DURABILITY_K = CHAMP.durabilityK || 0.411;
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
