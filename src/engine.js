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
    const p = new Pokemon(gen(), side.species, toOptions(side));
    if (side.hpPercent != null) {
      p.originalCurHP = Math.max(1, Math.round(p.rawStats.hp * side.hpPercent / 100));
    }
    return p;
  }

  function makeMove(side) {
    const {Move} = window.calc;
    const opts = Object.assign({}, side.moveOpts);
    if (side.crit) opts.isCrit = true;
    return new Move(gen(), side.move, opts);
  }

  // 랭크업 토큰(+2 등)을 기술 분류에 맞는 능력치에 적용한다.
  // boosts 만 세팅하면 된다 — 엔진이 계산 시점에 반영하고, clone() 도 boosts 를 그대로 넘긴다.
  function applyBoosts(attacker, defender, move, atkSide, defSide) {
    const cat = move.category === 'Special' ? 'Special' : 'Physical';
    if (atkSide && atkSide.boost) attacker.boosts[ATTACK_STAT[cat]] = atkSide.boost;
    if (defSide && defSide.boost) defender.boosts[PHYSICAL_DEF[cat]] = defSide.boost;
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

  function firepower(spec) {
    const g = gen();
    const calc = window.calc;
    const attacker = makePokemon(spec.attacker);
    const dummy = makeDummy();
    const move = makeMove(spec.attacker);
    const field = buildField(spec.field);
    applyBoosts(attacker, dummy, move, spec.attacker, null); // 랭크업 반영

    const desc = {};
    const bp = calc.calculateBasePowerChampions(g, attacker, dummy, move, field, false, desc, 0);
    const attack = calc.calculateAttackChampions(g, attacker, dummy, move, field, desc, false);
    const stabMod = calc.getStabMod(attacker, move, desc);
    const finalMods = calc.calculateFinalModsChampions(g, attacker, dummy, move, field, desc, false, 1);
    const finalMod = calc.chainMods(finalMods, 41, 131072);

    const hits = move.hits && move.hits > 1 ? move.hits : 1;
    const single = bp * attack * (stabMod / 4096) * (finalMod / 4096);
    const value = Math.max(0, Math.floor(single) * hits);
    return {value, attacker, move, field, effBp: bp, effAtk: attack};
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
    const rank = side.boost || 0;

    const hp = side.hpPercent != null ? p.originalCurHP : p.rawStats.hp;

    let def = Math.floor(p.rawStats.def * boostMult(rank));
    let spd = Math.floor(p.rawStats.spd * boostMult(rank));

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
      def, spd, rank, mods,
    };
  }

  window.CC = Object.assign(window.CC || {}, {damage, firepower, durability, GEN_NUM});
})();
