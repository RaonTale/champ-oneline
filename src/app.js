// 입력창 ↔ 결과 연결. 입력/토글이 바뀔 때마다 parse → (토글 병합) → engine → describe → 렌더.
(() => {
  'use strict';

  const $input = document.getElementById('input');
  const $result = document.getElementById('result');
  const $hint = document.getElementById('hint');
  const $chips = document.getElementById('chips');
  const $controls = document.getElementById('controls');
  const $clear = document.getElementById('clearInput');
  let curShare = null; // 현재 계산 결과(이미지 공유용) {spec, desc}

  // ── 라이트/다크 (설정 패널의 '다크 모드' 스위치로 전환) ────────────────────────
  function effectiveTheme() {
    const set = document.documentElement.getAttribute('data-theme');
    if (set === 'dark' || set === 'light') return set;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function setTheme(next) {
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('champcalc-theme', next); } catch (e) {}
  }

  // 예시 풀(전부 오류·미인식 없이 실제 데미지가 나오는 것만). 매 접속 때 랜덤 3개만 보인다.
  const EXAMPLE_POOL = [
    // 데미지
    'a32+ 한카리아스 지진 vs h32 b32+ 더시마사리',
    '+2 공32+ 생명의구슬 한카 지진 vs h32 b32+ 크레베이스',
    'c32+ 메가리자몽Y 불대문자 vs h32 d32+ 마릴리',
    '-1 a32+ 한카리아스 지진 vs h32 b32+ 더시마사리',
    'a32+ 마릴리 아쿠아제트 vs -2b h32 한카리아스',
    'a32+ 크레베이스 바디프레스 vs h32 d32+ 삼삼드래',
    'c32+ 생명의구슬 삼삼드래 용성군 vs h32 d32+ 더시마사리',
    'a32 화상 한카리아스 지진 vs h32 b32+ 더시마사리',
    'c32 사이코필드 카디나르마 와이드포스 vs h32 마릴리',
    // 결정력
    'c32+ 생명의구슬 삼삼드래 악의파동',
    '+2 c32+ 메가리자몽Y 불대문자',
    '한카 지진',
    'c32 쾌청 메가리자몽Y 불대문자',
    '+2b32 크레베이스 바디프레스',
    'a32+ 목탄 리자몽 불대문자',
    // 내구력
    'vs h32 d32+ 크레베이스',
    'vs h32 b32+ 리플렉터 무장조',
    'vs +2b h32 크레베이스',
    'vs h32 마릴리',
  ];

  // Fisher–Yates 로 섞어 앞에서 n개.
  function sample(pool, n) {
    const a = pool.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  }
  const EXAMPLES = sample(EXAMPLE_POOL, 3);

  const esc = s => String(s).replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));
  const MODE_LABEL = {damage: '데미지', firepower: '결정력', durability: '내구력'};

  // 타입별 색(데미지 칸 옅은 배경) · 상성 배율 라벨(효과 굉장함 등)
  const TYPE_COLOR = {
    Normal: '#9fa19f', Fire: '#e0803a', Water: '#4a80e0', Electric: '#e6c22e', Grass: '#4caf50',
    Ice: '#57c4cf', Fighting: '#d5425a', Poison: '#a95bc0', Ground: '#cba24a', Flying: '#84a7e6',
    Psychic: '#e6608a', Bug: '#93b035', Rock: '#b8a35a', Ghost: '#6a5ab0', Dragon: '#5a5ad8',
    Dark: '#5a5560', Steel: '#7f909e', Fairy: '#e08ac0',
  };
  const EFF_INFO = {
    0: {t: '효과 없음', c: '#8a8f98'},
    0.25: {t: '효과 매우 별로', c: '#d5425a'},
    0.5: {t: '효과 별로', c: '#e0803a'},
    2: {t: '효과 굉장함', c: '#2f9e6a'},
    4: {t: '효과 매우 굉장함', c: '#1f9d55'},
  };
  function typeTint(en, alpha) {
    const hex = TYPE_COLOR[en];
    if (!hex) return '';
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  // 타입 배지 글씨색 — 배경(타입색) 밝기에 따라 검정/흰색 자동 선택(테마 무관 가독성).
  function typeTextColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#17181c' : '#ffffff';
  }
  // 타입색을 살짝 어둡게 → 배지 테두리(라이트·다크 양쪽에서 윤곽 정의).
  function typeShade(hex, f) {
    const r = Math.round(parseInt(hex.slice(1, 3), 16) * f);
    const g = Math.round(parseInt(hex.slice(3, 5), 16) * f);
    const b = Math.round(parseInt(hex.slice(5, 7), 16) * f);
    return `rgb(${r},${g},${b})`;
  }

  // ── 상단 토글 상태 ─────────────────────────────────────────────────────────
  const WEATHERS = [
    {key: 'Sun', label: '쾌청'},
    {key: 'Rain', label: '비'},
    {key: 'Sand', label: '모래'},
    {key: 'Snow', label: '싸라기눈'},
  ];
  const TERRAINS = [
    {key: 'Electric', label: '일렉트릭'},
    {key: 'Grassy', label: '그래스'},
    {key: 'Misty', label: '미스트'},
    {key: 'Psychic', label: '사이코'},
  ];
  // 클릭으로 켠 수동 상태. 텍스트에 날씨/필드/벽이 적히면 그쪽이 우선이며 토글에 자동 반영된다.
  const control = {weather: '', terrain: '', reflect: false, lightScreen: false};
  const weatherBtn = {};   // key → button
  const terrainBtn = {};   // key → button
  const screenBtn = {};    // key(reflect/lightScreen) → button

  function buildControls() {
    // 날씨 (단일 선택 · 같은 걸 다시 누르면 꺼짐)
    const wGroup = document.createElement('div');
    wGroup.className = 'ctrlGroup gWeather';
    wGroup.innerHTML = '<span class="ctrlLabel">날씨</span>';
    const seg = document.createElement('div');
    seg.className = 'seg';
    WEATHERS.forEach(w => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'segBtn';
      b.textContent = w.label;
      b.addEventListener('click', () => {
        control.weather = control.weather === w.key ? '' : w.key;
        render();
      });
      weatherBtn[w.key] = b;
      seg.appendChild(b);
    });
    wGroup.appendChild(seg);

    // 필드 (단일 선택 · 같은 걸 다시 누르면 꺼짐)
    const tGroup = document.createElement('div');
    tGroup.className = 'ctrlGroup gField';
    tGroup.innerHTML = '<span class="ctrlLabel">필드</span>';
    const tseg = document.createElement('div');
    tseg.className = 'seg';
    TERRAINS.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'segBtn terrain';
      b.textContent = t.label;
      b.addEventListener('click', () => {
        control.terrain = control.terrain === t.key ? '' : t.key;
        render();
      });
      terrainBtn[t.key] = b;
      tseg.appendChild(b);
    });
    tGroup.appendChild(tseg);

    // 벽 (독립 토글)
    const sGroup = document.createElement('div');
    sGroup.className = 'ctrlGroup gWall';
    sGroup.innerHTML = '<span class="ctrlLabel">벽</span>';
    const screens = document.createElement('div');
    screens.className = 'seg';
    [['reflect', '리플렉터'], ['lightScreen', '빛의장막']].forEach(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'segBtn toggle';
      b.textContent = label;
      b.addEventListener('click', () => {
        control[key] = !control[key];
        render();
      });
      screenBtn[key] = b;
      screens.appendChild(b);
    });
    sGroup.appendChild(screens);

    $controls.appendChild(wGroup);
    $controls.appendChild(tGroup);
    $controls.appendChild(sGroup);
  }

  // 토글 UI를 실제 적용값에 맞춰 동기화. 텍스트로 켜진 건 눌린 상태로 고정 표시(bytext).
  function syncControlsUI(textWeather, textTerrain, textReflect, textLight) {
    const effWeather = textWeather || control.weather;
    for (const key of Object.keys(weatherBtn)) {
      weatherBtn[key].classList.toggle('on', effWeather === key);
      weatherBtn[key].classList.toggle('bytext', !!textWeather && textWeather === key);
    }
    const effTerrain = textTerrain || control.terrain;
    for (const key of Object.keys(terrainBtn)) {
      terrainBtn[key].classList.toggle('on', effTerrain === key);
      terrainBtn[key].classList.toggle('bytext', !!textTerrain && textTerrain === key);
    }
    screenBtn.reflect.classList.toggle('on', textReflect || control.reflect);
    screenBtn.reflect.classList.toggle('bytext', textReflect);
    screenBtn.lightScreen.classList.toggle('on', textLight || control.lightScreen);
    screenBtn.lightScreen.classList.toggle('bytext', textLight);
  }

  // 토글 상태를 파싱 결과(field)에 얹는다. 텍스트에 적힌 날씨/필드/벽이 우선.
  function applyControls(spec) {
    if (!spec || !spec.field) return;

    const textWeather = spec.field.weather || '';
    const textTerrain = spec.field.terrain || '';
    const textReflect = !!spec.field.defenderSide.isReflect;
    const textLight = !!spec.field.defenderSide.isLightScreen;

    const effWeather = textWeather || control.weather;
    if (effWeather) spec.field.weather = effWeather;
    const effTerrain = textTerrain || control.terrain;
    if (effTerrain) spec.field.terrain = effTerrain;
    if (textReflect || control.reflect) spec.field.defenderSide.isReflect = true;
    if (textLight || control.lightScreen) spec.field.defenderSide.isLightScreen = true;

    syncControlsUI(textWeather, textTerrain, textReflect, textLight);
  }

  // 데미지 바 — 맞은 뒤 "남는 체력"을 HP 게이지로. 초록=확정 생존 HP,
  // 빗금(초록/빨강 교차)=난수로 갈리는 구간, 빨강 바탕=깎인 체력.
  function dmgBarHTML(bar) {
    const clamp = v => Math.max(0, Math.min(100, v));
    const remainMin = 100 - bar.max; // 최대 데미지 시 남는 HP(확정 생존분)
    const remainMax = 100 - bar.min; // 최소 데미지 시 남는 HP
    const green = clamp(remainMin);
    const stripeW = Math.max(0, clamp(remainMax) - green);
    const lethal = bar.min >= 100;
    let label;
    if (lethal) label = '기절! (확정)';
    else if (bar.max >= 100) label = `남은 HP 0~${Math.round(remainMax)}% · 난수 기절`;
    else label = `남은 HP ${Math.round(remainMin)}~${Math.round(remainMax)}%`;
    return `<div class="dmgBar${lethal ? ' lethal' : ''}" role="img" aria-label="${esc(label)}">` +
      `<div class="dmgBarHpU" style="left:${green}%;width:${stripeW}%"></div>` +
      `<div class="dmgBarHp" style="width:${green}%"></div>` +
      `<div class="dmgBarTxt">${esc(label)}</div>` +
      `</div>`;
  }

  // ── 렌더 ───────────────────────────────────────────────────────────────────
  function render() {
    $result.style.background = ''; // 이전 타입 배경 리셋 (데미지 결과에서만 다시 칠함)
    curShare = null;               // 계산 결과일 때만 아래에서 다시 채움(이미지 공유용)
    const text = $input.value;
    if ($clear) $clear.hidden = !text;   // 텍스트 있을 때만 지우기 버튼
    if (!text.trim()) {
      $result.innerHTML = '<div class="placeholder">포켓몬과 기술을 입력하면 결과가 바로 나옵니다.</div>';
      $hint.textContent = '';
      syncControlsUI('', '', false, false); // 텍스트 없이 수동 토글만 반영
      return;
    }

    // 이름만 입력하면 도감 카드(포켓몬/기술/특성).
    const info = infoQuery(text);
    if (info) { renderDexCard(info); return; }

    let spec;
    try {
      spec = window.CC.parse(text);
    } catch (e) {
      $result.innerHTML = `<div class="error">해석 중 오류: ${esc(e.message)}</div>`;
      return;
    }

    if (spec.error != null && spec.mode == null) {
      $result.innerHTML = spec.error
        ? `<div class="error">${esc(spec.error)}</div>`
        : '<div class="placeholder">포켓몬과 기술을 입력하면 결과가 바로 나옵니다.</div>';
      renderHint(spec);
      return;
    }

    applyControls(spec);

    let desc;
    try {
      if (spec.mode === 'damage') desc = window.CC.describeDamage(spec, window.CC.damage(spec));
      else if (spec.mode === 'firepower') desc = window.CC.describeFirepower(spec, window.CC.firepower(spec));
      else if (spec.mode === 'durability') desc = window.CC.describeDurability(spec, window.CC.durability(spec));
    } catch (e) {
      $result.innerHTML = `<div class="error">계산 중 오류: ${esc(e.message)}</div>`;
      renderHint(spec);
      return;
    }

    const parts = [];
    parts.push(`<div class="mode mode-${spec.mode}">${MODE_LABEL[spec.mode]}</div>`);
    parts.push(`<div class="matchup">${esc(desc.head)}</div>`);
    if (desc.index) parts.push(`<div class="dmgIndex">${esc(desc.index)}</div>`);
    // 상성 배지 (효과 굉장함 ×2 등) — 중립(×1)은 표시 안 함
    let mainHtml = esc(desc.main);
    const ei = desc.eff != null && desc.eff !== 1 ? EFF_INFO[desc.eff] : null;
    if (ei) mainHtml += ` <span class="effBadge" style="color:${ei.c}">${ei.t} ×${desc.eff}</span>`;
    parts.push(`<div class="main">${mainHtml}</div>`);
    if (desc.verdict) parts.push(`<div class="verdict">${esc(desc.verdict)}</div>`);
    if (desc.bar) parts.push(dmgBarHTML(desc.bar));
    if (desc.sub) parts.push(`<div class="sub">${esc(desc.sub)}</div>`);
    parts.push('<button class="shareBtn" type="button">📷 이미지로 공유</button>');
    curShare = {spec, desc};
    $result.innerHTML = parts.join('');
    // 결과 칸 타입 배경색
    $result.style.background = desc.type
      ? `linear-gradient(0deg, ${typeTint(desc.type, 0.16)}, ${typeTint(desc.type, 0.16)}), var(--card)`
      : '';

    renderHint(spec);
  }

  function renderHint(spec) {
    const bits = [];
    for (const n of spec.notes || []) bits.push(`<span class="note">${esc(n)}</span>`);
    $hint.innerHTML = bits.join('');
  }

  // ── 도감 카드 (이름만 입력하면 그 포켓몬/기술/특성 카드) ──────────────────────
  const STAT_KO = ['HP', '공격', '방어', '특공', '특방', '스피드'];
  const capType = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  const SPRITE_URL = pid => `assets/sprites/${pid}.png`; // 로컬 번들(오프라인)
  const abilityKo = en => (window.KO.koName.ability && window.KO.koName.ability[en]) || en;
  function abilityFlavor(en) {
    const ko = abilityKo(en);
    const notes = window.CHAMP && window.CHAMP.abilityNotes;
    return (notes && notes[ko]) || (window.DEX && window.DEX.ability && window.DEX.ability[en]) || '';
  }
  function moveFlavor(en) {
    const ko = (window.KO.koName.move && window.KO.koName.move[en]) || en;
    const notes = window.CHAMP && window.CHAMP.moveNotes;
    if (notes && notes[ko]) return notes[ko];
    const d = (window.DEX && window.DEX.move && window.DEX.move[en]) || {};
    return d.flavor || '';
  }
  function genderStr(rate) {
    if (rate == null || rate < 0) return '무성';
    const f = rate / 8 * 100, m = 100 - f;
    if (f === 0) return '♂ 100%';
    if (f === 100) return '♀ 100%';
    return `♂ ${m}% · ♀ ${f}%`;
  }
  function typeBadge(enType) {
    const hex = TYPE_COLOR[enType] || '#888888';
    return `<span class="typeBadge" style="background:${hex};color:${typeTextColor(hex)};border-color:${typeShade(hex, 0.72)}">${esc(koType(enType))}</span>`;
  }
  // 이름만 입력하면 카드. 포켓몬 > 기술 > 특성 순.
  function infoQuery(text) {
    const t = (text || '').trim();
    if (!t) return null;
    const key = normKo(t);
    const K = window.KO || {};
    const pk = K.pokemon && K.pokemon[key];
    if (pk && cardPokemon(pk)) return {kind: 'pokemon', en: pk};
    const mv = K.move && K.move[key];
    if (mv && (window.MOVEINFO || {})[mv]) return {kind: 'move', en: mv};
    const ab = K.ability && K.ability[key];
    if (ab) return {kind: 'ability', en: ab};
    return null;
  }

  // 카드 데이터 = dex.js(대량) ⊕ speciesOverrides(신규·수정, 계산기와 공유).
  function cardPokemon(en) {
    const base = (window.DEX && window.DEX.pokemon && window.DEX.pokemon[en]) || null;
    const ov = (window.CHAMP && window.CHAMP.speciesOverrides && window.CHAMP.speciesOverrides[en]) || null;
    if (!base && !ov) return null;
    const pick = (o, b, d) => (o != null && o !== '' ? o : (b != null && b !== '' ? b : d));
    const statsOv = ov && ov.baseStats ? [ov.baseStats.hp, ov.baseStats.atk, ov.baseStats.def, ov.baseStats.spa, ov.baseStats.spd, ov.baseStats.spe] : null;
    let abilities;
    if (ov && ov.abilities && ov.abilities.length) {
      abilities = ov.abilities.map(aen => ({en: aen, ko: abilityKo(aen), flavor: abilityFlavor(aen), hidden: false}));
    } else if (base && base.abilities) {
      abilities = base.abilities.map(a => ({
        en: a.en, ko: a.ko, hidden: a.hidden,
        flavor: (window.CHAMP.abilityNotes && window.CHAMP.abilityNotes[a.ko]) || a.flavor ||
          (a.en && window.DEX.ability && window.DEX.ability[a.en]) || '',
      }));
    } else abilities = [];
    return {
      en,
      ko: pick(ov && ov.ko, base && base.ko, en),
      ja: pick(ov && ov.ja, base && base.ja, ''),
      genus: pick(ov && ov.genus, base && base.genus, ''),
      gender: (ov && ov.gender != null) ? ov.gender : (base ? base.gender : -1),
      flavor: pick(ov && ov.flavor, base && base.flavor, ''),
      pid: (ov && ov.pid != null) ? ov.pid : (base ? base.pid : null),
      types: (ov && ov.types) ? ov.types.map(t => String(t).toLowerCase()) : (base ? base.types : []),
      stats: statsOv || (base ? base.stats : [0, 0, 0, 0, 0, 0]),
      height: (ov && ov.heightm != null) ? Math.round(ov.heightm * 10) : (base ? base.height : null),
      weight: (ov && ov.weightkg != null) ? Math.round(ov.weightkg * 10) : (base ? base.weight : null),
      abilities,
    };
  }

  function pokeCardHTML(en) {
    const p = cardPokemon(en);
    const typesHtml = p.types.map(t => typeBadge(capType(t))).join('');
    const sprite = p.pid != null
      ? `<div class="dpSpriteWrap"><img class="dpSprite" src="${SPRITE_URL(p.pid)}" alt="${esc(p.ko)}" loading="lazy" onerror="this.style.visibility='hidden'"></div>`
      : '';
    const meta = [
      p.height != null ? `키 <b>${p.height / 10}</b> m` : '',
      p.weight != null ? `무게 <b>${p.weight / 10}</b> kg` : '',
      `성별 <b>${genderStr(p.gender)}</b>`,
    ].filter(Boolean).join('<span class="dpDot">·</span>');
    const total = p.stats.reduce((a, b) => a + b, 0);
    const statCells = STAT_KO.map((lab, i) =>
      `<div class="dpStat"><span class="dpStatL">${lab}</span><span class="dpStatV">${p.stats[i]}</span></div>`).join('') +
      `<div class="dpStat dpTotal"><span class="dpStatL">합계</span><span class="dpStatV">${total}</span></div>`;
    const abilHtml = p.abilities.map(a =>
      `<div class="dpAbil"><div class="dpAbilName">${esc(a.ko)}${a.hidden ? '<span class="dpHidden">숨은특성</span>' : ''}</div>` +
      (a.flavor ? `<div class="dpAbilDesc">${esc(a.flavor)}</div>` : '') + `</div>`).join('');
    const subline = [p.en, p.ja].filter(Boolean).join(' · ');
    return `<div class="dexCard">` +
      `<div class="dpTop">${sprite}<div class="dpId">` +
        `<div class="dpKo">${esc(p.ko)}${p.genus ? `<span class="dpGenus">${esc(p.genus)}</span>` : ''}</div>` +
        `<div class="dpEn">${esc(subline)}</div>` +
        `<div class="dpTypes">${typesHtml}</div></div>` +
      `</div>` +
      `<div class="dpMeta">${meta}</div>` +
      `<div class="dpStats">${statCells}</div>` +
      (p.abilities.length ? `<div class="dpAbilBlock"><div class="dpSection">특성</div>${abilHtml}</div>` : '') +
      (p.flavor ? `<div class="dpFlavor">${esc(p.flavor)}</div>` : '') +
      `</div>`;
  }

  function moveCardHTML(en) {
    const i = (window.MOVEINFO || {})[en] || {};
    const d = (window.DEX && window.DEX.move && window.DEX.move[en]) || {};
    const koMv = (window.KO.koName.move && window.KO.koName.move[en]) || en;
    let priority = 0, acc = d.acc;
    try {
      const m = window.calc.Generations.get(0).moves.get(window.calc.toID(en));
      if (m) { priority = m.priority || 0; if (acc == null) acc = (m.accuracy === true ? null : m.accuracy); }
    } catch (e) { /* 무시 */ }
    const cells = [
      i.c !== 'Status' ? `<div class="dmStat"><span class="dmStatL">위력</span><span class="dmStatV">${i.p ? i.p : '-'}</span></div>` : '',
      `<div class="dmStat"><span class="dmStatL">명중</span><span class="dmStatV">${acc == null ? '—' : acc}</span></div>`,
      `<div class="dmStat"><span class="dmStatL">PP</span><span class="dmStatV">${i.pp != null ? i.pp : '-'}</span></div>`,
      `<div class="dmStat"><span class="dmStatL">우선도</span><span class="dmStatV">${priority > 0 ? '+' + priority : priority}</span></div>`,
      d.sec ? `<div class="dmStat"><span class="dmStatL">부가효과</span><span class="dmStatV">${d.sec}%</span></div>` : '',
    ].filter(Boolean).join('');
    const flavor = moveFlavor(en);
    return `<div class="dexCard">` +
      `<div class="dmHead"><span class="dmName">${esc(koMv)}</span>${typeBadge(i.t)}<span class="dmCat">/ ${CAT_KO_SHORT[i.c] || '-'}</span></div>` +
      `<div class="dmStats">${cells}</div>` +
      (flavor ? `<div class="dmFlavor">${esc(flavor)}</div>` : '') +
      `</div>`;
  }

  function abilCardHTML(en) {
    const ko = abilityKo(en);
    const flavor = abilityFlavor(en);
    return `<div class="dexCard">` +
      `<div class="daHead"><span class="dmName">${esc(ko)}</span><span class="daEn">${esc(en)}</span></div>` +
      (flavor
        ? `<div class="dmFlavor">${esc(flavor)}</div>`
        : `<div class="dmFlavor" style="color:var(--muted)">설명이 아직 없습니다.</div>`) +
      `</div>`;
  }

  function renderDexCard(info) {
    syncControlsUI('', '', false, false);
    $hint.textContent = '';
    $result.style.background = '';
    $result.innerHTML =
      info.kind === 'pokemon' ? pokeCardHTML(info.en) :
      info.kind === 'move' ? moveCardHTML(info.en) : abilCardHTML(info.en);
  }

  // ── 결과 이미지 공유 (캔버스 직접 그리기 · 외부 라이브러리 없음 · 오프라인 OK) ──
  function shareThemeColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, d) => ((cs.getPropertyValue(n) || '').trim() || d);
    return {
      card: g('--card', '#1e2127'), ink: g('--ink', '#e8eaed'), ink2: g('--ink2', '#c4cad3'),
      muted: g('--muted', '#9aa0aa'), accent: g('--accent', '#ff5a5a'), line: g('--line', '#2c303a'),
      bg: g('--bg', '#14161a'), ok: g('--ok', '#4ade80'),
    };
  }
  function loadImg(src) {
    return new Promise(res => {
      if (!src) return res(null);
      const im = new Image();
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = src;
    });
  }
  function sharePid(sp) { const p = sp ? cardPokemon(sp) : null; return p && p.pid != null ? p.pid : null; }
  function shareKoName(sp) { return (window.KO.koName.pokemon && window.KO.koName.pokemon[sp]) || sp || ''; }
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fitText(ctx, text, cx, y, maxW, size, font, weight) {
    let s = size;
    ctx.font = `${weight} ${s}px ${font}`;
    while (s > 9 && ctx.measureText(text).width > maxW) { s -= 1; ctx.font = `${weight} ${s}px ${font}`; }
    ctx.fillText(text, cx, y);
  }
  const SHARE_FONT = '"Pretendard", -apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

  // desc.head("공32+ 한카리아스 지진 → 체32 방32+ 더시마사리")를 좌/우로 나눈다.
  function splitHead(head) {
    const i = head.indexOf('→');
    return i >= 0 ? [head.slice(0, i).trim(), head.slice(i + 1).trim()] : [head.trim(), ''];
  }
  function sideDetail(part, koName) {
    return part.replace(koName, '').replace(/\s+/g, ' ').trim();  // 이름 뺀 나머지(투자·기술)
  }

  async function buildShareCanvas() {
    const {spec, desc} = curShare;
    const C = shareThemeColors();
    const atkSp = spec.attacker && spec.attacker.species;
    const defSp = spec.defender && spec.defender.species;
    const [atkImg, defImg] = await Promise.all([
      loadImg(sharePid(atkSp) ? SPRITE_URL(sharePid(atkSp)) : null),
      loadImg(sharePid(defSp) ? SPRITE_URL(sharePid(defSp)) : null),
    ]);
    // 표시할 side 구성(공격/방어). durability 는 방어측만.
    const [lp, rp] = splitHead(desc.head || '');
    const sides = [];
    if (atkSp) sides.push({sp: atkSp, img: atkImg, detail: sideDetail(rp ? lp : lp, shareKoName(atkSp))});
    if (defSp) sides.push({sp: defSp, img: defImg, detail: sideDetail(rp || lp, shareKoName(defSp))});

    const W = 600, S = 2, P = 32;
    let H = 62;                                   // 헤더~스프라이트 상단
    H += sides.length ? 146 : 8;                  // 스프라이트+이름+투자
    H += 68;                                       // 메인(간격 포함)
    if (desc.eff != null && desc.eff !== 1 && EFF_INFO[desc.eff]) H += 24;
    if (desc.verdict) H += 28;
    if (desc.sub) H += 24;
    H += 42;                                       // 푸터
    const cv = document.createElement('canvas');
    cv.width = W * S; cv.height = H * S;
    const ctx = cv.getContext('2d');
    ctx.scale(S, S);

    // 배경 + 타입 색 스트립
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    roundRectPath(ctx, 8, 8, W - 16, H - 16, 18); ctx.fillStyle = C.card; ctx.fill();
    const tHex = desc.type && TYPE_COLOR[desc.type];
    if (tHex) { ctx.save(); roundRectPath(ctx, 8, 8, W - 16, 8, 4); ctx.fillStyle = tHex; ctx.fill(); ctx.restore(); }

    // 헤더
    let y = 42;
    ctx.textAlign = 'left'; ctx.font = '800 16px ' + SHARE_FONT; ctx.fillStyle = C.ink;
    ctx.fillText('⚡ 챔피언스 한 줄 계산기', P, y);
    const modeLabel = MODE_LABEL[spec.mode] || '';
    const modeColor = {damage: C.accent, firepower: '#e0803a', durability: '#3a72e0'}[spec.mode] || C.accent;
    ctx.font = '700 12px ' + SHARE_FONT; const mw = ctx.measureText(modeLabel).width + 22;
    roundRectPath(ctx, W - P - mw, y - 15, mw, 23, 11); ctx.fillStyle = modeColor; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(modeLabel, W - P - mw / 2, y);
    y += 20;

    // 스프라이트(크게) + 이름 + 투자
    if (sides.length) {
      const sz = 104, topY = y;
      const drawMon = (s, cx) => {
        if (s.img) ctx.drawImage(s.img, cx - sz / 2, topY, sz, sz);
        else { // 스프라이트 없음(커스텀 몬 등) → 타입색 원 플레이스홀더
          const p = cardPokemon(s.sp); const th = (p && p.types[0] && TYPE_COLOR[capType(p.types[0])]) || C.muted;
          ctx.beginPath(); ctx.arc(cx, topY + sz / 2, sz / 2 - 8, 0, 7); ctx.fillStyle = th; ctx.globalAlpha = .18; ctx.fill(); ctx.globalAlpha = 1;
          ctx.fillStyle = th; ctx.textAlign = 'center'; ctx.font = '700 30px ' + SHARE_FONT;
          ctx.fillText(shareKoName(s.sp).slice(0, 1), cx, topY + sz / 2 + 11);
        }
        ctx.textAlign = 'center'; ctx.font = '800 16px ' + SHARE_FONT; ctx.fillStyle = C.ink;
        ctx.fillText(shareKoName(s.sp), cx, topY + sz + 22);
        if (s.detail) { ctx.font = '600 12.5px ' + SHARE_FONT; ctx.fillStyle = C.muted; fitText(ctx, s.detail, cx, topY + sz + 40, 250, 12.5, SHARE_FONT, '600'); }
      };
      if (sides.length === 2) {
        drawMon(sides[0], W / 2 - 138);
        drawMon(sides[1], W / 2 + 138);
        ctx.textAlign = 'center'; ctx.font = '800 24px ' + SHARE_FONT; ctx.fillStyle = C.muted;
        ctx.fillText('VS', W / 2, topY + sz / 2 + 8);
      } else {
        drawMon(sides[0], W / 2);
      }
      y = topY + 146;
    }

    // 메인(큰 값)
    y += 46;
    ctx.textAlign = 'center'; ctx.fillStyle = C.ink;
    fitText(ctx, desc.main, W / 2, y, W - 2 * P, 34, SHARE_FONT, '800');
    y += 22;
    if (desc.eff != null && desc.eff !== 1 && EFF_INFO[desc.eff]) {
      const ei = EFF_INFO[desc.eff];
      ctx.textAlign = 'center'; ctx.font = '700 15px ' + SHARE_FONT; ctx.fillStyle = ei.c;
      ctx.fillText(`${ei.t} ×${desc.eff}`, W / 2, y); y += 24;
    }
    if (desc.verdict) {
      ctx.textAlign = 'center'; ctx.fillStyle = C.ok;
      fitText(ctx, desc.verdict, W / 2, y + 4, W - 2 * P, 17, SHARE_FONT, '700'); y += 28;
    }
    if (desc.sub) {
      ctx.textAlign = 'center'; ctx.fillStyle = C.muted;
      fitText(ctx, desc.sub, W / 2, y + 2, W - 2 * P, 13, SHARE_FONT, '400'); y += 24;
    }
    ctx.textAlign = 'center'; ctx.font = '400 12px ' + SHARE_FONT; ctx.fillStyle = C.muted;
    ctx.fillText('raontale.github.io/champ-oneline', W / 2, H - 20);
    return cv;
  }

  async function shareImage() {
    if (!curShare) return;
    let cv;
    try { cv = await buildShareCanvas(); } catch (e) { return; }
    cv.toBlob(async blob => {
      if (!blob) return;
      const file = new File([blob], 'champcalc.png', {type: 'image/png'});
      if (navigator.canShare && navigator.canShare({files: [file]})) {
        try { await navigator.share({files: [file], title: '챔피언스 계산 결과'}); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'champcalc.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }

  // ── 자동완성 ──────────────────────────────────────────────────────────────
  const $suggest = document.getElementById('suggest');
  const normKo = window.CC.normKo;

  const CAT = [['pokemon', '포켓몬'], ['move', '기술'], ['item', '도구'], ['ability', '특성']];
  const CAT_ORDER = {pokemon: 0, move: 1, item: 2, ability: 3};
  const CAT_CLASS = {pokemon: 'sPoke', move: 'sMove', item: 'sItem', ability: 'sAbil'};

  // 카테고리별로 en 당 1개 항목({name(대표 한글명), keys(별칭 포함 검색키)}).
  const SUGGEST_INDEX = (() => {
    const byId = new Map();
    for (const [dictKey, catKo] of CAT) {
      const dict = window.KO[dictKey] || {};
      const koName = (window.KO.koName && window.KO.koName[dictKey]) || {};
      for (const aliasKey of Object.keys(dict)) {
        const en = dict[aliasKey];
        const id = dictKey + '|' + en;
        let e = byId.get(id);
        if (!e) {
          const name = koName[en] || aliasKey;
          // 메가스톤(○○나이트)은 잘 안 쓰여서 자동완성 하위로 (메가리자몽Y가 리자몽나이트Y보다 위)
          const mega = dictKey === 'item' && /나이트[XY]?$/.test(name);
          e = {cat: dictKey, catKo, en, name, nkey: normKo(name), mega, keys: new Set([normKo(name)])};
          byId.set(id, e);
        }
        e.keys.add(aliasKey);
      }
    }
    return [...byId.values()];
  })();

  let sugItems = [];
  let sugActive = -1;

  // 커서가 놓인 단어(공백 기준)의 범위와 지금까지 입력된 부분.
  function currentToken() {
    const val = $input.value;
    const pos = $input.selectionStart;
    const left = val.slice(0, pos).match(/[^\s]*$/)[0];
    const right = val.slice(pos).match(/^[^\s]*/)[0];
    return {start: pos - left.length, end: pos + right.length, query: left};
  }

  // 커서가 놓인 side(vs 기준)의 텍스트를 구한다(편집 중 토큰은 제외). 방어측 여부도 함께.
  function currentSide() {
    const val = $input.value;
    const pos = $input.selectionStart;
    // vs 경계(첫 번째): 'vs' 단어 또는 화살표(->, =>, ＞, >)
    let bStart = -1, bEnd = -1;
    const vm = /(^|\s)vs(\s|$)/i.exec(val);
    if (vm) { bStart = vm.index + vm[1].length; bEnd = bStart + 2; }
    const am = /->|=>|＞|>/.exec(val);
    if (am && (bStart < 0 || am.index < bStart)) { bStart = am.index; bEnd = am.index + am[0].length; }
    const isDefender = bStart >= 0 && pos > bStart;
    const {start, end} = currentToken();
    const cleaned = val.slice(0, start) + ' '.repeat(end - start) + val.slice(end);
    const sideText = bStart < 0 ? cleaned : isDefender ? cleaned.slice(bEnd) : cleaned.slice(0, bStart);
    let side = null;
    try { const spec = window.CC.parse(sideText); side = spec.attacker || spec.defender; } catch (e) { /* 무시 */ }
    return {side, isDefender};
  }

  // 같은 종류(포켓몬·기술·도구·특성)는 다시 추천하지 않고, 방어측(vs 뒤)은 기술을 안 쓴다.
  function filledCatsHere() {
    const {side, isDefender} = currentSide();
    const filled = new Set();
    if (side) {
      if (side.species) filled.add('pokemon');
      if (side.move) filled.add('move');
      if (side.item || side.noItem) filled.add('item');
      if (side.ability) filled.add('ability');
      if (side.species && /-Mega/.test(side.species)) filled.add('item'); // 메가폼은 스톤 착용 → 도구 제외
    }
    if (isDefender) filled.add('move'); // 방어측은 기술이 없음
    return filled;
  }

  function computeSuggestions(query) {
    const q = normKo(query);
    // 한글이 들어간 단어에만 (a32·hd 같은 능력치 토큰엔 안 뜨게)
    if (!q || !/[가-힣ㄱ-ㅎ]/.test(query)) return [];
    const filled = filledCatsHere();
    const prefix = [];   // 별칭·이름이 q 로 시작 (생구·하펌 등 줄임말 포함)
    const contains = []; // 중간에 q 를 포함 (일부만 친 경우 대비)
    for (const e of SUGGEST_INDEX) {
      if (filled.has(e.cat)) continue; // 이 side에 이미 있는 종류는 추천 제외
      let pre = false, con = false;
      for (const k of e.keys) {
        if (k.startsWith(q)) { pre = true; break; }
        if (!con && k.indexOf(q) >= 0) con = true;
      }
      if (pre) prefix.push(e);
      else if (con) contains.push(e);
    }
    const byCat = (a, b) =>
      (a.mega ? 1 : 0) - (b.mega ? 1 : 0) ||          // 메가도구는 뒤로
      CAT_ORDER[a.cat] - CAT_ORDER[b.cat] ||
      a.name.length - b.name.length ||
      a.name.localeCompare(b.name);
    prefix.sort((a, b) =>
      (a.mega ? 1 : 0) - (b.mega ? 1 : 0) ||          // 메가도구는 뒤로 (메가리자몽Y > 리자몽나이트Y)
      (a.nkey.startsWith(q) ? 0 : 1) - (b.nkey.startsWith(q) ? 0 : 1) || byCat(a, b));
    contains.sort(byCat);
    return prefix.concat(contains).slice(0, 8); // 앞글자 일치 우선, 그 뒤 부분일치
  }

  function renderSuggest() {
    $suggest.classList.remove('asPanel');
    if (!sugItems.length) { $suggest.style.display = 'none'; $suggest.innerHTML = ''; return; }
    $suggest.innerHTML = sugItems.map((e, i) =>
      `<div class="sItemRow${i === sugActive ? ' active' : ''}" data-idx="${i}">` +
      `<span class="sName">${esc(e.name)}</span>` +
      `<span class="sCat ${CAT_CLASS[e.cat]}">${e.catKo}</span></div>`).join('');
    $suggest.style.display = 'block';
  }

  function updateSuggest() {
    const panel = listPanelHere();
    if (panel) { curPanel = panel; renderListPanel(); return; }   // "특성"/"기술" → 목록 패널
    curPanel = null;
    sugItems = computeSuggestions(currentToken().query);
    sugActive = sugItems.length ? 0 : -1;
    renderSuggest();
  }

  function hideSuggest() { curPanel = null; sugItems = []; sugActive = -1; renderSuggest(); }

  function acceptSuggest(idx) {
    const e = sugItems[idx];
    if (!e) return;
    const {start, end} = currentToken();
    const val = $input.value;
    const atEnd = end >= val.length;
    const insert = e.name + (atEnd ? ' ' : '');
    $input.value = val.slice(0, start) + insert + val.slice(end);
    const caret = start + insert.length;
    $input.setSelectionRange(caret, caret);
    hideSuggest();
    render();
    $input.focus();
  }

  // ── 특성/기술 목록 패널 ─────────────────────────────────────────────────────
  // 포켓몬 뒤에 "특성"/"기술" 을 치면 그 포켓몬의 특성/학습기 목록을 패널로 띄운다.
  const CAT_KO_SHORT = {Physical: '물리', Special: '특수', Status: '변화'};
  const CAT_CYCLE = [null, 'Physical', 'Special', 'Status']; // 전체 → 물리 → 특수 → 변화 → 전체
  let panelSort = 'type';   // 'type' | 'power'
  let panelCat = null;      // null(전체) | 'Physical' | 'Special' | 'Status' — 분류 필터(정렬과 독립 유지)
  let curPanel = null;      // {kind:'ability'|'move', species}

  const koType = en => (window.KO.koName.type && window.KO.koName.type[en]) || en || '-';
  function baseLearnFor(en) {
    const L = window.LEARN || {};
    return L[en] || L[en.split('-')[0]] || null;   // 폼은 원종 학습기로
  }
  function listPanelHere() {
    const q = normKo(currentToken().query);
    if (q !== '특성' && q !== '기술') return null;
    const {side} = currentSide();
    if (!side || !side.species) return null;
    return {kind: q === '특성' ? 'ability' : 'move', species: side.species};
  }
  function renderListPanel() {
    if (!curPanel) return;
    const {kind, species} = curPanel;
    const spKo = (window.KO.koName.pokemon && window.KO.koName.pokemon[species]) || species;
    let html = '';
    if (kind === 'ability') {
      const roster = (window.KO.speciesAbilities && window.KO.speciesAbilities[species]) || [];
      html += `<div class="lpHead"><span class="lpTitle">특성 · ${esc(spKo)}</span></div>`;
      if (!roster.length) html += '<div class="lpEmpty">특성 정보가 없습니다</div>';
      for (const a of roster) {
        html += `<div class="lpRow" data-ins="${esc(a.ko || a.en)}">` +
          `<span class="lpName">${esc(a.ko || a.en)}</span>` +
          (a.rate > 0 ? `<span class="lpRate">${a.rate}%</span>` : '') + '</div>';
      }
    } else {
      const info = window.MOVEINFO || {};
      const koMv = en => (window.KO.koName.move[en] || en);
      let moves = (baseLearnFor(species) || []).slice();
      if (panelCat) moves = moves.filter(en => (info[en] || {}).c === panelCat); // 분류 필터
      moves.sort((a, b) => {
        const ia = info[a] || {}, ib = info[b] || {};
        const byPow = (ib.p || 0) - (ia.p || 0);
        if (panelSort === 'power') return byPow || koMv(a).localeCompare(koMv(b));
        return String(ia.t || '').localeCompare(String(ib.t || '')) || byPow; // 타입
      });
      // 분류(순환 필터) 를 맨 앞에 두고, 타입·위력은 정렬 토글.
      const catBtn = `<button type="button" class="lpSortBtn lpCatBtn${panelCat ? ' on' : ''}" data-act="cat">` +
        (panelCat ? CAT_KO_SHORT[panelCat] : '전체') + '</button>';
      const sortBtn = (s, label) => `<button type="button" class="lpSortBtn${panelSort === s ? ' on' : ''}" data-act="sort" data-sort="${s}">${label}</button>`;
      html += `<div class="lpHead"><span class="lpTitle">기술 · ${esc(spKo)} <span class="lpCount">${moves.length}</span></span>` +
        `<div class="lpSort">${catBtn}${sortBtn('type', '타입')}${sortBtn('power', '위력')}</div></div>`;
      if (!moves.length) html += '<div class="lpEmpty">해당 기술이 없습니다</div>';
      for (const en of moves) {
        const i = info[en] || {};
        const tHex = TYPE_COLOR[i.t] || '#888888';
        const tStyle = `background:${tHex};color:${typeTextColor(tHex)};border-color:${typeShade(tHex, 0.72)}`;
        html += `<div class="lpRow lpMove" data-ins="${esc(koMv(en))}">` +
          `<span class="lpName">${esc(koMv(en))}</span>` +
          `<span class="lpType" style="${tStyle}">${esc(koType(i.t))}</span>` +
          `<span class="lpCat lpc-${i.c}">${CAT_KO_SHORT[i.c] || '-'}</span>` +
          `<span class="lpPow">${i.p ? i.p : '-'}</span></div>`;
      }
    }
    $suggest.innerHTML = html;
    $suggest.classList.add('asPanel');
    $suggest.style.display = 'block';
  }
  function acceptPanel(name) {
    const {start, end} = currentToken();
    const val = $input.value;
    const insert = name + (end >= val.length ? ' ' : '');
    $input.value = val.slice(0, start) + insert + val.slice(end);
    const caret = start + insert.length;
    curPanel = null;
    hideSuggest();
    $input.setSelectionRange(caret, caret);
    render();
    $input.focus();
  }

  $suggest.addEventListener('mousedown', ev => {
    const ctrl = ev.target.closest('.lpSortBtn');
    if (ctrl) {
      ev.preventDefault();
      if (ctrl.getAttribute('data-act') === 'cat') {
        panelCat = CAT_CYCLE[(CAT_CYCLE.indexOf(panelCat) + 1) % CAT_CYCLE.length]; // 전체→물리→특수→변화
      } else {
        panelSort = ctrl.getAttribute('data-sort');
      }
      renderListPanel();
      $input.blur();  // 모바일: 정렬만 눌렀는데 키보드가 다시 뜨지 않도록 포커스 해제(패널은 유지됨)
      return;
    }
    const lp = ev.target.closest('.lpRow');
    if (lp) { ev.preventDefault(); acceptPanel(lp.getAttribute('data-ins')); return; }
    const row = ev.target.closest('.sItemRow');
    if (!row) return;
    ev.preventDefault();                       // 입력창 blur 방지
    acceptSuggest(Number(row.getAttribute('data-idx')));
  });

  $input.addEventListener('keydown', ev => {
    if (!sugItems.length) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); sugActive = (sugActive + 1) % sugItems.length; renderSuggest(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); sugActive = (sugActive - 1 + sugItems.length) % sugItems.length; renderSuggest(); }
    else if ((ev.key === 'Enter' || ev.key === 'Tab') && sugActive >= 0) { ev.preventDefault(); acceptSuggest(sugActive); }
    else if (ev.key === 'Escape') { ev.preventDefault(); hideSuggest(); }
  });

  // 밖을 누르면 자동완성 숨김. 단, 입력창을 다시 누르면(포커스) 커서 위치 기준으로 이어서 보인다.
  let blurTimer = null;
  $input.addEventListener('blur', () => {
    if (curPanel) return; // 특성/기술 목록 패널은 포커스와 무관하게 유지(모바일 키보드 내려도 안 닫힘)
    blurTimer = setTimeout(hideSuggest, 120);
  });
  $input.addEventListener('focus', () => {
    if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; } // 재진입 시 예약된 숨김 취소
    // 클릭으로 재진입하면 focus 시점엔 커서가 아직 0이라, 커서가 옮겨진 뒤(다음 틱) 갱신한다.
    setTimeout(updateSuggest, 0);
  });
  // 이미 포커스된 입력창 안에서 다른 단어를 클릭/커서이동하면(입력·포커스 이벤트가 안 남)
  // 그 위치의 단어로 자동완성을 다시 띄운다. (커서 이동 뒤 다음 틱에 갱신)
  $input.addEventListener('click', () => { setTimeout(updateSuggest, 0); });
  $input.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') updateSuggest();
  });
  // 목록 패널은 blur로 안 닫히므로, 바깥을 누르면 닫아준다.
  document.addEventListener('pointerdown', ev => {
    if (curPanel && ev.target !== $input && !$suggest.contains(ev.target)) hideSuggest();
  });

  // ── 예시 칩 ────────────────────────────────────────────────────────────────
  for (const ex of EXAMPLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = ex;
    b.addEventListener('click', () => { $input.value = ex; $input.focus(); hideSuggest(); render(); });
    $chips.appendChild(b);
  }

  // ── 모바일 빠른입력 바 ──────────────────────────────────────────────────────
  // 능력치 줄: 글자(h/a/b/c/d)만 넣고 숫자는 직접(뒤에 +/- 로 성격 보정).
  // 보조 줄: + - vs · 보정(h32) · 풀보정(공격 기술 분류 보고 물리 hb32 / 특수 hd32).
  const STATS = [
    {t: '체력', ins: 'h'}, {t: '공격', ins: 'a'}, {t: '방어', ins: 'b'},
    {t: '특공', ins: 'c'}, {t: '특방', ins: 'd'},
  ];
  const MODS = [
    {t: '+', nature: true}, {t: '-', nature: true}, {t: 'vs', word: true},
    {t: '보정', fix: 'h32'}, {t: '풀보정', fullfix: true},
  ];
  // lead: 앞 토큰과 공백으로 분리 · trail: 뒤에 공백 추가
  function insertToken(text, {lead = false, trail = false} = {}) {
    let start = $input.selectionStart, end = $input.selectionEnd;
    if (start == null) { start = end = $input.value.length; }
    const before = $input.value.slice(0, start);
    const after = $input.value.slice(end);
    let ins = text;
    if (lead && before && !/\s$/.test(before)) ins = ' ' + ins;   // 앞 단어와 붙지 않게
    if (trail && (!after || !/^\s/.test(after))) ins = ins + ' '; // 이중 공백 방지
    $input.value = before + ins + after;
    const caret = before.length + ins.length;
    $input.focus();
    $input.setSelectionRange(caret, caret);
    render(); updateSuggest();
  }
  // 성격 +/- : 앞이 "a32 "(능력치+자동공백)면 공백을 먹고 붙여 "a32+" 가 되게 한다.
  function insertNature(sign) {
    let start = $input.selectionStart, end = $input.selectionEnd;
    if (start == null) { start = end = $input.value.length; }
    let before = $input.value.slice(0, start);
    const after = $input.value.slice(end);
    const m = before.match(/(\S+)\s$/);          // 커서 앞이 "토큰 " 형태?
    if (m && /[a-zA-Z가-힣].*\d$/.test(m[1])) before = before.slice(0, -1); // 능력치(문자+숫자)면 공백 제거
    $input.value = before + sign + after;
    const caret = before.length + sign.length;
    $input.focus();
    $input.setSelectionRange(caret, caret);
    render(); updateSuggest();
  }
  // 공격측(vs 왼쪽) 기술의 분류(물리/특수)를 읽는다.
  function attackerMoveCategory() {
    try {
      const spec = window.CC.parse($input.value);
      const mv = spec.attacker && spec.attacker.move;
      if (mv) return ((window.MOVEINFO || {})[mv] || {}).c || null;
    } catch (e) { /* 무시 */ }
    return null;
  }
  // 풀보정: 물리 공격이면 hb32, 특수면 hd32, 판단 불가면 h32 를 방어측에 넣는다.
  function insertFullFix() {
    const cat = attackerMoveCategory();
    const spread = cat === 'Physical' ? 'hb32' : cat === 'Special' ? 'hd32' : 'h32';
    insertToken(spread, {lead: true});
  }
  const $quickbar = document.getElementById('quickbar');
  if ($quickbar) {
    const mkBtn = (label, cls, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      b.addEventListener('mousedown', ev => ev.preventDefault()); // 입력창 blur 방지
      b.addEventListener('click', onClick);
      return b;
    };
    const statRow = document.createElement('div');
    statRow.className = 'qrow';
    for (const s of STATS) {
      // 글자만 넣고 뒤엔 공백 없음 → 사용자가 숫자를 이어 친다.
      statRow.appendChild(mkBtn(s.t, 'qkey qstat', () => insertToken(s.ins, {lead: true})));
    }
    const modRow = document.createElement('div');
    modRow.className = 'qrow';
    for (const m of MODS) {
      let onClick;
      if (m.nature) onClick = () => insertNature(m.t);
      else if (m.word) onClick = () => insertToken(m.t, {lead: true, trail: true});
      else if (m.fix) onClick = () => insertToken(m.fix, {lead: true});
      else if (m.fullfix) onClick = insertFullFix;
      modRow.appendChild(mkBtn(m.t, 'qkey', onClick));
    }
    $quickbar.appendChild(statRow);
    $quickbar.appendChild(modRow);
  }

  buildControls();

  // ── 표시 설정 (톱니바퀴) — 날씨/필드/벽/단축키/예시 on·off (PC·모바일 공통) ──────
  const SETTINGS_DEFS = [
    {key: 'weather', label: '날씨'},
    {key: 'field', label: '필드'},
    {key: 'wall', label: '벽'},
    {key: 'quick', label: '단축키'},
    {key: 'examples', label: '예시'},
  ];
  const showSettings = {weather: true, field: true, wall: true, quick: true, examples: true};
  try {
    const raw = localStorage.getItem('champcalc-show');
    if (raw) Object.assign(showSettings, JSON.parse(raw));
  } catch (e) {}
  const $wrap = document.querySelector('.wrap');
  function applySettings() {
    for (const {key} of SETTINGS_DEFS) $wrap.classList.toggle('off-' + key, !showSettings[key]);
  }
  function buildSettings() {
    const $btn = document.getElementById('settingsToggle');
    if (!$btn || !$wrap) return;
    const panel = document.createElement('div');
    panel.className = 'settingsPanel';
    panel.hidden = true;
    panel.innerHTML = '<div class="spTitle">표시 설정</div>';
    for (const {key, label} of SETTINGS_DEFS) {
      const row = document.createElement('label');
      row.className = 'spRow';
      const span = document.createElement('span');
      span.textContent = label;
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'switch';
      chk.checked = !!showSettings[key];
      chk.addEventListener('change', () => {
        showSettings[key] = chk.checked;
        try { localStorage.setItem('champcalc-show', JSON.stringify(showSettings)); } catch (e) {}
        applySettings();
      });
      row.appendChild(span);
      row.appendChild(chk);
      panel.appendChild(row);
    }
    // 테마 (구분선 + 다크 모드 스위치)
    panel.appendChild(Object.assign(document.createElement('div'), {className: 'spDivider'}));
    const tRow = document.createElement('label');
    tRow.className = 'spRow';
    const tSpan = document.createElement('span');
    tSpan.textContent = '다크 모드';
    const tChk = document.createElement('input');
    tChk.type = 'checkbox';
    tChk.className = 'switch';
    tChk.checked = effectiveTheme() === 'dark';
    tChk.addEventListener('change', () => setTheme(tChk.checked ? 'dark' : 'light'));
    tRow.appendChild(tSpan);
    tRow.appendChild(tChk);
    panel.appendChild(tRow);

    $wrap.appendChild(panel);
    const setOpen = open => {
      panel.hidden = !open;
      $btn.classList.toggle('on', open);
      $btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    $btn.addEventListener('click', ev => { ev.stopPropagation(); setOpen(panel.hidden); });
    panel.addEventListener('click', ev => ev.stopPropagation()); // 패널 내부 클릭은 닫지 않음
    document.addEventListener('click', ev => {
      if (!panel.hidden && ev.target !== $btn) setOpen(false);
    });
  }
  applySettings();
  buildSettings();

  $input.addEventListener('input', () => { render(); updateSuggest(); });

  // 입력 지우기(X) 버튼
  if ($clear) {
    $clear.addEventListener('mousedown', ev => ev.preventDefault()); // 입력창 blur 방지
    $clear.addEventListener('click', () => { $input.value = ''; hideSuggest(); render(); $input.focus(); });
  }

  // 결과 이미지 공유 버튼(결과 카드 안, 위임)
  $result.addEventListener('click', ev => { if (ev.target.closest('.shareBtn')) shareImage(); });

  render();
})();
