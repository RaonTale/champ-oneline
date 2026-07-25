// 계산 결과를 한글 문장으로 만든다.
// 엔진의 영어 desc 를 번역하는 대신, rawDesc(적용된 보정 목록)와 파싱 결과로 직접 조립한다.
(() => {
  'use strict';

  const KO = window.KO;
  const koName = (kind, en) => (KO.koName[kind] && KO.koName[kind][en]) || en;

  const STAT_SHORT = {hp: '체', atk: '공', def: '방', spa: '특공', spd: '특방', spe: '스'};
  const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

  const WEATHER_KO = {Sun: '쾌청', Rain: '비', Sand: '모래바람', Snow: '싸라기눈', 'Harsh Sunshine': '강한 햇살'};
  const TERRAIN_KO = {Electric: '일렉트릭필드', Grassy: '그래스필드', Misty: '미스트필드', Psychic: '사이코필드'};
  const STATUS_KO = {
    psn: '독', tox: '맹독', brn: '화상', par: '마비', slp: '잠듦', frz: '얼음',
  };

  /** "32+ Atk" 같은 능력 포인트 표기를 "공32+" 로 바꾼다. */
  function spLabel(side) {
    const parts = [];
    for (const stat of STAT_ORDER) {
      const v = side.sp[stat];
      if (v === undefined) continue;
      let sign = '';
      if (side.natureHint.plus === stat) sign = '+';
      else if (side.natureHint.minus === stat) sign = '-';
      parts.push(STAT_SHORT[stat] + v + sign);
    }
    return parts.join(' ');
  }

  /** 포켓몬 한 마리를 "+2 공32+ 생명의구슬 한카리아스" 형태로 쓴다. */
  function sideLabel(side) {
    const bits = [];
    if (side.boost) bits.push((side.boost > 0 ? '+' : '') + side.boost);
    const sp = spLabel(side);
    if (sp) bits.push(sp);
    if (side.nature && side.nature !== 'Serious' && !side.natureHint.plus && !side.natureHint.minus) {
      bits.push(koName('nature', side.nature));
    }
    if (side.noItem) bits.push('노템');
    else if (side.item) bits.push(koName('item', side.item));
    if (side.ability) bits.push(koName('ability', side.ability));
    if (side.status) bits.push(STATUS_KO[side.status] || side.status);
    bits.push(koName('pokemon', side.species));
    return bits.join(' ');
  }

  function fieldLabel(field) {
    const bits = [];
    if (field.weather) bits.push(WEATHER_KO[field.weather] || field.weather);
    if (field.terrain) bits.push(TERRAIN_KO[field.terrain] || field.terrain);
    if (field.defenderSide.isReflect) bits.push('리플렉터');
    if (field.defenderSide.isLightScreen) bits.push('빛의장막');
    if (field.defenderSide.isAuroraVeil) bits.push('오로라베일');
    if (field.defenderSide.isFriendGuard) bits.push('프렌드가드');
    if (field.attackerSide.isHelpingHand) bits.push('도우미');
    if (field.global.isGravity) bits.push('중력');
    if (field.gameType === 'Doubles') bits.push('더블');
    return bits.join(', ');
  }

  const KO_SUFFIX = [
    [/after sandstorm damage/g, '모래바람 데미지 포함'],
    [/after hail damage/g, '싸라기눈 데미지 포함'],
    [/after burn damage/g, '화상 데미지 포함'],
    [/after poison damage/g, '독 데미지 포함'],
    [/after toxic damage/g, '맹독 데미지 포함'],
    [/after Leftovers recovery/g, '먹다남은음식 회복 포함'],
    [/after Black Sludge damage/g, '검은진흙 데미지 포함'],
    [/after Grassy Terrain recovery/g, '그래스필드 회복 포함'],
    [/after Stealth Rock/g, '스텔스록 포함'],
    [/after \d+ layers? of Spikes/g, '압정뿌리기 포함'],
    [/after Leech Seed damage/g, '씨뿌리기 데미지 포함'],
    [/after Salt Cure damage/g, '소금절이 데미지 포함'],
    [/after Life Orb recoil/g, '생명의구슬 반동 포함'],
  ];

  /** "75% chance to 2HKO after ..." → "75% 난수 2타 (…)" */
  function koChanceKo(result) {
    let text;
    try {
      text = (result.kochance() || {}).text || '';
    } catch (e) {
      return '';
    }
    if (!text) return '';

    // 근사 확률이면 "approx. " 접두사가 붙는다 → "약"으로.
    let approx = '';
    if (/^approx\.\s*/i.test(text)) {
      approx = '약 ';
      text = text.replace(/^approx\.\s*/i, '').trim();
    }

    let suffix = '';
    for (const [re, ko] of KO_SUFFIX) {
      if (re.test(text)) {
        suffix = suffix ? suffix + ', ' + ko : ko;
        text = text.replace(re, '').trim();
      }
    }
    text = text.replace(/\s+and\s*$/, '').replace(/\s+after\s*$/, '').trim();

    // "OHKO"=1타, "2HKO"=2타. 접두 글자는 O(원턴) 또는 숫자.
    const hits = tok => (tok === 'O' ? 1 : Number(tok));
    let main = text;
    let m;
    if ((m = /^guaranteed (O|\d+)HKO$/.exec(text))) {
      main = '확정 ' + hits(m[1]) + '타';
    } else if ((m = /^([\d.]+)% chance to (O|\d+)HKO$/.exec(text))) {
      main = approx + m[1] + '% 난수 ' + hits(m[2]) + '타';
    } else if ((m = /^possible (O|\d+)HKO$/.exec(text))) {
      main = '낮은 확률 ' + hits(m[1]) + '타';
    } else if (/not a KO/.test(text)) {
      main = '쓰러뜨릴 수 없음';
    }
    return suffix ? `${main} (${suffix})` : main;
  }

  const fmt = n => n.toLocaleString('ko-KR');
  const pct = n => Math.round(n * 10) / 10;

  function describeDamage(spec, out) {
    const {result, defender} = out;
    const dmg = result.damage;
    const flat = Array.isArray(dmg) ? [].concat.apply([], dmg) : [dmg];
    const maxHP = defender.maxHP();

    let min = 0; let max = 0;
    if (Array.isArray(dmg) && Array.isArray(dmg[0])) {
      for (const roll of dmg) { min += roll[0]; max += roll[roll.length - 1]; }
    } else {
      min = Math.min.apply(null, flat);
      max = Math.max.apply(null, flat);
    }

    const head = `${sideLabel(spec.attacker)} ${koName('move', spec.attacker.move)}` +
      `${spec.attacker.moveOpts.hits ? ` ${spec.attacker.moveOpts.hits}타` : ''}` +
      `${spec.attacker.crit ? ' 급소' : ''}` +
      ` → ${sideLabel(spec.defender)}`;

    if (max <= 0) {
      return {
        head,
        main: '데미지 없음 (무효)',
        sub: fieldLabel(spec.field),
      };
    }

    const ko = koChanceKo(result);
    const minPct = min / maxHP * 100;
    const maxPct = max / maxHP * 100;
    return {
      head,
      main: `${fmt(min)}~${fmt(max)} (${pct(minPct)}~${pct(maxPct)}%)`,
      verdict: ko,
      sub: [fieldLabel(spec.field), `상대 체력 ${fmt(maxHP)}`].filter(Boolean).join(' · '),
      bar: {min: minPct, max: maxPct, lethal: minPct >= 100}, // 데미지 바용 (HP 대비 %)
    };
  }

  function describeFirepower(spec, out) {
    // 배율 분해를 "특공 194 × 위력 130 × 자속 1.5 × 쾌청 1.5 × 생명의구슬 1.3" 형태로.
    let sub;
    if (out.factors && out.factors.length) {
      sub = out.factors.map(f => (f.num != null ? f.num : `${f.label} ${f.mult}`)).join(' × ');
    } else {
      const stat = spec.attacker.move && KO.moveMeta[spec.attacker.move] &&
        KO.moveMeta[spec.attacker.move].cat === 'Special' ? '특공' : '공격';
      sub = `${stat} ${out.effAtk} × 위력 ${out.effBp}`;
    }
    return {
      head: `${sideLabel(spec.attacker)} ${koName('move', spec.attacker.move)}`,
      main: `결정력 ${fmt(out.value)}`,
      sub,
    };
  }

  function describeDurability(spec, out) {
    const p = out.pokemon;
    const modLabel = arr => (arr.length ? ` (${arr.join(', ')})` : '');
    return {
      head: sideLabel(spec.defender),
      main: `물리내구 ${fmt(out.physical)}　/　특수내구 ${fmt(out.special)}`,
      sub: [
        `체력 ${fmt(out.hp)}`,
        `방어 ${out.def}${modLabel(out.mods.physical)}`,
        `특방 ${out.spd}${modLabel(out.mods.special)}`,
        fieldLabel(spec.field),
      ].filter(Boolean).join(' · '),
      stats: p.rawStats,
    };
  }

  window.CC = Object.assign(window.CC || {}, {
    describeDamage, describeFirepower, describeDurability, koName, sideLabel, fieldLabel,
  });
})();
