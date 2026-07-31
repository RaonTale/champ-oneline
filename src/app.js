// 입력창 ↔ 결과 연결. 입력/토글이 바뀔 때마다 parse → (토글 병합) → engine → describe → 렌더.
(() => {
  'use strict';

  const $input = document.getElementById('input');
  const $result = document.getElementById('result');
  const $hint = document.getElementById('hint');
  const $chips = document.getElementById('chips');
  const $controls = document.getElementById('controls');
  const $theme = document.getElementById('themeToggle');

  // ── 라이트/다크 전환 ───────────────────────────────────────────────────────
  function effectiveTheme() {
    const set = document.documentElement.getAttribute('data-theme');
    if (set === 'dark' || set === 'light') return set;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function updateThemeBtn() {
    const dark = effectiveTheme() === 'dark';
    $theme.textContent = dark ? '☀️' : '🌙';
    $theme.title = dark ? '라이트 모드로' : '다크 모드로';
  }
  $theme.addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('champcalc-theme', next); } catch (e) {}
    updateThemeBtn();
  });
  updateThemeBtn();

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
    wGroup.className = 'ctrlGroup';
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
    tGroup.className = 'ctrlGroup';
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
    sGroup.className = 'ctrlGroup';
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
    const text = $input.value;
    if (!text.trim()) {
      $result.innerHTML = '<div class="placeholder">포켓몬과 기술을 입력하면 결과가 바로 나옵니다.</div>';
      $hint.textContent = '';
      syncControlsUI('', '', false, false); // 텍스트 없이 수동 토글만 반영
      return;
    }

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
    parts.push(`<div class="main">${esc(desc.main)}</div>`);
    if (desc.verdict) parts.push(`<div class="verdict">${esc(desc.verdict)}</div>`);
    if (desc.bar) parts.push(dmgBarHTML(desc.bar));
    if (desc.sub) parts.push(`<div class="sub">${esc(desc.sub)}</div>`);
    $result.innerHTML = parts.join('');

    renderHint(spec);
  }

  function renderHint(spec) {
    const bits = [];
    for (const n of spec.notes || []) bits.push(`<span class="note">${esc(n)}</span>`);
    $hint.innerHTML = bits.join('');
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

  function computeSuggestions(query) {
    const q = normKo(query);
    // 한글이 들어간 단어에만 (a32·hd 같은 능력치 토큰엔 안 뜨게)
    if (!q || !/[가-힣ㄱ-ㅎ]/.test(query)) return [];
    const prefix = [];   // 별칭·이름이 q 로 시작 (생구·하펌 등 줄임말 포함)
    const contains = []; // 중간에 q 를 포함 (일부만 친 경우 대비)
    for (const e of SUGGEST_INDEX) {
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
    if (!sugItems.length) { $suggest.style.display = 'none'; $suggest.innerHTML = ''; return; }
    $suggest.innerHTML = sugItems.map((e, i) =>
      `<div class="sItemRow${i === sugActive ? ' active' : ''}" data-idx="${i}">` +
      `<span class="sName">${esc(e.name)}</span>` +
      `<span class="sCat ${CAT_CLASS[e.cat]}">${e.catKo}</span></div>`).join('');
    $suggest.style.display = 'block';
  }

  function updateSuggest() {
    sugItems = computeSuggestions(currentToken().query);
    sugActive = sugItems.length ? 0 : -1;
    renderSuggest();
  }

  function hideSuggest() { sugItems = []; sugActive = -1; renderSuggest(); }

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

  $suggest.addEventListener('mousedown', ev => {
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

  $input.addEventListener('blur', () => setTimeout(hideSuggest, 120));

  // ── 예시 칩 ────────────────────────────────────────────────────────────────
  for (const ex of EXAMPLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = ex;
    b.addEventListener('click', () => { $input.value = ex; $input.focus(); hideSuggest(); render(); });
    $chips.appendChild(b);
  }

  buildControls();
  $input.addEventListener('input', () => { render(); updateSuggest(); });

  render();
})();
