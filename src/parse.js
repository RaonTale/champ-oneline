// 한 줄 입력을 계산기 스펙으로 바꾼다.
//
//   "a32+ 한카 지진 vs h32 b32+ 토오"
//    └── 공격측 ──┘  └── 방어측 ──┘
//
// 챔피언스 기준이라 노력치가 아니라 능력 포인트(0~32)를 쓰고, 테라스탈은 없다.
(() => {
  'use strict';

  const KO = window.KO;

  const normKo = s => String(s).replace(/[\s·・()（）'’.\-]/g, '');

  // 한글 키보드에서 영문 스탯키가 만드는 자모도 같이 받는다: h→ㅗ a→ㅁ b→ㅠ c→ㅊ d→ㅇ s→ㄴ
  const STAT_KO = {
    특공: 'spa', 특방: 'spd', 체력: 'hp', 스피드: 'spe',
    체: 'hp', 공: 'atk', 방: 'def', 스: 'spe',
    hp: 'hp', h: 'hp', a: 'atk', b: 'def', c: 'spa', d: 'spd', s: 'spe',
    ㅗ: 'hp', ㅁ: 'atk', ㅠ: 'def', ㅊ: 'spa', ㅇ: 'spd', ㄴ: 'spe',
  };
  const STAT_LABEL = {hp: '체력', atk: '공격', def: '방어', spa: '특수공격', spd: '특수방어', spe: '스피드'};
  const MAX_SP = 32;
  // 챔피언스 총 능력 포인트 상한. 초과해도 계산은 하되 경고만 띄운다.
  const TOTAL_SP_CAP = 66;

  const STAT_TOKEN = /^(특공|특방|체력|스피드|체|공|방|스|hp|[habcdsㅗㅁㅠㅊㅇㄴ])(\d{1,3})?([+\-])?$/i;
  // 묶음 표기: hd32+ = h32 d32+, hb32 = h32 b32 ... (한 글자 능력치 2개 이상 + 숫자 + 성격기호)
  const STAT_CHAR = {
    h: 'hp', a: 'atk', b: 'def', c: 'spa', d: 'spd', s: 'spe',
    체: 'hp', 공: 'atk', 방: 'def', 스: 'spe',
    ㅗ: 'hp', ㅁ: 'atk', ㅠ: 'def', ㅊ: 'spa', ㅇ: 'spd', ㄴ: 'spe',
  };
  const COMBINED_STAT = /^([habcds체공방스ㅗㅁㅠㅊㅇㄴ]{2,})(\d{1,3})([+\-])?$/i;
  const BOOST_TOKEN = /^([+\-])([1-6])$/;
  const HITS_TOKEN = /^([1-9]|1[0-9])타$/; // 1~19타 (실제 상한은 기술별로 검증)
  const HP_TOKEN = /^(?:잔체력)?(\d{1,3})%$/;

  const WEATHER = {
    맑음: 'Sun', 쾌청: 'Sun', 뙤약볕: 'Sun', 햇살: 'Sun', 해: 'Sun', 가뭄: 'Sun',
    비: 'Rain', 우천: 'Rain', 빗속: 'Rain', 잔비: 'Rain',
    모래: 'Sand', 모래바람: 'Sand', 모래날림: 'Sand',
    눈: 'Snow', 싸라기눈: 'Snow', 설경: 'Snow', 눈복사: 'Snow',
  };
  const TERRAIN = {
    일렉트릭필드: 'Electric', 일렉필드: 'Electric', 전기필드: 'Electric',
    그래스필드: 'Grassy', 풀필드: 'Grassy', 그라스필드: 'Grassy',
    미스트필드: 'Misty', 안개필드: 'Misty',
    사이코필드: 'Psychic', 사이킥필드: 'Psychic',
  };
  // 엔진 내부는 축약 코드(par/brn/psn/tox/slp/frz)로 상태이상을 검사한다.
  const STATUS = {
    독: 'psn', 맹독: 'tox', 화상: 'brn', 마비: 'par',
    잠듦: 'slp', 수면: 'slp', 잠: 'slp', 얼음: 'frz', 동상: 'frz',
  };
  // "~타입" 오버라이드용 (변환자재/리베로). 짧은 표기 → 영문 타입.
  const TYPE_EN = {
    노말: 'Normal', 불: 'Fire', 불꽃: 'Fire', 물: 'Water', 전기: 'Electric', 풀: 'Grass',
    얼음: 'Ice', 격투: 'Fighting', 독: 'Poison', 땅: 'Ground', 지면: 'Ground', 비행: 'Flying',
    에스퍼: 'Psychic', 초능력: 'Psychic', 사이코: 'Psychic', 벌레: 'Bug', 바위: 'Rock', 암석: 'Rock',
    고스트: 'Ghost', 유령: 'Ghost', 드래곤: 'Dragon', 용: 'Dragon', 악: 'Dark', 강철: 'Steel', 철: 'Steel',
    페어리: 'Fairy', 요정: 'Fairy',
  };
  // 방어측에 붙는 필드 효과
  const DEF_SIDE = {
    리플렉터: 'isReflect', 리플: 'isReflect',
    빛의장막: 'isLightScreen', 빛장: 'isLightScreen', 광벽: 'isLightScreen',
    오로라베일: 'isAuroraVeil', 오베: 'isAuroraVeil',
    프렌드가드: 'isFriendGuard', 프가: 'isFriendGuard',
    스텔스록: 'isSR', 스록: 'isSR',
  };
  // 공격측에 붙는 필드 효과
  const ATK_SIDE = {
    도우미: 'isHelpingHand', 헬핑핸드: 'isHelpingHand',
    순풍: 'isTailwind',
    파워스폿: 'isPowerSpot',
    배터리: 'isBattery',
  };
  const GLOBAL_FLAG = {
    중력: 'isGravity',
    매직룸: 'isMagicRoom',
    원더룸: 'isWonderRoom',
  };

  function emptySide() {
    return {
      species: null, speciesKo: null,
      item: null, itemKo: null, noItem: false,
      ability: null, abilityKo: null,
      nature: null, natureKo: null,
      sp: {}, natureHint: {plus: null, minus: null},
      move: null, moveKo: null, moveOpts: {}, hitsToken: null,
      boost: 0,
      crit: false,
      status: null, statusKo: null,
      hpPercent: null,
      alliesFainted: 0,
      typeOverride: null,
      fullInvest: false,
      unknown: [],
      notes: [],
    };
  }

  function emptyField() {
    return {weather: null, terrain: null, gameType: 'Singles', attackerSide: {}, defenderSide: {}, global: {}};
  }

  /** 한 쪽(공격측 또는 방어측) 토큰들을 해석한다. field 는 양쪽이 공유한다. */
  function parseSide(text, field, notes) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const side = emptySide();
    const tokens = raw.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      const key = normKo(token);
      if (!key) continue;

      // 1) 필드/날씨/상태 등 문맥 토큰 (기술명과 겹치므로 먼저 본다)
      if (WEATHER[key]) {
        field.weather = WEATHER[key];
        // 가뭄·잔비처럼 날씨를 까는 특성이면 특성도 같이 지정한다
        if (KO.ability[key] && !side.ability) { side.ability = KO.ability[key]; side.abilityKo = token; }
        continue;
      }
      if (TERRAIN[key]) { field.terrain = TERRAIN[key]; continue; }
      if (DEF_SIDE[key]) { field.defenderSide[DEF_SIDE[key]] = true; continue; }
      if (ATK_SIDE[key]) { field.attackerSide[ATK_SIDE[key]] = true; continue; }
      if (GLOBAL_FLAG[key]) { field.global[GLOBAL_FLAG[key]] = true; continue; }
      if (key === '분산' || key === '더블') { field.gameType = 'Doubles'; continue; }
      if (STATUS[key]) { side.status = STATUS[key]; side.statusKo = token; continue; }
      // "~타입" 타입 오버라이드 (변환자재/리베로 등): 불타입, 물타입 → 최대 2개
      if (/타입$/.test(key)) {
        const en = TYPE_EN[key.slice(0, -2)];
        if (en) {
          side.typeOverride = side.typeOverride || [];
          if (side.typeOverride.indexOf(en) < 0 && side.typeOverride.length < 2) side.typeOverride.push(en);
          continue;
        }
      }

      // 2) 챔피언스에 없는 기믹은 조용히 무시하지 않고 알려준다
      if (/테라$/.test(key) || key === '테라스탈') {
        notes.push(`"${token}" — 챔피언스에는 테라스탈이 없어 무시했습니다.`);
        continue;
      }
      if (/^다이맥스|^거다이|^다이$/.test(key)) {
        notes.push(`"${token}" — 챔피언스에는 다이맥스가 없어 무시했습니다.`);
        continue;
      }

      // 3) 랭크업 / 연타 / 잔여 체력 / 급소 / 보정 표현
      let m;
      if ((m = BOOST_TOKEN.exec(key))) { side.boost = Number(m[1] + m[2]); continue; }
      if ((m = HITS_TOKEN.exec(key))) { side.moveOpts.hits = Number(m[1]); side.hitsToken = token; continue; }
      if ((m = HP_TOKEN.exec(key))) { side.hpPercent = Math.min(100, Number(m[1])); continue; }
      // 쓰러진 아군 수 (성묘 위력·총대장 배율): "3데스" / "3기절"
      if ((m = /^([0-5])(데스|기절)$/.exec(key))) { side.alliesFainted = Number(m[1]); continue; }
      if (key === '급소') { side.crit = true; continue; }
      if (key === '노템' || key === '무도구') { side.noItem = true; continue; }
      if (key === '풀보정') { side.fullInvest = true; continue; }
      if (key === '무보정') { continue; } // 기본값이라 그대로 무시(모르는 단어로 취급하지 않음)

      // 4-0) 묶음 능력 포인트 (hd32+ = h32 d32+). 성격 보정은 비-체력 능력치에 적용.
      if ((m = COMBINED_STAT.exec(key))) {
        const stats = [];
        for (const ch of m[1]) {
          const st = STAT_CHAR[ch.toLowerCase()] || STAT_CHAR[ch];
          if (st && stats.indexOf(st) < 0) stats.push(st);
        }
        if (stats.length >= 2) {
          const n0 = Number(m[2]);
          if (n0 > MAX_SP) {
            notes.push(`"${token}" — 챔피언스 능력 포인트는 한 능력치당 최대 ${MAX_SP}입니다. ${MAX_SP}로 맞췄습니다.`);
          }
          const n = Math.min(MAX_SP, n0);
          for (const st of stats) side.sp[st] = n;
          if (m[3]) {
            const natStats = stats.filter(s => s !== 'hp');
            if (!natStats.length) {
              notes.push(`"${token}" — 체력에는 성격 보정이 없습니다.`);
            } else {
              const target = natStats[natStats.length - 1]; // 마지막 비-체력 능력치에 성격 보정
              if (m[3] === '+') side.natureHint.plus = target;
              else side.natureHint.minus = target;
              if (natStats.length > 1) {
                notes.push(`"${token}" — 성격 보정은 ${STAT_LABEL[target]}에만 적용했습니다.`);
              }
            }
          }
          continue;
        }
      }

      // 4) 능력 포인트 (a32 / 공32+ / a / c-)
      if ((m = STAT_TOKEN.exec(key))) {
        const stat = STAT_KO[m[1].toLowerCase()];
        if (stat) {
          const n = m[2] === undefined ? MAX_SP : Number(m[2]);
          if (n > MAX_SP) {
            notes.push(`"${token}" — 챔피언스 능력 포인트는 한 능력치당 최대 ${MAX_SP}입니다. ${MAX_SP}로 맞췄습니다.`);
          }
          side.sp[stat] = Math.min(MAX_SP, n);
          if (m[3] === '+') {
            if (stat === 'hp') notes.push(`"${token}" — 체력에는 성격 보정이 없습니다.`);
            else side.natureHint.plus = stat;
          } else if (m[3] === '-') {
            if (stat === 'hp') notes.push(`"${token}" — 체력에는 성격 보정이 없습니다.`);
            else side.natureHint.minus = stat;
          }
          continue;
        }
      }

      // 5) 사전 조회 — 이미 채워진 슬롯은 건너뛰고 다음 후보로 넘어간다
      const cand = {
        species: KO.pokemon[key],
        move: KO.move[key],
        item: KO.item[key],
        ability: KO.ability[key],
        nature: KO.nature[key],
      };
      let matched = false;
      for (const slot of ['species', 'move', 'item', 'ability', 'nature']) {
        if (!cand[slot]) continue;
        if (slot === 'species' && !side.species) { side.species = cand.species; side.speciesKo = token; matched = true; break; }
        if (slot === 'move' && !side.move) { side.move = cand.move; side.moveKo = token; matched = true; break; }
        if (slot === 'item' && !side.item) { side.item = cand.item; side.itemKo = token; matched = true; break; }
        if (slot === 'ability' && !side.ability) { side.ability = cand.ability; side.abilityKo = token; matched = true; break; }
        if (slot === 'nature' && !side.nature) { side.nature = cand.nature; side.natureKo = token; matched = true; break; }
      }
      if (matched) continue;

      // 후보는 있었지만 슬롯이 이미 찬 경우와, 아예 모르는 단어를 구분한다
      if (Object.values(cand).some(Boolean)) {
        notes.push(`"${token}" — 같은 종류를 이미 입력해서 무시했습니다.`);
      } else {
        side.unknown.push(token);
      }
    }

    // 연타 타수 검증: 기술별 최대 타수를 넘으면 맞추고, 연타 기술이 아니면 무시한다.
    if (side.moveOpts.hits != null) {
      const meta = side.move ? KO.moveMeta[side.move] : null;
      const tok = side.hitsToken || (side.moveOpts.hits + '타');
      const nm = side.move ? ((KO.koName.move && KO.koName.move[side.move]) || side.move) : '이 기술';
      if (!meta || (meta.maxHits || 1) <= 1) {
        notes.push(`"${tok}" — ${nm}은(는) 연타 기술이 아닙니다.`);
        delete side.moveOpts.hits;
      } else if (side.moveOpts.hits > meta.maxHits) {
        notes.push(`"${tok}" — ${nm}은(는) 최대 ${meta.maxHits}타입니다. ${meta.maxHits}타로 맞췄습니다.`);
        side.moveOpts.hits = meta.maxHits;
      } else if (side.moveOpts.hits < (meta.minHits || 1)) {
        side.moveOpts.hits = meta.minHits;
      }
    }

    // 풀보정: 챔피언스는 스탯당 상한이 32라 "전부 252"가 성립하지 않는다.
    // 공격 기술이 있으면 그 기술이 쓰는 공격 능력치를 32+로, 순수 방어측이면 체/방/특방을 32로 준다.
    if (side.fullInvest) {
      if (side.move) {
        const meta = KO.moveMeta[side.move];
        const stat = meta && meta.cat === 'Special' ? 'spa' : 'atk';
        if (side.sp[stat] === undefined) side.sp[stat] = MAX_SP;
        if (!side.natureHint.plus) side.natureHint.plus = stat;
      } else {
        for (const stat of ['hp', 'def', 'spd']) {
          if (side.sp[stat] === undefined) side.sp[stat] = MAX_SP;
        }
      }
    }

    // 총량 경고는 사용자가 직접 배분했을 때만. 풀보정 축약은 의도된 초과라 조용히 넘어간다.
    const total = Object.values(side.sp).reduce((a, b) => a + b, 0);
    if (total > TOTAL_SP_CAP && !side.fullInvest) {
      notes.push(`능력 포인트 합계 ${total} — 챔피언스 상한(${TOTAL_SP_CAP})을 넘었습니다. 계산은 입력값 그대로 했습니다.`);
    }

    return side.species ? side : (hasAnything(side) ? side : null);
  }

  function hasAnything(side) {
    return !!(side.move || side.item || side.ability || Object.keys(side.sp).length ||
      side.unknown.length || side.fullInvest);
  }

  /** 성격 보정 기호(+/-)로부터 실제 성격을 역산한다. */
  function resolveNature(side) {
    if (side.nature) return side.nature;
    const {plus, minus} = side.natureHint;
    if (!plus && !minus) return 'Serious';
    const P = plus || (minus === 'atk' ? 'spa' : 'atk');
    const M = minus || (P === 'atk' ? 'spa' : 'atk');
    if (P === M) return 'Serious';
    for (const name of Object.keys(KO.natureMeta)) {
      const meta = KO.natureMeta[name];
      if (meta.plus === P && meta.minus === M) return name;
    }
    return 'Serious';
  }

  /**
   * 입력 한 줄을 해석한다.
   * @returns {{mode:'damage'|'firepower'|'durability', attacker, defender, field, notes, unknown, error}}
   */
  function parse(text) {
    const notes = [];
    const field = emptyField();

    const normalized = String(text || '')
      .replace(/=>|->|＞|>/g, ' vs ')
      .replace(/\s+/g, ' ')
      .trim();

    const parts = normalized.split(/(?:^|\s)vs(?:\s|$)/i);
    const hasVs = parts.length > 1;

    const attacker = parseSide(parts[0], field, notes);
    const defender = hasVs ? parseSide(parts.slice(1).join(' vs '), field, notes) : null;

    const unknown = []
      .concat(attacker ? attacker.unknown : [])
      .concat(defender ? defender.unknown : []);

    for (const side of [attacker, defender]) {
      if (side) side.nature = resolveNature(side);
    }

    let mode = null;
    let error = null;
    if (attacker && defender) {
      if (!attacker.species) error = '공격 포켓몬을 알아보지 못했습니다.';
      else if (!defender.species) error = '방어 포켓몬을 알아보지 못했습니다.';
      else if (!attacker.move) error = '기술을 입력해 주세요.';
      else mode = 'damage';
    } else if (attacker && !hasVs) {
      if (!attacker.species) error = '포켓몬을 알아보지 못했습니다.';
      else if (!attacker.move) error = '기술을 입력하면 결정력이, vs 를 앞에 붙이면 내구력이 나옵니다.';
      else mode = 'firepower';
    } else if (!attacker && defender) {
      if (!defender.species) error = '포켓몬을 알아보지 못했습니다.';
      else mode = 'durability';
    } else {
      error = '';
    }

    return {mode, attacker, defender, field, notes, unknown, error};
  }

  window.CC = Object.assign(window.CC || {}, {
    parse, normKo, STAT_LABEL, MAX_SP, TOTAL_SP_CAP,
  });
})();
