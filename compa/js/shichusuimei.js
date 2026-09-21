/*
 * shichusuimei.js
 * 四柱推命・命式計算ロジック（ブラウザ用）
 *
 * 依存: lunar-javascript 1.7.7
 * - ページ側で lunar.js を読み込んでいなくても、このファイルが必要時に CDN から読み込みます。
 * - UIには依存しません。love/index.html などから呼び出して使えます。
 *
 * 例:
 * const result = await Shichusuimei.calculate({
 *   birthDate: '1980-01-23',
 *   birthTime: '14:30',
 *   timeUnknown: false,
 *   dayBoundary: 2, // 2=0時換日 / 1=23時換日
 *   sex: 'male'
 * });
 */
(function (global) {
  'use strict';

  const VERSION = '1.2.0';
  const LUNAR_VERSION = '1.7.7';
  const LUNAR_CDN = `https://cdn.jsdelivr.net/npm/lunar-javascript@${LUNAR_VERSION}/lunar.js`;
  const LUNAR_FALLBACK_CDN = `https://unpkg.com/lunar-javascript@${LUNAR_VERSION}/lunar.js`;
  const LUNAR_CDNS = [LUNAR_CDN, LUNAR_FALLBACK_CDN];

  const GAN_ELEMENT = {
    甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
    己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水'
  };

  const ZHI_ELEMENT = {
    子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
    午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水'
  };

  const ELEMENTS = ['木', '火', '土', '金', '水'];

  let lunarLoadPromise = null;

  function jp(value) {
    return String(value ?? '')
      .replaceAll('伤', '傷')
      .replaceAll('财', '財')
      .replaceAll('杀', '殺')
      .replaceAll('长', '長')
      .replaceAll('带', '帯')
      .replaceAll('临', '臨')
      .replaceAll('绝', '絶')
      .replaceAll('养', '養')
      .replaceAll('门', '門');
  }

  function safe(fn, fallback = '—') {
    try {
      const value = fn();
      if (Array.isArray(value)) {
        return value.length ? value.map(jp) : [];
      }
      return (value === undefined || value === null || value === '') ? fallback : jp(value);
    } catch (_) {
      return fallback;
    }
  }

  function loadScript(src, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      if (typeof global.Solar !== 'undefined') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.shichusuimeiLunar = src;

      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(() => {
        finish(reject, new Error('四柱推命計算ライブラリの読み込みが時間切れになりました。'));
      }, timeoutMs);

      script.onload = () => finish(resolve);
      script.onerror = () => finish(reject, new Error('四柱推命計算ライブラリを読み込めませんでした。'));
      document.head.appendChild(script);
    });
  }

  async function ensureLibrary() {
    if (typeof global.Solar !== 'undefined') return global.Solar;
    if (typeof document === 'undefined') {
      throw new Error('この四柱推命ロジックはブラウザ環境で使用してください。');
    }
    if (!lunarLoadPromise) {
      lunarLoadPromise = (async () => {
        let lastError = null;
        for (const src of LUNAR_CDNS) {
          try {
            await loadScript(src);
            if (typeof global.Solar !== 'undefined') return global.Solar;
            lastError = new Error('四柱推命計算ライブラリの初期化に失敗しました。');
          } catch (err) {
            lastError = err;
          }
        }
        throw lastError || new Error('四柱推命計算ライブラリを読み込めませんでした。');
      })().catch(err => {
        lunarLoadPromise = null;
        throw err;
      });
    }
    return lunarLoadPromise;
  }

  function parseDate(value) {
    if (typeof value !== 'string') {
      throw new Error('生年月日は西暦8桁（例：19850512）で入力してください。');
    }
    const raw = value.trim();
    let year, month, day;
    if (/^\d{8}$/.test(raw)) {
      year = Number(raw.slice(0, 4));
      month = Number(raw.slice(4, 6));
      day = Number(raw.slice(6, 8));
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      [year, month, day] = raw.split('-').map(Number);
    } else {
      throw new Error('生年月日は西暦8桁（例：19850512）で入力してください。');
    }
    const test = new Date(Date.UTC(year, month - 1, day));
    if (
      test.getUTCFullYear() !== year ||
      test.getUTCMonth() !== month - 1 ||
      test.getUTCDate() !== day
    ) {
      throw new Error('正しい生年月日を入力してください。');
    }
    return {
      year, month, day,
      compact: `${String(year).padStart(4,'0')}${String(month).padStart(2,'0')}${String(day).padStart(2,'0')}`,
      normalized: `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    };
  }

  function parseTime(value) {
    if (typeof value !== 'string') {
      throw new Error('出生時刻は4桁（例：1430）で入力してください。');
    }
    const raw = value.trim();
    let hour, minute;
    if (/^\d{4}$/.test(raw)) {
      hour = Number(raw.slice(0, 2));
      minute = Number(raw.slice(2, 4));
    } else if (/^\d{2}:\d{2}$/.test(raw)) {
      [hour, minute] = raw.split(':').map(Number);
    } else {
      throw new Error('出生時刻は4桁（例：1430）で入力してください。');
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error('正しい出生時刻を入力してください。');
    }
    return {
      hour, minute,
      compact: `${String(hour).padStart(2,'0')}${String(minute).padStart(2,'0')}`,
      normalized: `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`
    };
  }

  function normalizeBoundary(value) {
    const boundary = Number(value);
    if (boundary !== 1 && boundary !== 2) {
      throw new Error('換日の設定は 1（23時換日）または 2（0時換日）を指定してください。');
    }
    return boundary;
  }

  function pillarData(eightChar, key, label) {
    const cap = key[0].toUpperCase() + key.slice(1);
    const ganZhi = safe(() => eightChar[`get${cap}`](), '');
    const gan = safe(() => eightChar[`get${cap}Gan`](), ganZhi[0] || '—');
    const zhi = safe(() => eightChar[`get${cap}Zhi`](), ganZhi[1] || '—');

    let tenGodGan = '日主';
    if (key !== 'day') {
      tenGodGan = safe(() => eightChar[`get${cap}ShiShenGan`]());
    }

    return {
      key,
      label,
      ganZhi,
      gan,
      zhi,
      ganElement: GAN_ELEMENT[gan] || '—',
      zhiElement: ZHI_ELEMENT[zhi] || '—',
      tenGodGan,
      hiddenStems: safe(() => eightChar[`get${cap}HideGan`]()),
      hiddenTenGods: safe(() => eightChar[`get${cap}ShiShenZhi`]()),
      twelveStage: safe(() => eightChar[`get${cap}DiShi`]()),
      naYin: safe(() => eightChar[`get${cap}NaYin`]())
    };
  }

  function countFiveElements(pillars) {
    const counts = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    for (const pillar of pillars) {
      if (counts[pillar.ganElement] !== undefined) counts[pillar.ganElement]++;
      if (counts[pillar.zhiElement] !== undefined) counts[pillar.zhiElement]++;
    }
    return counts;
  }


  const ELEMENT_GENERATE = { 木:'火', 火:'土', 土:'金', 金:'水', 水:'木' };
  const ELEMENT_CONTROL = { 木:'土', 土:'水', 水:'火', 火:'金', 金:'木' };

  const GAN_COMBINE = [
    ['甲','己'], ['乙','庚'], ['丙','辛'], ['丁','壬'], ['戊','癸']
  ];
  const ZHI_LIUHE = [
    ['子','丑'], ['寅','亥'], ['卯','戌'], ['辰','酉'], ['巳','申'], ['午','未']
  ];
  const ZHI_CHONG = [
    ['子','午'], ['丑','未'], ['寅','申'], ['卯','酉'], ['辰','戌'], ['巳','亥']
  ];
  const ZHI_HAI = [
    ['子','未'], ['丑','午'], ['寅','巳'], ['卯','辰'], ['申','亥'], ['酉','戌']
  ];
  const ZHI_PO = [
    ['子','酉'], ['丑','辰'], ['寅','亥'], ['卯','午'], ['巳','申'], ['未','戌']
  ];
  const ZHI_XING = [
    ['子','卯'], ['寅','巳'], ['巳','申'], ['申','寅'],
    ['丑','戌'], ['戌','未'], ['未','丑'],
    ['辰','辰'], ['午','午'], ['酉','酉'], ['亥','亥']
  ];
  // 三合は、旺支（子・卯・午・酉）を含む二支を半合として扱い、
  // 旺支を含まない両端二支は「三合のつながり」として弱めに表示する。
  const ZHI_SANHE_GROUPS = [
    { branches:['申','子','辰'], center:'子' },
    { branches:['亥','卯','未'], center:'卯' },
    { branches:['寅','午','戌'], center:'午' },
    { branches:['巳','酉','丑'], center:'酉' }
  ];

  function pairIn(list, a, b) {
    return list.some(([x,y]) => (a===x && b===y) || (a===y && b===x));
  }

  function elementRelation(aEl, bEl) {
    if (!ELEMENTS.includes(aEl) || !ELEMENTS.includes(bEl)) {
      return { code:'unknown', label:'判定不可', balance:0 };
    }
    if (aEl === bEl) return { code:'same', label:'同気', balance:1 };
    if (ELEMENT_GENERATE[aEl] === bEl) return { code:'generate_ab', label:'相生', balance:2, from:'a', to:'b' };
    if (ELEMENT_GENERATE[bEl] === aEl) return { code:'generate_ba', label:'相生', balance:2, from:'b', to:'a' };
    if (ELEMENT_CONTROL[aEl] === bEl) return { code:'control_ab', label:'相剋', balance:-2, from:'a', to:'b' };
    if (ELEMENT_CONTROL[bEl] === aEl) return { code:'control_ba', label:'相剋', balance:-2, from:'b', to:'a' };
    return { code:'neutral', label:'中立', balance:0 };
  }

  function branchRelations(a, b) {
    if (!a || !b || a==='—' || b==='—') return [];
    const out=[];
    if (a===b) out.push({code:'same', label:'同支', balance:1});
    if (pairIn(ZHI_LIUHE,a,b)) out.push({code:'liuhe', label:'六合', balance:3});
    const sanhe = ZHI_SANHE_GROUPS.find(g => g.branches.includes(a) && g.branches.includes(b) && a!==b);
    if (sanhe) {
      if (a===sanhe.center || b===sanhe.center) {
        out.push({code:'sanhe_half', label:'半合', balance:1});
      } else {
        out.push({code:'sanhe_link', label:'三合のつながり', balance:1});
      }
    }
    if (pairIn(ZHI_CHONG,a,b)) out.push({code:'chong', label:'冲', balance:-3});
    if (pairIn(ZHI_XING,a,b)) out.push({code:'xing', label:'刑', balance:-2});
    if (pairIn(ZHI_HAI,a,b)) out.push({code:'hai', label:'害', balance:-2});
    if (pairIn(ZHI_PO,a,b)) out.push({code:'po', label:'破', balance:-1});
    return out;
  }

  function activePillars(result) {
    return Array.isArray(result?.pillars) ? result.pillars.filter(Boolean) : [];
  }

  function labelPair(aP, bP, key) {
    const av = key==='gan' ? aP.gan : aP.zhi;
    const bv = key==='gan' ? bP.gan : bP.zhi;
    return `あなた${aP.label}${av} × お相手${bP.label}${bv}`;
  }

  function compareDayMaster(a, b) {
    const aEl=a?.dayMaster?.element, bEl=b?.dayMaster?.element;
    const aGan=a?.dayMaster?.gan||'—', bGan=b?.dayMaster?.gan||'—';
    const rel=elementRelation(aEl,bEl);
    let text='日主の関係を判定できませんでした。';
    if(rel.code==='same') text=`日主は ${aGan}（${aEl}）と ${bGan}（${bEl}）。考え方や気持ちの動きに似たところがあり、お互いを理解しやすい組合せです。`;
    else if(rel.code==='generate_ab') text=`日主は ${aGan}（${aEl}）→ ${bGan}（${bEl}）の相生。あなたからお相手へ自然に気を配り、支えやすい組合せです。`;
    else if(rel.code==='generate_ba') text=`日主は ${bGan}（${bEl}）→ ${aGan}（${aEl}）の相生。お相手からあなたへ自然に気を配り、支えやすい組合せです。`;
    else if(rel.code==='control_ab' || rel.code==='control_ba') text=`日主は ${aGan}（${aEl}）と ${bGan}（${bEl}）の相剋。考え方や行動の進め方がぶつかりやすく、伝え方や距離の取り方が大切になる組合せです。`;
    else if(rel.code==='neutral') text=`日主は ${aGan}（${aEl}）と ${bGan}（${bEl}）。強く支え合う関係でも強くぶつかる関係でもなく、ほかの要素によって相性が表れやすい組合せです。`;
    return { ...rel, title:'日主', text };
  }

  function compareDayBranch(a, b) {
    const ap=activePillars(a).find(p=>p.key==='day') || a?.allPillars?.find?.(p=>p.key==='day');
    const bp=activePillars(b).find(p=>p.key==='day') || b?.allPillars?.find?.(p=>p.key==='day');
    const az=ap?.zhi||'—', bz=bp?.zhi||'—';
    const rels=branchRelations(az,bz);
    const labels=rels.map(r=>r.label);
    const balance=rels.reduce((sum,r)=>sum+r.balance,0);
    const hasJoin=rels.some(r=>['liuhe','sanhe_half','sanhe_link','same'].includes(r.code));
    const hasAdjust=rels.some(r=>['chong','xing','hai','po'].includes(r.code));
    let text;
    if(!rels.length) {
      text=`日支は ${az} × ${bz}。生活感覚や日常のリズムに、強い結びつきや衝突を示す関係は見られません。`;
    } else if(hasJoin && hasAdjust) {
      text=`日支は ${az} × ${bz}：${labels.join('・')}。生活感覚や日常の関わりにはつながりが生まれやすい一方、気持ちや生活リズムを合わせることも大切な組合せです。`;
    } else if(hasJoin) {
      text=`日支は ${az} × ${bz}：${labels.join('・')}。生活感覚や日常の関わりに、一定のつながりが生まれやすい組合せです。`;
    } else {
      text=`日支は ${az} × ${bz}：${labels.join('・')}。生活リズムや感情の表し方に違いが出やすく、歩調を合わせることが大切な組合せです。`;
    }
    return { title:'日支', relations:rels, balance, text };
  }

  function compareStems(a, b) {
    const aps=activePillars(a), bps=activePillars(b);
    const items=[];
    const counts={combine:0,same:0,generate:0,control:0};
    let balance=0;
    let supportBalance=0;
    for(const ap of aps){
      for(const bp of bps){
        const isCorePair = ap.key==='day' && bp.key==='day';
        let item=null;
        if(pairIn(GAN_COMBINE,ap.gan,bp.gan)){
          counts.combine++;
          item={type:'五合', detail:`${labelPair(ap,bp,'gan')}（五合）`, balance:2};
        } else if(ap.gan===bp.gan){
          counts.same++;
          item={type:'同干', detail:`${labelPair(ap,bp,'gan')}（同干）`, balance:1};
        } else {
          const er=elementRelation(ap.ganElement,bp.ganElement);
          if(er.label==='相生'){
            counts.generate++;
            item={type:'相生', detail:`${labelPair(ap,bp,'gan')}（相生）`, balance:1};
          }else if(er.label==='相剋'){
            counts.control++;
            item={type:'相剋', detail:`${labelPair(ap,bp,'gan')}（相剋）`, balance:-1};
          }
        }
        if(item){
          item.corePair=isCorePair;
          balance+=item.balance;
          if(!isCorePair) supportBalance+=item.balance;
          items.push(item);
        }
      }
    }
    let text;
    if(counts.combine>0){
      text=`天干には五合が ${counts.combine}件あり、考え方や行動の面で自然にかみ合いやすい関係が見られます。`;
      if(counts.control>counts.generate) text+=`一方で意見がぶつかりやすい面もあり、話し合いが大切です。`;
      else if(counts.generate>0) text+=`相生も見られ、お互いを支えやすい関係です。`;
    } else if(counts.generate>counts.control){
      text='天干では支え合う関係が多く、考え方や行動の面で協力しやすい組合せです。';
    } else if(counts.control>counts.generate){
      text='天干では意見や行動の進め方に違いが出やすく、相手の考えを聞きながら進めることが大切です。';
    } else if(counts.same>0){
      text='天干には同じ干があり、物事の受け止め方や反応に似たところが出やすい組合せです。';
    } else {
      text='天干では、支え合いやすい面と意見の違いが出やすい面の両方が見られます。';
    }
    return { title:'天干', counts, items, balance, supportBalance, text };
  }

  function compareBranches(a, b) {
    const aps=activePillars(a), bps=activePillars(b);
    const counts={liuhe:0,sanheHalf:0,sanheLink:0,same:0,chong:0,xing:0,hai:0,po:0};
    const items=[];
    let balance=0;
    let supportBalance=0;
    for(const ap of aps){
      for(const bp of bps){
        const isCorePair = ap.key==='day' && bp.key==='day';
        const rels=branchRelations(ap.zhi,bp.zhi);
        for(const r of rels){
          if(r.code==='liuhe') counts.liuhe++;
          else if(r.code==='sanhe_half') counts.sanheHalf++;
          else if(r.code==='sanhe_link') counts.sanheLink++;
          else if(r.code==='same') counts.same++;
          else if(r.code==='chong') counts.chong++;
          else if(r.code==='xing') counts.xing++;
          else if(r.code==='hai') counts.hai++;
          else if(r.code==='po') counts.po++;
          balance += r.balance;
          if(!isCorePair) supportBalance += r.balance;
          items.push({type:r.label, detail:`${labelPair(ap,bp,'zhi')}（${r.label}）`, balance:r.balance, corePair:isCorePair});
        }
      }
    }
    const joinCount=counts.liuhe+counts.sanheHalf+counts.sanheLink+counts.same;
    const adjustCount=counts.chong+counts.xing+counts.hai+counts.po;
    let text;
    if(joinCount>0 && adjustCount>0){
      text='地支では、日常の中で自然に合う部分がある一方、生活リズムや気持ちの表し方には違いも出やすい関係です。';
    }else if(joinCount>0){
      text='地支では、日常の中で自然に歩調が合いやすく、関係を築きやすい傾向があります。';
    }else if(adjustCount>0){
      text='地支では、生活リズムや感情の出し方に違いが出やすく、お互いに合わせる意識が大切です。';
    }else{
      text='地支では、日常面に強い結びつきや強い衝突を示す関係は目立ちません。';
    }
    return { title:'地支', counts, items, balance, supportBalance, text };
  }

  function compareFiveElementComplement(a, b) {
    const ac=a?.fiveElements||{}, bc=b?.fiveElements||{};
    const missingA=ELEMENTS.filter(e=>(ac[e]||0)===0);
    const missingB=ELEMENTS.filter(e=>(bc[e]||0)===0);
    const suppliedToA=missingA.filter(e=>(bc[e]||0)>0);
    const suppliedToB=missingB.filter(e=>(ac[e]||0)>0);
    const commonMissing=missingA.filter(e=>missingB.includes(e));
    let balance=suppliedToA.length+suppliedToB.length-commonMissing.length;
    const parts=[];
    if(suppliedToA.length) parts.push(`あなたの命式にない五行「${suppliedToA.join('・')}」を、お相手が持っています`);
    if(suppliedToB.length) parts.push(`お相手の命式にない五行「${suppliedToB.join('・')}」を、あなたが持っています`);
    if(commonMissing.length) parts.push(`二人とも命式に「${commonMissing.join('・')}」が表れていません`);
    if(!parts.length) parts.push('二人とも五行が一通りそろっており、どちらかが一方的に補う形ではありません');
    return {
      title:'五行補完', missingA, missingB, suppliedToA, suppliedToB, commonMissing, balance,
      text:`${parts.join('。')}。${suppliedToA.length && suppliedToB.length ? 'お互いに足りない部分を補い合いやすい組合せです。' : (suppliedToA.length || suppliedToB.length ? '一方が相手の不足を補いやすい組合せです。' : (commonMissing.length ? '共通して不足する部分は、二人で意識して補うことが大切です。' : '五行の偏りは比較的少なく、全体のバランスを見ます。'))}`
    };
  }

  function compatibilitySummary(parts) {
    // 日主・日支を中心にし、全柱比較のうち日柱同士は二重加点しない。
    // これは詳細鑑定ではなく、表示用の簡易な全体傾向。
    const total=(parts.dayMaster?.balance||0)+(parts.dayBranch?.balance||0)+
      Math.max(-2,Math.min(2,parts.stems?.supportBalance||0))+
      Math.max(-3,Math.min(3,parts.branches?.supportBalance||0))+
      Math.max(-1,Math.min(1,parts.fiveElements?.balance||0));
    let label, text;
    if(total>=4){
      label='調和しやすい';
      text='全体として、お互いを支えたり自然に歩調を合わせたりしやすい関係です。';
    } else if(total>=1){
      label='比較的調和しやすい';
      text='全体として良い流れがやや多く、関係を築きやすい傾向があります。';
    } else if(total>=-1){
      label='良い面と注意点が混在';
      text='相性の良い部分と、合わせ方に工夫が必要な部分の両方があります。お互いの違いを理解すると関係が安定しやすくなります。';
    } else {
      label='歩み寄りが大切';
      text='考え方や生活感覚の違いが出やすい組合せです。伝え方や距離感を意識すると、関係を整えやすくなります。';
    }
    return { label, text, balance:total, method:'簡易相性判定' };
  }

  function compareCompatibility(a, b) {
    if(!a || !b) throw new Error('二人分の四柱推命結果が必要です。');
    const parts={
      dayMaster:compareDayMaster(a,b),
      dayBranch:compareDayBranch(a,b),
      stems:compareStems(a,b),
      branches:compareBranches(a,b),
      fiveElements:compareFiveElementComplement(a,b)
    };
    return { ...parts, summary:compatibilitySummary(parts) };
  }

  async function calculate(options = {}) {
    await ensureLibrary();

    const {
      birthDate,
      birthTime = '',
      timeUnknown = false,
      dayBoundary = 2,
      sex = ''
    } = options;

    const parsedDate = parseDate(birthDate);
    const { year, month, day } = parsedDate;
    const boundary = normalizeBoundary(dayBoundary);

    let hour = 12;
    let minute = 0;
    let parsedTime = null;
    if (!timeUnknown) {
      if (!birthTime) {
        throw new Error('出生時刻を入力するか、出生時刻を空欄にしてください。');
      }
      parsedTime = parseTime(birthTime);
      ({ hour, minute } = parsedTime);
    }

    const solar = global.Solar.fromYmdHms(year, month, day, hour, minute, 0);
    const lunar = solar.getLunar();
    const eightChar = lunar.getEightChar();
    eightChar.setSect(boundary);

    const allPillars = [
      pillarData(eightChar, 'year', '年柱'),
      pillarData(eightChar, 'month', '月柱'),
      pillarData(eightChar, 'day', '日柱'),
      pillarData(eightChar, 'time', '時柱')
    ];

    // 出生時刻不明のときは、時柱を診断に使用しない。
    const pillars = timeUnknown ? allPillars.slice(0, 3) : allPillars;
    const dayPillar = allPillars[2];

    return {
      version: VERSION,
      engine: `lunar-javascript ${LUNAR_VERSION}`,
      input: {
        birthDate: parsedDate.compact,
        birthDateNormalized: parsedDate.normalized,
        birthTime: timeUnknown ? null : parsedTime.compact,
        birthTimeNormalized: timeUnknown ? null : parsedTime.normalized,
        timeUnknown: Boolean(timeUnknown),
        dayBoundary: boundary,
        dayBoundaryLabel: boundary === 1 ? '23時換日' : '0時換日',
        sex
      },
      dayMaster: {
        gan: dayPillar.gan,
        element: dayPillar.ganElement
      },
      pillars,
      allPillars,
      fiveElements: countFiveElements(pillars)
    };
  }

  async function calculateFromParts(options = {}) {
    const {
      year, month, day,
      hour = 12, minute = 0,
      timeUnknown = false,
      dayBoundary = 2,
      sex = ''
    } = options;

    const birthDate = [
      String(year).padStart(4, '0'),
      String(month).padStart(2, '0'),
      String(day).padStart(2, '0')
    ].join('-');

    const birthTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    return calculate({ birthDate, birthTime, timeUnknown, dayBoundary, sex });
  }

  global.Shichusuimei = Object.freeze({
    version: VERSION,
    lunarVersion: LUNAR_VERSION,
    lunarCdn: LUNAR_CDN,
    lunarFallbackCdn: LUNAR_FALLBACK_CDN,
    elements: Object.freeze([...ELEMENTS]),
    ganElement: Object.freeze({ ...GAN_ELEMENT }),
    zhiElement: Object.freeze({ ...ZHI_ELEMENT }),
    ensureLibrary,
    calculate,
    calculateFromParts,
    compareCompatibility,
    countFiveElements
  });
})(window);
