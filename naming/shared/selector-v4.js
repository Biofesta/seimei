```
(function(){
  "use strict";

  const E = window.NamingEngine;
  const $ = id => document.getElementById(id);

  const state = {
    dict:new Map(),
    triad:null,
    nameRecords:[],
    nameMeta:{},
    rankingBest20:null,
    taxonomy:null,
    patterns:[],
    selectedPatternIndex:null,
    selectedChars:[],
    selectedReadings:[],
    slotFilters:[],
    searchMode:"",
    imageGroup:"nature",
    selectedImageTerms:new Set(),
    currentCandidates:[],
    currentAllCandidates:[],
    currentCandidateTitle:"",
    currentCandidateConditions:[],
    candidateDisplayCount:60
  };

  function esc(v){
    return String(v??"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function fixedStars(filled,total){
    const max=Math.max(0,Number(total)||0);
    const on=Math.max(0,Math.min(max,Number(filled)||0));
    const off=Math.max(0,max-on);
    return `<span style="white-space:nowrap;letter-spacing:0.08em;">`
      +`<span style="background:linear-gradient(180deg,#ffe27a 0%,#f5a623 100%);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:700;">${"★".repeat(on)}</span>`
      +`<span style="color:#d3d3d3;">${"☆".repeat(off)}</span>`
      +`</span>`;
  }

  function stars(n){
    const s=E.scoreInfo(Number(n)).score;
    return fixedStars(s,6);
  }

  function triadStars(rating){
    const s=String(rating||"");
    if(s==="◎") return fixedStars(10,10);
    if(s==="〇" || s==="○") return fixedStars(8,10);
    if(s.includes("要注意")) return '<span style="color:#b00020;font-weight:700;">【要注意】</span>';
    return esc(s||"—");
  }

  function cleanReading(v){
    return String(v||"").replace(/\./g,"").trim();
  }

  function readingNorm(v){
    return E.readingNorm ? E.readingNorm(v) : String(v||"").trim();
  }

  function triadDisplayLabel(rating){
    const s=String(rating||"");
    if(s==="◎") return "◎最調和";
    if(s==="〇" || s==="○") return "〇調和";
    if(s.includes("要注意")) return "【要注意】";
    return s || "—";
  }

  function lastDigit(n){
    return Math.abs(Number(n)||0)%10;
  }

  function sociabilityLabel(scores){
    const jinLast=lastDigit(scores?.jin);
    const gaiLast=lastDigit(scores?.gai);
    const shifted=(jinLast+4)%10;
    return shifted===gaiLast ? "やや不調和" : "普通";
  }

  function directTriadRating(scores){
    if(!scores || !state.triad) return null;
    if(typeof E.pickTriadRating==="function"){
      return E.pickTriadRating(
        state.triad,
        scores.ten,
        scores.jin,
        scores.chi
      );
    }
    return null;
  }

  function allReadingRows(entry){
    const r=entry?.readings||{};
    return {
      nanori:Array.isArray(r.nanori)?r.nanori:[],
      on:Array.isArray(r.on)?r.on:[],
      kun:Array.isArray(r.kun)?r.kun:[],
      other:Array.isArray(r.other)?r.other:[]
    };
  }

  function hasAnyReading(entry){
    const r=allReadingRows(entry);
    return r.nanori.length+r.on.length+r.kun.length+r.other.length>0;
  }

  function excludedGivenKanji(){
    const rows=Array.isArray(state.nameMeta?.excluded_given_kanji)
      ? state.nameMeta.excluded_given_kanji : [];
    return new Set(rows.map(String));
  }

  function hasExcludedGivenKanji(name){
    const blocked=excludedGivenKanji();
    return [...String(name||"")].some(ch=>blocked.has(ch));
  }

  function candidateEntries(stroke){
    const rows=[...state.dict.values()].filter(e=>
      e.strokes===Number(stroke) &&
      E.isCJK(e.char) &&
      !excludedGivenKanji().has(e.char) &&
      hasAnyReading(e)
    );

    rows.sort((a,b)=>{
      const ar=allReadingRows(a), br=allReadingRows(b);
      if(ar.nanori.length!==br.nanori.length) return br.nanori.length-ar.nanori.length;
      const ac=ar.on.length+ar.kun.length+ar.other.length;
      const bc=br.on.length+br.kun.length+br.other.length;
      if(ac!==bc) return bc-ac;
      return a.char.localeCompare(b.char,"ja");
    });
    return rows;
  }

  function matchesSearch(entry,query){
    const q=readingNorm(query);
    if(!q) return true;
    if(entry.char.includes(query)) return true;

    const r=allReadingRows(entry);
    const all=[...r.nanori,...r.on,...r.kun,...r.other];
    return all.some(x=>readingNorm(x).includes(q));
  }

  async function fetchJSON(url,required=true){
    try{
      const res=await fetch(url,{cache:"no-store"});
      if(!res.ok) throw new Error("HTTP "+res.status);
      return await res.json();
    }catch(err){
      if(required) throw err;
      return null;
    }
  }

  async function loadData(){
    try{
      const raw=await fetchJSON("../data/kanjidic-naming.json",true);
      state.dict=E.normalizeDictionary(raw);
      state.triad=await fetchJSON("../data/sansai.json",true);

      $("dataStatus").textContent=state.dict.size.toLocaleString()+"文字・準備OK";
      $("dataStatus").className="status ok";
      $("triadStatus").textContent="陰陽五行125通り・接続済";
      $("triadStatus").className="status ok";

      const nameMaster=await fetchJSON("../name/name-master.json",false);
      const rankingMaster=await fetchJSON("../name/ranking-best20.json",false);
      state.rankingBest20=(rankingMaster && typeof rankingMaster==="object" && rankingMaster.years && typeof rankingMaster.years==="object")
        ? rankingMaster
        : null;
      state.taxonomy=await fetchJSON("../name/image-tag-taxonomy.json",false);
      state.nameRecords=Array.isArray(nameMaster?.records) ? nameMaster.records : [];
      state.nameMeta=(nameMaster && nameMaster.meta && typeof nameMaster.meta==="object") ? nameMaster.meta : {};

      if(state.nameRecords.length){
        $("nameStatus").textContent=state.nameRecords.length.toLocaleString()+"名前・接続済";
        $("nameStatus").className="status ok";
      }else{
        $("nameStatus").textContent="名前データ未接続（画数検索は使用可）";
        $("nameStatus").className="status warn";
      }
    }catch(err){
      $("dataStatus").textContent="辞書・陰陽五行データ読込エラー";
      $("dataStatus").className="status bad";
      $("loadError").classList.remove("hidden");
      $("loadError").textContent="データを読み込めません。しばらくしてからもう一度お試しください。";
    }
  }


  // ==========================================================
  // 名前マスターから探す（名前・漢字・イメージ）
  // ==========================================================
  const MAIN_IMAGE_TERMS = [
    "自然・風景・季節",
    "知性・感性",
    "芸術",
    "伝統・気品・華やかさ",
    "活気・躍動・スポーツ",
    "希望・未来・成長",
    "愛情・縁・幸福"
  ];

  const SUB_IMAGE_TERMS = [
    "知的",
    "さわやか",
    "力強い",
    "活動的",
    "やさしい",
    "かわいい",
    "上品",
    "明るい",
    "落ち着いた",
    "誠実",
    "親しみやすい"
  ];

  const FEATURE_IMAGE_TERMS = [
    "命名Best20（2025）",
    "命名Best20（2024）",
    "命名Best20（2023）"
  ];

  function rankingYearFromFeature(label){
    const m=String(label||"").match(/（(20\d{2})）/);
    return m ? m[1] : "";
  }

  function showRankingMessage(message){
    let box=$("rankingInputMessage");
    if(!box){
      box=document.createElement("div");
      box.id="rankingInputMessage";
      box.style.cssText="margin-top:10px;padding:10px 12px;border:1px solid #d8b100;border-radius:10px;background:#fff8cf;font-weight:700;color:#c62828;";
      const anchor=$("imageFeatureNote");
      if(anchor && anchor.parentNode){
        anchor.insertAdjacentElement("afterend",box);
      }else{
        $("searchModePanel").prepend(box);
      }
    }
    box.textContent=message;
    box.hidden=false;
  }

  function clearRankingMessage(){
    const box=$("rankingInputMessage");
    if(box) box.hidden=true;
  }

  function rankingFieldsReady(){
    const surname=$("surname").value.trim();
    const sex=$("sex").value;
    return !!surname && (sex==="male" || sex==="female");
  }

  function showRankingInputError(message){
    let box=$("rankingRequiredMessage");
    if(!box){
      box=document.createElement("span");
      box.id="rankingRequiredMessage";
      box.style.cssText="display:none;margin-left:10px;color:#c62828;font-weight:700;font-size:.92em;";
      const surnameInput=$("surname");
      const label=surnameInput?.parentElement?.querySelector("label");
      if(label) label.appendChild(box);
    }
    if(box){
      box.textContent=message;
      box.style.display="inline";
    }
  }

  function clearRankingInputError(){
    const box=$("rankingRequiredMessage");
    if(box) box.style.display="none";
  }

  function rankingInputReady(){
    const surname=$("surname").value.trim();
    if(!rankingFieldsReady()){
      showRankingMessage("姓と男女別を入力してください。");
      if(!surname) $("surname").focus();
      showRankingInputError("姓と男女別を入力してください。");
      return false;
    }
    clearRankingInputError();
    clearRankingMessage();
    return true;
  }

  function rankingFeatureRows(label){
    const year=rankingYearFromFeature(label);
    const sex=$("sex").value;
    if(!year || (sex!=="male" && sex!=="female")) return [];

    const source=state.rankingBest20?.years?.[year]?.[sex];
    if(!Array.isArray(source)) return [];

    const baseMap=new Map(baseNameRecords().map(r=>[String(r?.name||""),r]));
    return source.map(item=>{
      const name=String(item?.name||"").trim();
      const reading=String(item?.reading||"").trim();
      const rank=Number(item?.rank)||0;
      const base=baseMap.get(name)||{};
      return {
        ...base,
        name,
        readings:reading ? [reading] : recordReadings(base),
        gender:[sex],
        kanji_count:[...name].length,
        _rankingRank:rank
      };
    }).filter(r=>r.name).sort((a,b)=>a._rankingRank-b._rankingRank);
  }

  function imageTermType(label){
    if(MAIN_IMAGE_TERMS.includes(label)) return "main";
    if(SUB_IMAGE_TERMS.includes(label)) return "sub";
    if(FEATURE_IMAGE_TERMS.includes(label)) return "feature";
    return "";
  }

  function kanaNorm(v){
    return String(v||"")
      .trim()
      .toLowerCase()
      .replace(/[ァ-ヶ]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60))
      .replace(/[\s・･ー-]/g,"");
  }

  function recordGender(rec){
    const g=Array.isArray(rec?.gender)?rec.gender:[];
    return g;
  }

  function genderMatches(rec){
    const sex=$("sex").value;
    if(sex!=="male" && sex!=="female") return true;
    return recordGender(rec).includes(sex);
  }

  function searchableValues(rec){
    return [
      rec?.name,
      ...(Array.isArray(rec?.readings)?rec.readings:(rec?.reading?[rec.reading]:[])),
      ...(rec?.tags||[]),
      ...(rec?.main_image_tags||[]),
      ...(rec?.extended_image_tags||[]),
      ...(rec?.image_subtags||[]),
      ...(rec?.image_search_terms||[]),
      ...(rec?.image_keywords||[])
    ].filter(Boolean).map(String);
  }

  function recordReadings(rec){
    const vals=Array.isArray(rec?.readings) ? rec.readings : (rec?.reading ? [rec.reading] : []);
    return [...new Set(vals.map(x=>String(x||"").trim()).filter(Boolean))];
  }

  function readingDisplay(rec){
    return recordReadings(rec).join(" ／ ");
  }

  function firstReading(rec){
    return recordReadings(rec)[0] || "";
  }

  function dedupeNameRecords(rows){
    // 同じ漢字表記は1件にまとめ、読み・性別・タグを配列として統合する。
    const m=new Map();
    for(const r of rows){
      const key=String(r?.name||"");
      if(!key) continue;
      const prev=m.get(key);
      if(!prev){
        m.set(key,{
          ...r,
          readings:recordReadings(r),
          gender:[...recordGender(r)],
          main_image_tags:[...(r.main_image_tags||[])],
          extended_image_tags:[...(r.extended_image_tags||[])],
          image_subtags:[...(r.image_subtags||[])],
          image_keywords:[...(r.image_keywords||[])]
        });
        continue;
      }
      prev.readings=[...new Set([...recordReadings(prev),...recordReadings(r)])];
      prev.gender=[...new Set([...recordGender(prev),...recordGender(r)])];
      for(const k of ["main_image_tags","extended_image_tags","image_subtags","image_keywords"]){
        prev[k]=[...new Set([...(prev[k]||[]),...(r[k]||[])])];
      }
      prev.favorite_priority=Math.max(Number(prev.favorite_priority||0),Number(r.favorite_priority||0));
    }
    return [...m.values()];
  }

  function baseNameRecords(){
    return dedupeNameRecords(
      state.nameRecords
        .filter(genderMatches)
        .filter(r=>!hasExcludedGivenKanji(r?.name))
    );
  }

  function favoriteNameRecords(){
    return baseNameRecords();
  }

  function favoriteNameSort(chars){
    return (a,b)=>{
      const an=String(a?.name||""), bn=String(b?.name||"");
      const ap=Number(a?.favorite_priority||0), bp=Number(b?.favorite_priority||0);

      // 使いたい字が先頭にある名前を優先する。
      const aStart=chars.every(ch=>an.startsWith(ch)) ? 1 : 0;
      const bStart=chars.every(ch=>bn.startsWith(ch)) ? 1 : 0;
      if(aStart!==bStart) return bStart-aStart;

      // 補助登録の中では、一般的な候補を先にする。
      if(ap!==bp) return bp-ap;

      // 同じ条件なら、使いたい字がより前に現れる名前を優先。
      const apos=chars.reduce((n,ch)=>{
        const i=an.indexOf(ch); return n+(i<0?999:i);
      },0);
      const bpos=chars.reduce((n,ch)=>{
        const i=bn.indexOf(ch); return n+(i<0?999:i);
      },0);
      if(apos!==bpos) return apos-bpos;

      return nameSort(a,b);
    };
  }

  function nameSort(a,b){
    return firstReading(a).localeCompare(firstReading(b),"ja") ||
      String(a?.name||"").localeCompare(String(b?.name||""),"ja");
  }

  function setSearchMode(mode){
    state.searchMode=mode;
    state.selectedImageTerms.clear();
    document.querySelectorAll("[data-search-mode]").forEach(btn=>{
      btn.classList.toggle("selected",btn.dataset.searchMode===mode);
    });
    $("nameCandidatePanel").classList.add("hidden");
    $("nameDiagnosisPanel").classList.add("hidden");
    $("patternPanel").classList.add("hidden");
    $("selectorPanel").classList.add("hidden");
    $("finalPanel").classList.add("hidden");
    renderSearchMode();
    $("searchModePanel").classList.remove("hidden");
    $("searchModePanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function renderSearchMode(){
    const host=$("searchModePanel");
    if(state.searchMode==="kanji"){
      host.innerHTML=`
        <div class="mode-title">気に入った漢字から探す</div>
        <div class="mode-description">使いたい漢字を入力すると、漢字表記を1件にまとめた名前辞典から、その漢字を含む名前を探します。</div>
        <div class="search-line">
          <input id="favoriteKanji" type="text" maxlength="4" placeholder="例：慎、邦、陽、翔、結">
          <button id="favoriteKanjiBtn" type="button" class="btn">名前を探す</button>
        </div>
        <div class="hint">使いたい漢字が名前の先頭にある候補を優先表示します。複数の漢字を入力した場合は、入力した漢字をすべて含む名前を探します。</div>`;
      $("favoriteKanjiBtn").addEventListener("click",runKanjiSearch);
      $("favoriteKanji").addEventListener("keydown",e=>{if(e.key==="Enter")runKanjiSearch();});
      return;
    }

    if(state.searchMode==="name"){
      host.innerHTML=`
        <div class="mode-title">名前・読みから探す</div>
        <div class="mode-description">ひらがな・カタカナの読み、または漢字名で検索します。空欄なら50音順に表示します。</div>
        <div class="search-line">
          <input id="nameQuery" type="text" placeholder="例：はると、ハルト、陽翔">
          <button id="nameQueryBtn" type="button" class="btn">名前を探す</button>
        </div>`;
      $("nameQueryBtn").addEventListener("click",runNameQuerySearch);
      $("nameQuery").addEventListener("keydown",e=>{if(e.key==="Enter")runNameQuerySearch();});
      return;
    }

    if(state.searchMode==="image"){
      host.innerHTML=`
        <div class="mode-title">イメージから探す</div>
        <div class="mode-description">まずメインイメージを1つ選び、その中からサブイメージを1つ選んで絞り込みます。</div>

        <div class="hint"><strong>メインイメージ</strong></div>
        <div id="imageMainList" class="image-group-tabs"></div>

        <div class="hint" style="margin-top:14px"><strong>サブイメージ</strong></div>
        <div id="imageSubList" class="image-term-list"></div>

        <div style="margin-top:14px;padding:12px;border-radius:12px;background:#fff4b8;">
          <div class="hint"><strong>特集から探す</strong></div>
          <div id="imageFeatureList" class="image-term-list"></div>
          <div id="imageFeatureNote" class="hint">※最初に選択した「男の子／女の子」に従って、その年の命名Best20を表示します。</div>
        </div>

        <div class="actions image-actions">
          <button id="clearImageTerms" type="button" class="btn secondary">選択をクリア</button>
        </div>`;
      renderImageGroups();
      $("clearImageTerms").addEventListener("click",()=>{
        state.selectedImageTerms.clear();
        renderImageGroups();
        $("nameCandidatePanel").classList.add("hidden");
      });
      return;
    }

    if(state.searchMode==="stroke"){
      host.innerHTML=`
        <div class="mode-title">画数（姓名判断）から探す</div>
        <div class="mode-description">姓に合わせて、陰陽五行と五格が調和する画数配置を出し、その画数の漢字を選びます。</div>
        <div class="selector-intro">
          名前の地格が31以上になる構成、五格の低評価、陰陽五行の【要注意】は候補から除外します。
        </div>
        <div class="stroke-mode-controls">
          <div>
            <label>名の文字数</label>
            <select id="nameLength">
              <option value="1">1文字</option>
              <option value="2" selected>2文字</option>
              <option value="3">3文字</option>
            </select>
          </div>
          <button id="calcBtn" type="button" class="btn">陰陽五行・五格から画数配置を出す</button>
        </div>`;
      $("calcBtn").addEventListener("click",calcPatterns);
    }
  }

  function renderImageGroups(){
    const selectedMain=MAIN_IMAGE_TERMS.find(x=>state.selectedImageTerms.has(x))||"";
    const selectedSub=SUB_IMAGE_TERMS.find(x=>state.selectedImageTerms.has(x))||"";
    const selectedFeature=FEATURE_IMAGE_TERMS.find(x=>state.selectedImageTerms.has(x))||"";

    $("imageMainList").innerHTML=MAIN_IMAGE_TERMS.map(label=>`
      <button type="button" class="image-group-btn ${selectedMain===label?"selected":""}" data-main-image="${esc(label)}">${esc(label)}</button>
    `).join("");

    if(selectedMain){
      $("imageSubList").innerHTML=SUB_IMAGE_TERMS.map(label=>`
        <button type="button" class="image-term-btn ${selectedSub===label?"selected":""}" data-sub-image="${esc(label)}">${esc(label)}</button>
      `).join("");
    }else{
      $("imageSubList").innerHTML='<span class="hint">先にメインイメージを選んでください。</span>';
    }

    $("imageFeatureList").innerHTML=FEATURE_IMAGE_TERMS.map(label=>`
      <button type="button" class="image-term-btn ${selectedFeature===label?"selected":""}" data-feature-image="${esc(label)}">${esc(label)}</button>
    `).join("");

    document.querySelectorAll("[data-main-image]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const label=btn.dataset.mainImage;
        const same=selectedMain===label;
        state.selectedImageTerms.clear();
        if(!same) state.selectedImageTerms.add(label);
        renderImageGroups();
        $("nameCandidatePanel").classList.add("hidden");
        $("nameDiagnosisPanel").classList.add("hidden");
      });
    });

    document.querySelectorAll("[data-sub-image]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const main=MAIN_IMAGE_TERMS.find(x=>state.selectedImageTerms.has(x))||"";
        if(!main) return;
        const label=btn.dataset.subImage;
        const same=SUB_IMAGE_TERMS.find(x=>state.selectedImageTerms.has(x))===label;
        for(const x of SUB_IMAGE_TERMS) state.selectedImageTerms.delete(x);
        if(!same) state.selectedImageTerms.add(label);
        renderImageGroups();
        runImageSearch();
      });
    });

    document.querySelectorAll("[data-feature-image]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const label=btn.dataset.featureImage;
        const same=selectedFeature===label;
        if(!same && !rankingInputReady()) return;
        state.selectedImageTerms.clear();
        if(!same) state.selectedImageTerms.add(label);
        renderImageGroups();
        runImageSearch();
      });
    });
  }
  function renderImageTerms(){
    renderImageGroups();
  }

  function runKanjiSearch(){
    if(!state.nameRecords.length){
      alert("名前マスターデータが読み込まれていません。");
      return;
    }
    const raw=$("favoriteKanji").value.trim();
    const chars=[...raw].filter(ch=>E.isCJK(ch));
    if(!chars.length){
      alert("使いたい漢字を入力してください。");
      return;
    }
    const blocked=chars.filter(ch=>excludedGivenKanji().has(ch));
    if(blocked.length){
      alert(`「${blocked.join("・")}」は赤ちゃん名付け候補から除外している漢字です。`);
      return;
    }
    const rows=favoriteNameRecords()
      .filter(r=>chars.every(ch=>String(r.name||"").includes(ch)))
      .sort(favoriteNameSort(chars));
    const sex=$("sex").value;
    const sexLabel=sex==="male"?"男の子":sex==="female"?"女の子":"男女";
    renderNameCandidates(
      rows,
      `「${chars.join("・")}」を含む名前`,
      [`漢字：${chars.join("・")}`,`対象：${sexLabel}`]
    );
  }

  function runNameQuerySearch(){
    if(!state.nameRecords.length){
      alert("名前マスターデータが読み込まれていません。");
      return;
    }
    const raw=$("nameQuery").value.trim();
    const q=kanaNorm(raw);
    let rows=baseNameRecords();
    if(raw){
      rows=rows.filter(r=>
        String(r.name||"").includes(raw) ||
        recordReadings(r).some(rd=>kanaNorm(rd).includes(q))
      );
    }
    rows.sort(nameSort);
    renderNameCandidates(
      rows,
      raw?`「${raw}」の検索結果`:"名前一覧（50音順）",
      [raw?`名前・読み：${raw}`:"条件：50音順"]
    );
  }

  function matchesImageTerm(rec,label){
    const type=imageTermType(label);
    if(type==="main" || type==="feature"){
      return Array.isArray(rec?.main_image_tags) && rec.main_image_tags.includes(label);
    }
    if(type==="sub"){
      return Array.isArray(rec?.image_subtags) && rec.image_subtags.includes(label);
    }
    return false;
  }

  function runImageSearch(){
    if(!state.nameRecords.length){
      alert("名前マスターデータが読み込まれていません。");
      return;
    }

    const selectedMain=MAIN_IMAGE_TERMS.find(x=>state.selectedImageTerms.has(x))||"";
    const selectedSub=SUB_IMAGE_TERMS.find(x=>state.selectedImageTerms.has(x))||"";
    const selectedFeature=FEATURE_IMAGE_TERMS.find(x=>state.selectedImageTerms.has(x))||"";

    if(!selectedMain && !selectedFeature){
      $("nameCandidatePanel").classList.add("hidden");
      return;
    }

    if(selectedMain && !selectedSub && !selectedFeature){
      $("nameCandidatePanel").classList.add("hidden");
      return;
    }

    let rows=baseNameRecords();
    let title="";
    const conditions=[];

    if(selectedFeature){
      if(!rankingInputReady()) return;
      if(!state.rankingBest20){
        showRankingMessage("ランキングデータを読み込めませんでした。しばらくしてからもう一度お試しください。");
        return;
      }
      const year=rankingYearFromFeature(selectedFeature);
      const sex=$("sex").value;
      const sexLabel=sex==="male"?"男の子":sex==="female"?"女の子":"";
      rows=rankingFeatureRows(selectedFeature);
      title=selectedFeature;
      conditions.push(`特集：${selectedFeature}`);
      if(sexLabel) conditions.push(`対象：${sexLabel}`);
      if(!rows.length){
        alert(`${year}年の${sexLabel||"選択中の性別"}ランキングが見つかりません。`);
        return;
      }
    }else{
      rows=rows.filter(r=>matchesImageTerm(r,selectedMain));
      conditions.push(`メイン：${selectedMain}`);

      if(selectedSub){
        rows=rows.filter(r=>matchesImageTerm(r,selectedSub));
        conditions.push(`サブ：${selectedSub}`);
        title=`${selectedMain} ＞ ${selectedSub}`;
      }else{
        title=`${selectedMain}の名前`;
      }
      rows.sort(nameSort);
    }

    renderNameCandidates(rows,title,conditions);
  }
  function renderNameCandidates(rows,title,conditions=[]){
    state.currentAllCandidates=rows;
    state.currentCandidateTitle=title;
    state.currentCandidateConditions=conditions;
    state.candidateDisplayCount=60;
    renderCandidatePage();
  }

  function renderCandidatePage(){
    const rows=state.currentAllCandidates||[];
    const shown=rows.slice(0,state.candidateDisplayCount);
    state.currentCandidates=shown;

    $("candidateSummary").textContent=`該当 ${rows.length.toLocaleString()}件 / ${shown.length.toLocaleString()}件を表示`;
    $("activeSearchConditions").innerHTML=(state.currentCandidateConditions||[]).map(x=>`<span class="condition-chip">${esc(x)}</span>`).join("");

    if(!shown.length){
      $("nameCandidateGrid").innerHTML='<div class="notice warn">この条件では候補が見つかりませんでした。条件を少し広げてください。</div>';
    }else{
      $("nameCandidateGrid").innerHTML=shown.map((r,i)=>{
        const genders=recordGender(r);
        const gender=genders.includes("male") && genders.includes("female") ? "共通" :
          genders.includes("male") ? "男" : genders.includes("female") ? "女" : "共通";
        const reading=readingDisplay(r);
        const rankPrefix=Number(r._rankingRank)>0 ? `${Number(r._rankingRank)}位　` : "";
        const rankingHeadStyle=Number(r._rankingRank)>0 ? ' style="display:grid !important;grid-template-columns:60% minmax(0,1fr) auto !important;align-items:center !important;gap:9px !important;"' : "";
        const rankingReadingStyle=Number(r._rankingRank)>0 ? ' style="position:static !important;transform:none !important;max-width:none !important;margin:0 !important;text-align:left !important;justify-self:start !important;"' : "";
        return `<article class="name-candidate-card">
          <div class="name-card-head"${rankingHeadStyle}>
            <div class="candidate-name">${rankPrefix}${esc(r.name)}</div>
            <div class="candidate-reading" title="${esc(reading)}"${rankingReadingStyle}>${esc(reading)}</div>
            <span class="gender-mini">${gender}</span>
          </div>
          <button type="button" class="btn secondary diagnose-name" data-name-index="${i}" style="background:#dff5df;">この名前で診断する</button>
        </article>`;
      }).join("");
      document.querySelectorAll(".diagnose-name").forEach(btn=>{
        btn.addEventListener("click",()=>diagnoseNameRecord(state.currentCandidates[Number(btn.dataset.nameIndex)]));
      });
    }

    let more=$("candidateMore");
    if(!more){
      more=document.createElement("div");
      more.id="candidateMore";
      more.className="candidate-more";
      $("nameCandidateGrid").after(more);
    }
    if(shown.length<rows.length){
      more.innerHTML=`<button type="button" id="candidateMoreBtn" class="btn secondary">さらに表示（次の60件）</button>`;
      $("candidateMoreBtn").addEventListener("click",()=>{
        state.candidateDisplayCount+=60;
        renderCandidatePage();
      });
    }else{
      more.innerHTML="";
    }

    $("nameCandidatePanel").classList.remove("hidden");
    $("nameDiagnosisPanel").classList.add("hidden");
    if(state.candidateDisplayCount===60){
      $("nameCandidatePanel").scrollIntoView({behavior:"smooth",block:"start"});
    }
  }

  function diagnoseNameRecord(rec){
    if(!rec) return;
    const surname=$("surname").value.trim();
    if(!surname){
      alert("姓名判断を見るため、先に姓を入力してください。");
      $("surname").focus();
      return;
    }
    const calc=E.calcPersonal(surname,rec.name,state.dict);
    if(!calc.ok){
      $("nameDiagnosisBox").innerHTML=`<div class="notice bad">辞書未登録文字があるため姓名判断できません：${esc((calc.missing||[]).join("、"))}</div>`;
      $("nameDiagnosisPanel").classList.remove("hidden");
      return;
    }

    const rating=directTriadRating(calc);
    const gate=E.passesPersonalPattern(calc,state.triad,{
      product:"BABY",
      sex:$("sex").value,
      socialIndependence:$("socialIndependence").checked
    });
    const reasons=(gate.reasons||[]).map(x=>String(x).replace(/三才/g,"陰陽五行"));
    const selectedMain=MAIN_IMAGE_TERMS.find(x=>state.selectedImageTerms.has(x))||"";
    const selectedSub=SUB_IMAGE_TERMS.find(x=>state.selectedImageTerms.has(x))||"";

    $("nameDiagnosisBox").innerHTML=`
      <div class="name">${esc(surname+rec.name)}</div>
      <div class="yomi">${esc(readingDisplay(rec))}</div>
      <div class="final-grid">
        ${[["天格",calc.ten],["主格",calc.jin],["地格",calc.chi],["外格",calc.gai],["総格",calc.sou]].map(([label,n])=>`
          <div class="final-stat"><span class="small">${label}</span><b>${n}</b><span>${label==="天格"?"—":stars(n)}</span></div>
        `).join("")}
      </div>
      <div class="stroke-pills diagnosis-summary-pills">
        <span class="pill">陰陽五行 ${triadStars(rating)}</span>
        <span class="pill">適応性 ${esc(sociabilityLabel(calc))}</span>
      </div>
      ${reasons.length?`<div class="notice warn diagnosis-note">確認：${esc(reasons.join("／"))}</div>`:`<div class="notice ok diagnosis-note">現在の名付け基準では候補条件を通過します。</div>`}
      <div class="small" style="margin-top:8px;">陰陽五行で要確認は思わぬアクシデントの可能性がありますので注意してください。</div>
      ${(selectedMain||selectedSub)?`<div class="diagnosis-image-info">
        <strong>名前のイメージ</strong>
        ${selectedMain?`<div class="small">メイン：${esc(selectedMain)}</div>`:""}
        ${selectedSub?`<div class="small">サブ：${esc(selectedSub)}</div>`:""}
      </div>`:""}`;

    $("nameDiagnosisPanel").classList.remove("hidden");
    $("nameDiagnosisPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function updateFemalePreference(){
    const female=$("sex").value==="female";
    $("femalePreference").classList.toggle("hidden",!female);
    if(!female) $("socialIndependence").checked=false;
  }

  function calcPatterns(){
    const surname=$("surname").value.trim();
    const nameLength=Number($("nameLength").value);
    if(!surname){
      alert("姓を入力してください。");
      return;
    }

    const r=E.generatePersonalPatterns(
      surname,
      state.dict,
      state.triad,
      nameLength,
      {
        product:"BABY",
        sex:$("sex").value,
        socialIndependence:$("socialIndependence").checked
      }
    );

    if(!r.ok){
      alert("姓に辞書未登録文字があります："+(r.missing||[]).join("、"));
      return;
    }

    state.patterns=r.patterns||[];
    state.selectedPatternIndex=null;
    state.selectedChars=Array(nameLength).fill(null);
    state.selectedReadings=Array(nameLength).fill("");
    state.slotFilters=Array.from({length:nameLength},()=>({query:""}));

    renderPatterns(r.filterStats||{});
    $("patternPanel").classList.remove("hidden");
    $("mobileSelectedPatternBar")?.classList.add("hidden");
    $("patternSummary")?.classList.remove("hidden");
    $("patternGrid")?.classList.remove("hidden");
    $("selectorPanel").classList.add("hidden");
    $("finalPanel").classList.add("hidden");
    $("patternPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function renderPatterns(filterStats){
    const host=$("patternGrid");
    if(!state.patterns.length){
      host.innerHTML='<div class="notice bad">条件を通過する画数配置がありません。</div>';
      return;
    }

    const excluded=Math.max(
      0,
      (filterStats.examined||0)-(filterStats.accepted||0)
    );
    $("patternSummary").innerHTML=
      `候補画数配置 <strong>${state.patterns.length}</strong>件。`+
      (state.patterns.length>12 ? ` 評価上位<strong>12件</strong>を表示しています。` : "")+
      (excluded?` 低評価・要注意・地格31以上を ${excluded.toLocaleString()}構成除外しました。`:"")+
      ` <strong>ここでは名前は自動生成しません。</strong>`;

    host.innerHTML=state.patterns.slice(0,12).map((p,i)=>{
      const s=p.scores;
      const triadRating=
        directTriadRating(s) ||
        p.triad?.rating ||
        p.triad?.items?.[0]?.[1]?.symbol ||
        "";
      const harmony=triadRating
        ? `陰陽五行：${triadStars(triadRating)}`
        : "陰陽五行：データ未取得";
      const sociability=`適応性：${esc(sociabilityLabel(s))}`;

      return `<div class="pattern-card" data-pcard="${i}">
        <div class="pattern-strokes">${p.strokes.join(" ＋ ")}画</div>
        <div class="stroke-pills">
          <span class="pill">主 ${s.jin} ${stars(s.jin)}</span>
          <span class="pill">地 ${s.chi} ${stars(s.chi)}</span>
          <span class="pill">外 ${s.gai} ${stars(s.gai)}</span>
          <span class="pill">総 ${s.sou} ${stars(s.sou)}</span>
        </div>
        <div class="small"><span>${harmony}</span><span style="margin-left:14px">${sociability}</span></div>
        <div class="actions">
          <button class="btn secondary choose-pattern" data-p="${i}">この画数配置を選ぶ</button>
        </div>
      </div>`;
    }).join("");

    document.querySelectorAll(".choose-pattern").forEach(btn=>{
      btn.addEventListener("click",()=>selectPattern(Number(btn.dataset.p)));
    });
  }

  function selectPattern(index){
    state.selectedPatternIndex=index;
    const p=state.patterns[index];
    state.selectedChars=Array(p.strokes.length).fill(null);
    state.selectedReadings=Array(p.strokes.length).fill("");
    state.slotFilters=Array.from({length:p.strokes.length},()=>({query:""}));

    document.querySelectorAll("[data-pcard]").forEach(el=>{
      el.classList.toggle("selected",Number(el.dataset.pcard)===index);
    });

    renderSlots();
    $("selectorPanel").classList.remove("hidden");
    $("finalPanel").classList.add("hidden");

    if(window.matchMedia("(max-width:600px)").matches){
      $("mobileSelectedPatternLabel").textContent=`選択中：第${index+1}候補`;
      $("mobileSelectedPatternDetails").textContent=
        `${p.strokes.join(" ＋ ")}画（主${p.scores.jin}・地${p.scores.chi}・外${p.scores.gai}・総${p.scores.sou}）`;
      $("mobileSelectedPatternBar").classList.remove("hidden");
      $("patternSummary").classList.add("hidden");
      $("patternGrid").classList.add("hidden");
    }else{
      $("mobileSelectedPatternBar")?.classList.add("hidden");
      $("patternSummary")?.classList.remove("hidden");
      $("patternGrid")?.classList.remove("hidden");
    }

    $("selectorPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function renderSlots(){
    const p=state.patterns[state.selectedPatternIndex];
    if(!p) return;

    $("selectedPatternText").textContent=
      `${p.strokes.join(" ＋ ")}画（主${p.scores.jin}・地${p.scores.chi}・外${p.scores.gai}・総${p.scores.sou}）`;

    const host=$("charSlots");
    host.style.gridTemplateColumns =
      p.strokes.length===1 ? "1fr" :
      p.strokes.length===2 ? "repeat(2,minmax(0,1fr))" :
      "repeat(3,minmax(0,1fr))";

    host.innerHTML=p.strokes.map((stroke,i)=>slotHTML(i,stroke)).join("");

    p.strokes.forEach((stroke,i)=>{
      const q=$(`slotSearch${i}`);
      const clearBtn=$(`slotClear${i}`);

      q.addEventListener("input",()=>{
        state.slotFilters[i].query=q.value;
        renderCharList(i,stroke);
      });

      clearBtn.addEventListener("click",()=>{
        q.value="";
        state.slotFilters[i].query="";
        renderCharList(i,stroke);
        q.focus();
      });

      renderCharList(i,stroke);
    });
  }

  function slotHTML(i,stroke){
    return `<div class="char-slot">
      <h3>${i+1}文字目：<strong>${stroke}画</strong></h3>
      <div class="selector-note">漢字を選ぶと、登録されている複数の読みをすべて表示します。</div>

      <div class="char-tools">
        <input id="slotSearch${i}" type="text" placeholder="漢字・読みで検索（例：はる）">
        <button id="slotClear${i}" type="button" class="clear-search-btn" aria-label="読み検索をクリア">クリア</button>
      </div>

      <div id="slotCount${i}" class="small"></div>
      <div id="charList${i}" class="char-list"></div>
      <div id="selectedChar${i}" class="selected-char">
        <div class="small">まだ漢字を選択していません。</div>
      </div>
    </div>`;
  }

  function renderCharList(i,stroke){
    const filter=state.slotFilters[i]||{query:""};
    const rows=candidateEntries(stroke).filter(e=>matchesSearch(e,filter.query));

    $("slotCount"+i).textContent=
      `${rows.length.toLocaleString()}文字`+
      (filter.query?`（検索結果）`:"");

    const selected=state.selectedChars[i]?.char||"";
    $("charList"+i).innerHTML=rows.map(e=>`
      <button class="char-btn ${e.char===selected?"selected":""}"
              data-slot="${i}" data-char="${esc(e.char)}"
              title="${esc(previewReadings(e))}">
        ${esc(e.char)}
      </button>
    `).join("");

    document.querySelectorAll(`#charList${i} .char-btn`).forEach(btn=>{
      btn.addEventListener("click",()=>{
        chooseChar(i,btn.dataset.char);
      });
    });
  }

  function previewReadings(entry){
    const r=allReadingRows(entry);
    const vals=[...r.nanori,...r.kun,...r.on,...r.other].slice(0,6);
    return vals.join(" / ");
  }

  function chooseChar(slot,char){
    const entry=state.dict.get(char);
    if(!entry) return;

    state.selectedChars[slot]=entry;
    state.selectedReadings[slot]="";

    const p=state.patterns[state.selectedPatternIndex];
    renderCharList(slot,p.strokes[slot]);
    renderSelectedChar(slot,entry);
    updateFinal();
  }

  function renderSelectedChar(slot,entry){
    const r=allReadingRows(entry);

    $("selectedChar"+slot).innerHTML=`
      <div class="selected-char-main">
        <div class="selected-char-glyph">${esc(entry.char)}</div>
        <div>
          <strong>${entry.strokes}画</strong><br>
          <span class="small">下の読みは参考候補です。名前全体の読みは最後に自由入力できます。</span>
        </div>
      </div>

      ${readingGroupHTML(slot,"名乗り",r.nanori,"nanori")}
      ${readingGroupHTML(slot,"音読み",r.on,"on")}
      ${readingGroupHTML(slot,"訓読み",r.kun,"kun")}
      ${readingGroupHTML(slot,"その他",r.other,"other")}
    `;

    document.querySelectorAll(`[data-rslot="${slot}"]`).forEach(btn=>{
      btn.addEventListener("click",()=>{
        state.selectedReadings[slot]=btn.dataset.reading;
        document.querySelectorAll(`[data-rslot="${slot}"]`).forEach(x=>
          x.classList.toggle("selected",x===btn)
        );
        syncReadingInput();
      });
    });
  }

  function readingGroupHTML(slot,label,values,type){
    if(!values.length){
      return `<div class="reading-group">
        <div class="reading-label">${label}</div>
        <div class="small">登録なし</div>
      </div>`;
    }

    return `<div class="reading-group">
      <div class="reading-label">${label}</div>
      <div class="reading-pills">
        ${values.map(v=>`
          <button class="reading-pill"
                  data-rslot="${slot}"
                  data-rtype="${type}"
                  data-reading="${esc(cleanReading(v))}">
            ${esc(v)}
          </button>
        `).join("")}
      </div>
    </div>`;
  }

  function syncReadingInput(){
    const joined=state.selectedReadings.filter(Boolean).join("");
    if(joined) $("finalReading").value=joined;
    updateFinalReadingPreview();
  }

  function updateFinalReadingPreview(){
    $("finalYomi").textContent=$("finalReading").value.trim() || "読み未設定";
  }

  function updateFinal(){
    const p=state.patterns[state.selectedPatternIndex];
    if(!p) return;

    const complete=state.selectedChars.every(Boolean);
    if(!complete){
      $("finalPanel").classList.add("hidden");
      return;
    }

    const surname=$("surname").value.trim();
    const given=state.selectedChars.map(e=>e.char).join("");
    const calc=E.calcPersonal(surname,given,state.dict);

    if(!calc.ok){
      $("finalPanel").classList.remove("hidden");
      $("finalBox").innerHTML='<div class="notice bad">選択した名前を再計算できません。</div>';
      return;
    }

    const t=E.triadSummary(calc,state.triad);
    const finalTriadRating=
      directTriadRating(calc) ||
      t.rating ||
      t.items?.[0]?.[1]?.symbol ||
      "";
    const triadHTML=finalTriadRating
      ? `<div class="stroke-pills">
          <span class="pill">陰陽五行 ${triadStars(finalTriadRating)}</span>
          <span class="pill">適応性 ${esc(sociabilityLabel(calc))}</span>
        </div>`
      : `<div class="small">陰陽五行データを取得できません</div>`;

    $("finalPanel").classList.remove("hidden");
    $("finalName").textContent=surname+given;
    $("finalYomi").textContent=$("finalReading").value.trim()||"読み未設定";
    $("finalStats").innerHTML=[
      ["天格",calc.ten],
      ["主格",calc.jin],
      ["地格",calc.chi],
      ["外格",calc.gai],
      ["総格",calc.sou]
    ].map(([label,n])=>`
      <div class="final-stat">
        <span class="small">${label}</span>
        <b>${n}</b>
        <span>${label==="天格"?"—":stars(n)}</span>
      </div>
    `).join("");
    $("finalTriad").innerHTML=triadHTML;
    $("finalSelectedChars").innerHTML=state.selectedChars.map((e,i)=>`
      <div class="pill">${i+1}文字目 ${esc(e.char)}（${e.strokes}画）</div>
    `).join("");

    $("finalPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  $("surname").addEventListener("input",()=>{
    if(rankingFieldsReady()) clearRankingInputError();
  });

  $("sex").addEventListener("change",()=>{
    updateFemalePreference();
    if(rankingFieldsReady()) clearRankingInputError();
    if(state.searchMode==="image" && state.selectedImageTerms.size) runImageSearch();
    if(state.searchMode==="kanji" && $("favoriteKanji")?.value.trim()) runKanjiSearch();
    if(state.searchMode==="name" && $("nameQuery")) runNameQuerySearch();
  });

  $("backToPatternListBtn")?.addEventListener("click",()=>{
    $("mobileSelectedPatternBar")?.classList.add("hidden");
    $("patternSummary")?.classList.remove("hidden");
    $("patternGrid")?.classList.remove("hidden");
    $("selectorPanel")?.classList.add("hidden");
    $("patternPanel")?.scrollIntoView({behavior:"smooth",block:"start"});
  });

  $("finalReading").addEventListener("input",updateFinalReadingPreview);

  $("selectedNameResetBtn")?.addEventListener("click",()=>{
    $("nameDiagnosisPanel").classList.add("hidden");
    $("nameDiagnosisBox").innerHTML="";
    requestAnimationFrame(()=>{
      $("nameCandidatePanel").scrollIntoView({behavior:"smooth",block:"start"});
    });
  });

  $("strokeSelectedNameResetBtn")?.addEventListener("click",()=>{
    const p=state.patterns[state.selectedPatternIndex];
    const count=p?.strokes?.length || state.selectedChars.length;
    state.selectedChars=Array(count).fill(null);
    state.selectedReadings=Array(count).fill("");
    $("finalReading").value="";
    updateFinalReadingPreview();
    $("finalPanel").classList.add("hidden");
    if(p) renderSlots();
    requestAnimationFrame(()=>{
      $("selectorPanel").scrollIntoView({behavior:"smooth",block:"start"});
    });
  });

  $("basicInfoClearBtn")?.addEventListener("click",()=>{
    $("surname").value="";
    $("sex").value="";
    $("socialIndependence").checked=false;
    updateFemalePreference();
    clearRankingInputError();
    clearRankingMessage();
  });

  $("resetBtn").addEventListener("click",()=>{
    state.searchMode="";
    state.selectedImageTerms.clear();
    state.currentCandidates=[];
    state.currentAllCandidates=[];
    state.currentCandidateTitle="";
    state.currentCandidateConditions=[];
    state.candidateDisplayCount=60;
    state.patterns=[];
    state.selectedPatternIndex=null;
    state.selectedChars=[];
    state.selectedReadings=[];
    state.slotFilters=[];

    document.querySelectorAll("[data-search-mode]").forEach(btn=>{
      btn.classList.remove("selected");
      btn.style.removeProperty("display");
    });

    $("searchModePanel").classList.add("hidden");
    $("searchModePanel").innerHTML="";
    $("nameCandidatePanel").classList.add("hidden");
    $("nameDiagnosisPanel").classList.add("hidden");
    $("patternPanel").classList.add("hidden");
    $("selectorPanel").classList.add("hidden");
    $("finalPanel").classList.add("hidden");
    $("mobileSelectedPatternBar")?.classList.add("hidden");
    clearRankingMessage();

    const vw=Math.min(
      window.innerWidth || 9999,
      document.documentElement.clientWidth || 9999,
      (window.screen && window.screen.width) || 9999
    );
    if(vw<=760){
      requestAnimationFrame(()=>{
        $("searchMethodPanel").scrollIntoView({behavior:"smooth",block:"start"});
      });
    }
  });

  document.querySelectorAll("[data-search-mode]").forEach(btn=>{
    btn.addEventListener("click",()=>setSearchMode(btn.dataset.searchMode));
  });

  updateFemalePreference();
  loadData();
})();
```