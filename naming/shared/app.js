(function(){
  "use strict";

  const E = window.NamingEngine;
  const code = window.NAMING_PRODUCT;
  const P = window.NAMING_PRODUCTS[code];
  if(!P) throw new Error("Unknown product code: "+code);

  const $ = id => document.getElementById(id);
  const state = {
    dict:new Map(),
    triad:null,
    selected:null,
    nameRecords:[],
    selectedPattern:null,
    selectedInput:null,
    selectedChars:[],
    selectedReadings:[],
    slotFilters:[],
    conditionLockReason:""
  };

  document.body.dataset.product = code;
  $("eyebrow").textContent = P.eyebrow;
  $("pageTitle").textContent = P.title;
  $("pageLead").textContent = P.lead;
  $("productCode").textContent = "PRODUCT CODE: "+P.code;
  document.title = P.title+"｜命名";

  renderProductFields();

  if(code==="BABY" && $("sex") && $("femalePreference")){
    const updateFemalePreference=()=>{
      const female=$("sex").value==="female";
      $("femalePreference").classList.toggle("hidden",!female);
      if(!female && $("socialIndependence")) $("socialIndependence").checked=false;
    };
    $("sex").addEventListener("change",updateFemalePreference);
    updateFemalePreference();
  }

  loadData();

  function esc(v){
    return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
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

  function scoreStars(n){
    return fixedStars(E.scoreInfo(Number(n)).score,6);
  }

  function triadLabel(rating){
    const v=String(rating||"");
    if(v==="◎") return "◎最調和";
    if(v==="〇" || v==="○") return "〇調和";
    if(v.includes("要注意")) return "【要注意】";
    return v || "データ未取得";
  }

  function triadStars(rating){
    const v=String(rating||"");
    if(v==="◎") return fixedStars(10,10);
    if(v==="〇" || v==="○") return fixedStars(8,10);
    if(v.includes("要注意")) return '<span style="color:#b00020;font-weight:700;">【要注意】</span>';
    return esc(v||"—");
  }

  async function fetchJSON(url,required=true){
    try{
      const r=await fetch(url,{cache:"no-store"});
      if(!r.ok) throw new Error("HTTP "+r.status);
      return await r.json();
    }catch(e){
      if(required) throw e;
      return null;
    }
  }

  async function loadData(){
    $("dataStatus").textContent="漢字辞書 読込中";
    $("triadStatus").textContent="陰陽五行確認中";
    $("generateBtn").disabled=true;
    $("evaluateBtn").disabled=true;

    try{
      const raw=await fetchJSON("../data/kanjidic-naming.json",true);
      state.dict=E.normalizeDictionary(raw);
      if(!state.dict.size) throw new Error("漢字辞書が空です");
      $("dataStatus").textContent=state.dict.size.toLocaleString()+"文字・準備OK";
      $("dataStatus").className="status ok";
    }catch(e){
      $("dataStatus").textContent="漢字辞書・未接続";
      $("dataStatus").className="status bad";
      $("triadStatus").textContent="陰陽五行・未確認";
      $("triadStatus").className="status warn";
      $("loadError").classList.remove("hidden");
      $("loadError").textContent="命名データを読み込めません。";
      return;
    }

    try{
      const triad=await fetchJSON("../data/sansai.json",true);
      if(!triad || !triad.ratings) throw new Error("陰陽五行データ形式エラー");

      let count=0;
      for(const ten of Object.values(triad.ratings)){
        if(!ten || typeof ten!=="object") continue;
        for(const jin of Object.values(ten)){
          if(jin && typeof jin==="object") count+=Object.keys(jin).length;
        }
      }
      if(count!==125) throw new Error("陰陽五行データ件数："+count);

      state.triad=triad;
      $("triadStatus").textContent="陰陽五行125通り・接続済";
      $("triadStatus").className="status ok";
      $("loadError").classList.add("hidden");

      if(code==="GUARDIAN"){
        const nameMaster=await fetchJSON("../name/name-master.json",false);
        state.nameRecords=Array.isArray(nameMaster?.records) ? nameMaster.records : [];
      }

      $("generateBtn").disabled=false;
      $("evaluateBtn").disabled=false;
    }catch(e){
      state.triad=null;
      $("triadStatus").textContent="陰陽五行・未接続";
      $("triadStatus").className="status bad";
      $("loadError").classList.remove("hidden");
      $("loadError").textContent="陰陽五行データを読み込めません。";
    }
  }

  function checkboxValues(name){
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>x.value);
  }

  function renderProductFields(){
    const host=$("productFields");
    if(code==="BABY"){
      host.innerHTML=`
        <div class="grid2">
          <div><label>姓</label><input id="surname" type="text" placeholder="例：木村"></div>
          <div><label>お子さまの性別</label>
            <select id="sex"><option value="">選択してください</option><option value="male">男の子</option><option value="female">女の子</option><option value="other">指定しない</option></select>
          </div>
          <div><label>生年月日</label><input id="birthDate" type="date"><div class="hint">現在の候補順位には直接使用せず、記録項目として保持します。</div></div>
          <div><label>名の文字数</label><select id="nameLength"><option value="1">1文字</option><option value="2" selected>2文字</option><option value="3">3文字</option></select></div>
          <div><label>希望する読み（任意）</label><input id="desiredReading" type="text" placeholder="例：はると"></div>
          <div id="femalePreference" class="hidden"><label>女性の社会的自立・活躍を積極的に重視</label><div class="check"><label><input id="socialIndependence" type="checkbox"> 重視する</label></div></div>
        </div>
        <h3>名前に込めたい願い</h3>
        ${wishChecks("babyWish",["健康","優しさ","知性","行動力","創造性","自立","人との縁","安定"])}
      `;
    }else if(code==="GUARDIAN"){
      host.innerHTML=`
        <div class="grid2">
          <div><label>姓（必須）</label><input id="surname" type="text" placeholder="例：木村"></div>
          <div><label>性別</label><select id="sex"><option value="other">指定しない</option><option value="male">男性</option><option value="female">女性</option></select></div>
          <div><label>名の文字数</label><select id="nameLength"><option value="1">1文字</option><option value="2" selected>2文字</option><option value="3">3文字</option></select></div>
        </div>
      `;
    }else{
      host.innerHTML=`
        <div class="grid2">
          <div><label>命名対象</label><select id="businessType"><option value="company">会社名</option><option value="product">商品名</option></select></div>
          <div><label>名称の文字数</label><select id="nameLength"><option value="1">1文字</option><option value="2" selected>2文字</option><option value="3">3文字</option><option value="4">4文字</option></select></div>
          <div><label>希望する読み（任意）</label><input id="desiredReading" type="text" placeholder="例：みらい"></div>
          <div><label>業種・商品分野（任意）</label><input id="industry" type="text" placeholder="例：食品 / 美容 / IT"></div>
        </div>
        <h3>求める印象</h3>
        ${wishChecks("businessWish",["信頼","高級感","親しみ","革新性","力強さ","安心感","和風","国際性"])}
        <div class="notice warn">会社名・商品名では、個人姓名用の陰陽五行・五格をそのまま適用せず、名称全体の熊崎式総画数を中心に評価します。</div>
      `;
    }
  }

  function wishChecks(name,items){
    return `<div class="checks">${items.map(x=>`<div class="check"><label><input type="checkbox" name="${name}" value="${esc(x)}"> ${esc(x)}</label></div>`).join("")}</div>`;
  }

  function getInput(){
    if(code==="BABY"){
      return {
        surname:$("surname").value.trim(), sex:$("sex").value,
        birthDate:$("birthDate").value, nameLength:Number($("nameLength").value),
        desiredReading:$("desiredReading").value.trim(),
        socialIndependence:$("socialIndependence").checked,
        wishes:checkboxValues("babyWish")
      };
    }
    if(code==="GUARDIAN"){
      return {
        surname:$("surname").value.trim(),
        sex:$("sex").value,
        nameLength:Number($("nameLength").value),
        wishes:[]
      };
    }
    return {
      businessType:$("businessType").value,
      industry:$("industry").value.trim(), nameLength:Number($("nameLength").value),
      desiredReading:$("desiredReading").value.trim(),
      wishes:checkboxValues("businessWish")
    };
  }

  function lockNamingConditions(reason){
    if(code!=="GUARDIAN") return;

    state.conditionLockReason=reason||"";
    const host=$("productFields");
    if(!host) return;

    host.classList.add("guardian-conditions-locked");
    host.setAttribute("aria-disabled","true");
    host.querySelectorAll("input,select").forEach(el=>{
      el.disabled=true;
    });

    const notice=$("conditionLockNotice");
    if(notice){
      notice.textContent=
        reason==="pattern"
          ?"命名条件を変更する場合は「配置候補クリア」を押してください。"
          :"命名条件を変更する場合は「リセット」を押してください。";
      notice.classList.remove("hidden");
    }
  }

  function unlockNamingConditions(){
    if(code!=="GUARDIAN") return;

    state.conditionLockReason="";
    const host=$("productFields");
    if(!host) return;

    host.classList.remove("guardian-conditions-locked");
    host.removeAttribute("aria-disabled");
    host.querySelectorAll("input,select").forEach(el=>{
      el.disabled=false;
    });

    $("conditionLockNotice")?.classList.add("hidden");
  }

  function namingConditionLockMessage(){
    if(!state.conditionLockReason) return;
    alert(
      state.conditionLockReason==="pattern"
        ?"命名条件を変更する場合は、先に「配置候補クリア」を押してください。"
        :"命名条件を変更する場合は、先に「リセット」を押してください。"
    );
  }

  if(code==="GUARDIAN" && $("productFields")){
    $("productFields").addEventListener("click",()=>{
      if(state.conditionLockReason) namingConditionLockMessage();
    });
  }

  $("generateBtn").addEventListener("click",generate);
  $("evaluateBtn").addEventListener("click",evaluateDirect);
  $("directResetBtn")?.addEventListener("click",resetDirectEvaluation);
  $("patternResetBtn")?.addEventListener("click",resetPatternCandidates);
  $("resetBtn").addEventListener("click",()=>location.reload());

  function resetDirectEvaluation(){
    if(code!=="GUARDIAN") return;
    unlockNamingConditions();
    state.selected=null;
    state.selectedChars=[];
    state.selectedReadings=[];
    if($("directName")) $("directName").value="";
    if($("directResult")){
      $("directResult").innerHTML="";
      $("directResult").classList.remove("hidden");
    }
    $("finalPanel")?.classList.add("hidden");
    $("directName")?.focus();
  }

  function resetPatternCandidates(){
    if(code!=="GUARDIAN") return;

    unlockNamingConditions();
    state.selected=null;
    state.selectedPattern=null;
    state.selectedInput=null;
    state.selectedChars=[];
    state.selectedReadings=[];
    state.slotFilters=[];

    $("resultPanel")?.classList.add("hidden");
    $("finalPanel")?.classList.add("hidden");
    $("directEvalPanel")?.classList.remove("hidden");

    if($("patterns")) $("patterns").innerHTML="";
    if($("candidates")) $("candidates").innerHTML="";
    if($("guardianCharSlots")) $("guardianCharSlots").innerHTML="";

    $("selectedPatternBar")?.classList.add("hidden");
    $("candidateHeading")?.classList.add("hidden");
    $("candidates")?.classList.add("hidden");
    $("guardianCharSelector")?.classList.add("hidden");
    $("summary")?.classList.remove("hidden");
    $("patternHeading")?.classList.remove("hidden");
    $("patterns")?.classList.remove("hidden");
  }

  function generate(){
    const input=getInput();
    state.selected=null;
    $("finalPanel").classList.add("hidden");
    $("resultPanel").classList.remove("hidden");
    if(code==="GUARDIAN"){
      $("directEvalPanel")?.classList.add("hidden");
    }
    $("patterns").innerHTML="";
    $("candidates").innerHTML="";
    $("candidateHeading")?.classList.add("hidden");
    $("candidates")?.classList.add("hidden");
    if(code==="GUARDIAN"){
      state.selectedPattern=null;
      state.selectedInput=null;
      state.selectedChars=[];
      state.selectedReadings=[];
      state.slotFilters=[];
      $("selectedPatternBar")?.classList.add("hidden");
      $("summary")?.classList.remove("hidden");
      $("patternHeading")?.classList.remove("hidden");
      $("patterns")?.classList.remove("hidden");
      $("guardianCharSelector")?.classList.add("hidden");
      if($("guardianCharSlots")) $("guardianCharSlots").innerHTML="";
    }

    if(P.personal){
      if(!input.surname){
        showMessage("姓を入力してください。",true); return;
      }
      const r=E.generatePersonalPatterns(input.surname,state.dict,state.triad,input.nameLength,{
        product:code,sex:input.sex,socialIndependence:input.socialIndependence
      });
      if(!r.ok){
        showMessage("辞書未登録文字があります："+r.missing.join("、"),true); return;
      }
      if(code==="GUARDIAN") lockNamingConditions("pattern");
      renderPersonalPatterns(r.patterns,input,r.filterStats);
    }else{
      const patterns=E.generateBusinessPatterns(state.dict,input.nameLength);
      renderBusinessPatterns(patterns,input);
    }
  }

  function renderPersonalPatterns(patterns,input,filterStats){
    if(!patterns.length){
      showMessage("条件を通過する画数配置がありません。",true);
      return;
    }

    const fs=filterStats||{};
    const excluded=Math.max(0,(fs.examined||0)-(fs.accepted||0));

    $("summary").innerHTML=
      `候補画数配置 <strong>${patterns.length}</strong>件。`+
      (patterns.length>9 ? ` 評価上位<strong>9件</strong>を表示しています。` : "")+
      (excluded?` 低評価・要注意・地格31以上を ${excluded.toLocaleString()}構成除外しました。`:"")+
      ` <strong>ここでは名前は自動生成しません。</strong>`;

    $("patterns").innerHTML=patterns.slice(0,9).map((p,i)=>personalPatternCard(p,i)).join("");

    if(code==="GUARDIAN" && $("backToPatternsBtn")){
      $("backToPatternsBtn").onclick=()=>{
        $("selectedPatternBar")?.classList.add("hidden");
        $("candidateHeading")?.classList.add("hidden");
        $("candidates")?.classList.add("hidden");
        $("guardianCharSelector")?.classList.add("hidden");
        $("summary")?.classList.remove("hidden");
        $("patternHeading")?.classList.remove("hidden");
        $("patterns")?.classList.remove("hidden");
        $("patternHeading")?.scrollIntoView({behavior:"smooth",block:"start"});
      };
    }

    document.querySelectorAll("[data-pattern]").forEach(btn=>btn.addEventListener("click",()=>{
      const patternIndex=Number(btn.dataset.pattern);
      const pattern=patterns[patternIndex];

      if(code==="GUARDIAN"){
        const triadMark=pattern?.triad?.available
          ?(pattern.triad.rating || pattern.triad.items?.[0]?.[1]?.symbol || "—")
          :"未接続";

        $("selectedPatternLabel").textContent=`選択中：第${patternIndex+1}候補`;
        $("selectedPatternDetails").textContent=
          `${pattern.strokes.join("＋")}画 ｜ 主${pattern.scores.jin}・地${pattern.scores.chi}・外${pattern.scores.gai}・総${pattern.scores.sou} ｜ 陰陽五行 ${triadMark}`;

        $("summary")?.classList.add("hidden");
        $("patternHeading")?.classList.add("hidden");
        $("patterns")?.classList.add("hidden");
        $("selectedPatternBar")?.classList.remove("hidden");
        $("candidateHeading").textContent=`第${patternIndex+1}候補：登録済みの名前候補`;
        selectGuardianPattern(pattern,patternIndex,input);
      }else{
        $("candidateHeading")?.classList.remove("hidden");
        $("candidates")?.classList.remove("hidden");
        renderCandidates(pattern,input,true);
      }

      if(code==="GUARDIAN"){
        $("selectedPatternBar")?.scrollIntoView({behavior:"smooth",block:"start"});
      }
    }));
  }

  function personalPatternCard(p,i){
    const s=p.scores;
        const triadRating=p.triad?.available
      ?(p.triad.rating || p.triad.items?.[0]?.[1]?.symbol || "")
      :"";
    const harmony=`陰陽五行：${triadStars(triadRating)}`;
    const sociability=(()=>{
      const jinLast=Math.abs(Number(s.jin)||0)%10;
      const gaiLast=Math.abs(Number(s.gai)||0)%10;
      return `社交性：${((jinLast+4)%10)===gaiLast ? "やや不調和" : "普通"}`;
    })();

    return `<div class="card">
      ${code==="GUARDIAN"?`<div class="guardian-pattern-rank">第${i+1}候補</div>`:""}
      <div class="score">${p.strokes.join(" ＋ ")}画</div>
      <div class="pills">
        <span class="pill">主 ${s.jin} ${scoreStars(s.jin)}</span>
        <span class="pill">地 ${s.chi} ${scoreStars(s.chi)}</span>
        <span class="pill">外 ${s.gai} ${scoreStars(s.gai)}</span>
        <span class="pill">総 ${s.sou} ${scoreStars(s.sou)}</span>
      </div>
      <div class="small"><span>${harmony}</span><span style="margin-left:14px">${sociability}</span></div>
      <div class="actions"><button class="btn secondary" data-pattern="${i}">この画数配置を選ぶ</button></div>
    </div>`;
  }

  function renderBusinessPatterns(patterns,input){
    if(!patterns.length){showMessage("条件に合う画数構成を作れませんでした。",true);return}
    $("summary").innerHTML=`総画数評価の高い画数構成を <strong>${patterns.length}</strong> 件抽出しました。`;
    $("patterns").innerHTML=patterns.slice(0,9).map((p,i)=>`
      <div class="card">
        <div class="score">${p.strokes.join("＋")}画 ＝ 総${p.total}画</div>
        <div class="small">総画数評価 ${"★".repeat(p.score)}</div>
        <div class="actions"><button class="btn secondary" data-pattern="${i}">この画数から漢字候補</button></div>
      </div>`).join("");
    document.querySelectorAll("[data-pattern]").forEach(btn=>btn.addEventListener("click",()=>{
      renderCandidates(patterns[Number(btn.dataset.pattern)],input,false);
    }));
    renderCandidates(patterns[0],input,false);
  }


  function guardianReadingNorm(v){
    return String(v||"")
      .trim()
      .toLowerCase()
      .replace(/[ァ-ヶ]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60))
      .replace(/[\s・･ー-]/g,"");
  }

  function guardianRecordReadings(rec){
    const vals=Array.isArray(rec?.readings)
      ? rec.readings
      : (rec?.reading ? [rec.reading] : []);
    return [...new Set(vals.map(x=>String(x||"").trim()).filter(Boolean))];
  }

  function guardianRecordGender(rec){
    return Array.isArray(rec?.gender) ? rec.gender : [];
  }

  function guardianGenderMatches(rec,sex){
    if(sex!=="male" && sex!=="female") return true;
    return guardianRecordGender(rec).includes(sex);
  }

  function guardianGenderLabel(rec){
    const g=guardianRecordGender(rec);
    if(g.includes("male") && g.includes("female")) return "男女共通";
    if(g.includes("male")) return "男性";
    if(g.includes("female")) return "女性";
    return "共通";
  }

  function guardianNameMatchesPattern(rec,pattern){
    const chars=[...String(rec?.name||"")];
    if(chars.length!==pattern.strokes.length) return false;
    return chars.every((ch,i)=>{
      const e=state.dict.get(ch);
      return e && Number(e.strokes)===Number(pattern.strokes[i]);
    });
  }

  function guardianRegisteredNames(pattern,input){
    return (state.nameRecords||[])
      .filter(r=>guardianGenderMatches(r,input.sex))
      .filter(r=>guardianNameMatchesPattern(r,pattern))
      .sort((a,b)=>{
        const ar=guardianRecordReadings(a)[0]||"";
        const br=guardianRecordReadings(b)[0]||"";
        return ar.localeCompare(br,"ja") ||
          String(a?.name||"").localeCompare(String(b?.name||""),"ja");
      });
  }

  function guardianAllReadingRows(entry){
    const r=entry?.readings||{};
    return {
      nanori:Array.isArray(r.nanori)?r.nanori:[],
      on:Array.isArray(r.on)?r.on:[],
      kun:Array.isArray(r.kun)?r.kun:[],
      other:Array.isArray(r.other)?r.other:[]
    };
  }

  function guardianHasAnyReading(entry){
    const r=guardianAllReadingRows(entry);
    return r.nanori.length+r.on.length+r.kun.length+r.other.length>0;
  }

  function guardianCandidateEntries(stroke,slotIndex,input){
    const priorityChars=new Set();
    for(const r of guardianRegisteredNames(state.selectedPattern,input)){
      const chars=[...String(r?.name||"")];
      if(chars[slotIndex]) priorityChars.add(chars[slotIndex]);
    }

    const rows=[...state.dict.values()].filter(e=>
      Number(e.strokes)===Number(stroke) &&
      E.isCJK(e.char) &&
      guardianHasAnyReading(e)
    );

    rows.sort((a,b)=>{
      const ap=priorityChars.has(a.char)?1:0;
      const bp=priorityChars.has(b.char)?1:0;
      if(ap!==bp) return bp-ap;
      const ar=guardianAllReadingRows(a), br=guardianAllReadingRows(b);
      if(ar.nanori.length!==br.nanori.length) return br.nanori.length-ar.nanori.length;
      const ac=ar.on.length+ar.kun.length+ar.other.length;
      const bc=br.on.length+br.kun.length+br.other.length;
      if(ac!==bc) return bc-ac;
      return a.char.localeCompare(b.char,"ja");
    });
    return rows;
  }

  function guardianEntryMatchesSearch(entry,query){
    const raw=String(query||"").trim();
    const q=guardianReadingNorm(raw);
    if(!q) return true;
    if(String(entry?.char||"").includes(raw)) return true;
    const r=guardianAllReadingRows(entry);
    return [...r.nanori,...r.on,...r.kun,...r.other]
      .some(x=>guardianReadingNorm(x).includes(q));
  }

  function selectGuardianPattern(pattern,patternIndex,input){
    state.selectedPattern=pattern;
    state.selectedInput=input;
    state.selectedChars=Array(pattern.strokes.length).fill(null);
    state.selectedReadings=Array(pattern.strokes.length).fill("");
    state.slotFilters=Array.from({length:pattern.strokes.length},()=>({query:""}));

    renderGuardianRegisteredNames(pattern,input);
    renderGuardianCharSelector(pattern,input);

    $("candidateHeading")?.classList.remove("hidden");
    $("candidates")?.classList.remove("hidden");
    $("guardianCharSelector")?.classList.remove("hidden");
  }

  function renderGuardianRegisteredNames(pattern,input){
    const rows=guardianRegisteredNames(pattern,input);
    const sexLabel=input.sex==="male"?"男性":input.sex==="female"?"女性":"性別指定なし";
    const host=$("candidates");

    if(!state.nameRecords.length){
      host.innerHTML=`<div class="notice warn">名前マスターが未接続のため、登録済み候補は表示できません。下の漢字選択は使用できます。</div>`;
      return;
    }

    if(!rows.length){
      host.innerHTML=`<div class="notice warn">${esc(sexLabel)}・${esc(pattern.strokes.join("＋"))}画に一致する登録済み名前はありません。下の漢字選択から作成できます。</div>`;
      return;
    }

    host.innerHTML=rows.slice(0,24).map((r,i)=>{
      const readings=guardianRecordReadings(r).join(" ／ ") || "読み未登録";
      return `<div class="card">
        <div class="guardian-name-candidate-head">
          <div>
            <div class="name">${esc(r.name)}</div>
            <div class="guardian-name-candidate-reading">${esc(readings)}</div>
          </div>
          <span class="guardian-gender-badge">${esc(guardianGenderLabel(r))}</span>
        </div>
        <div class="small">${esc(pattern.strokes.join("＋"))}画</div>
        <div class="actions">
          <button class="btn choose-registered-name" data-rname="${i}">この名前を選ぶ</button>
        </div>
      </div>`;
    }).join("");

    document.querySelectorAll(".choose-registered-name").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const rec=rows[Number(btn.dataset.rname)];
        chooseGuardianRegisteredName(rec,pattern,input);
      });
    });
  }

  function chooseGuardianRegisteredName(rec,pattern,input){
    const chars=[...String(rec?.name||"")];
    state.selectedChars=chars.map(ch=>state.dict.get(ch)||null);
    state.selectedReadings=Array(chars.length).fill("");
    const reading=guardianRecordReadings(rec)[0]||"";
    showGuardianFinal(chars.join(""),reading,pattern,input);
  }

  function renderGuardianCharSelector(pattern,input){
    $("guardianSelectedPatternText").textContent=
      `${pattern.strokes.join(" ＋ ")}画（主${pattern.scores.jin}・地${pattern.scores.chi}・外${pattern.scores.gai}・総${pattern.scores.sou}）`;

    const host=$("guardianCharSlots");
    host.style.gridTemplateColumns =
      pattern.strokes.length===1 ? "1fr" :
      pattern.strokes.length===2 ? "repeat(2,minmax(0,1fr))" :
      "repeat(3,minmax(0,1fr))";

    host.innerHTML=pattern.strokes.map((stroke,i)=>guardianCharSlotHTML(i,stroke)).join("");

    pattern.strokes.forEach((stroke,i)=>{
      const q=$(`guardianSlotSearch${i}`);
      const clear=$(`guardianSlotClear${i}`);

      q.addEventListener("input",()=>{
        state.slotFilters[i].query=q.value;
        renderGuardianCharList(i,stroke,input);
      });
      clear.addEventListener("click",()=>{
        q.value="";
        state.slotFilters[i].query="";
        renderGuardianCharList(i,stroke,input);
        q.focus();
      });

      renderGuardianCharList(i,stroke,input);
    });
  }

  function guardianCharSlotHTML(i,stroke){
    return `<div class="guardian-char-slot">
      <h3>${i+1}文字目：<strong>${stroke}画</strong></h3>
      <div class="guardian-char-tools">
        <input id="guardianSlotSearch${i}" type="text" placeholder="漢字・読みで検索">
        <button id="guardianSlotClear${i}" type="button" class="btn secondary">クリア</button>
      </div>
      <div id="guardianSlotCount${i}" class="small"></div>
      <div id="guardianCharList${i}" class="guardian-char-list"></div>
      <div id="guardianSelectedChar${i}" class="guardian-selected-char">
        <div class="small">まだ漢字を選択していません。</div>
      </div>
    </div>`;
  }

  function renderGuardianCharList(i,stroke,input){
    const query=state.slotFilters[i]?.query||"";
    const rows=guardianCandidateEntries(stroke,i,input)
      .filter(e=>guardianEntryMatchesSearch(e,query));

    $(`guardianSlotCount${i}`).textContent=
      `${rows.length.toLocaleString()}文字`+(query?"（検索結果）":"");

    const selected=state.selectedChars[i]?.char||"";
    $(`guardianCharList${i}`).innerHTML=rows.map(e=>`
      <button class="guardian-char-btn ${e.char===selected?"selected":""}"
              data-gslot="${i}" data-gchar="${esc(e.char)}"
              title="${esc(guardianPreviewReadings(e))}">
        ${esc(e.char)}
      </button>
    `).join("");

    document.querySelectorAll(`#guardianCharList${i} .guardian-char-btn`).forEach(btn=>{
      btn.addEventListener("click",()=>chooseGuardianChar(i,btn.dataset.gchar,input));
    });
  }

  function guardianPreviewReadings(entry){
    const r=guardianAllReadingRows(entry);
    return [...r.nanori,...r.kun,...r.on,...r.other].slice(0,8).join(" / ");
  }

  function chooseGuardianChar(slot,char,input){
    const entry=state.dict.get(char);
    if(!entry) return;
    state.selectedChars[slot]=entry;
    state.selectedReadings[slot]="";

    const pattern=state.selectedPattern;
    renderGuardianCharList(slot,pattern.strokes[slot],input);
    renderGuardianSelectedChar(slot,entry,input);
    updateGuardianManualFinal(input);
  }

  function renderGuardianSelectedChar(slot,entry,input){
    const r=guardianAllReadingRows(entry);

    function group(label,values){
      if(!values.length) return "";
      return `<div class="guardian-reading-group">
        <div class="guardian-reading-label">${label}</div>
        <div class="guardian-reading-pills">
          ${values.map(v=>`
            <button class="guardian-reading-pill"
                    data-grslot="${slot}"
                    data-greading="${esc(String(v).replaceAll(".",""))}">
              ${esc(v)}
            </button>`).join("")}
        </div>
      </div>`;
    }

    $(`guardianSelectedChar${slot}`).innerHTML=`
      <div class="guardian-selected-char-main">
        <div class="guardian-selected-char-glyph">${esc(entry.char)}</div>
        <div><strong>${entry.strokes}画</strong><br><span class="small">読みを選ぶと最終表示に反映します。</span></div>
      </div>
      ${group("名乗り",r.nanori)}
      ${group("音読み",r.on)}
      ${group("訓読み",r.kun)}
      ${group("その他",r.other)}
    `;

    document.querySelectorAll(`[data-grslot="${slot}"]`).forEach(btn=>{
      btn.addEventListener("click",()=>{
        state.selectedReadings[slot]=btn.dataset.greading||"";
        document.querySelectorAll(`[data-grslot="${slot}"]`).forEach(x=>
          x.classList.toggle("selected",x===btn)
        );
        updateGuardianManualFinal(input);
      });
    });
  }

  function updateGuardianManualFinal(input){
    if(!state.selectedChars.length || !state.selectedChars.every(Boolean)){
      $("finalPanel").classList.add("hidden");
      return;
    }
    const given=state.selectedChars.map(e=>e.char).join("");
    const reading=state.selectedReadings.filter(Boolean).join("");
    showGuardianFinal(given,reading,state.selectedPattern,input);
  }

  function showGuardianFinal(given,reading,pattern,input){
    state.selected={c:{text:given,reading},pattern,input,personal:true};

    const calc=E.calcPersonal(input.surname,given,state.dict);
    if(!calc.ok) return;

    const t=E.triadSummary(calc,state.triad);
    const directRating=
      (typeof E.pickTriadRating==="function" && state.triad)
        ? E.pickTriadRating(state.triad,calc.ten,calc.jin,calc.chi)
        : null;
    const triadRating=
      directRating ||
      t?.rating ||
      t?.items?.[0]?.[1]?.symbol ||
      "";

    
    const sociability=(()=>{
      const jinLast=Math.abs(Number(calc.jin)||0)%10;
      const gaiLast=Math.abs(Number(calc.gai)||0)%10;
      return ((jinLast+4)%10)===gaiLast ? "やや不調和" : "普通";
    })();

    $("finalPanel").classList.remove("hidden");
    $("finalName").textContent=input.surname+given;
    $("finalReading").value=reading||"";
    $("finalYomi").textContent=reading||"読み未設定";

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
        <span>${label==="天格"?"—":scoreStars(n)}</span>
      </div>
    `).join("");

    $("finalTriad").innerHTML=triadRating
      ? `<div class="stroke-pills">
          <span class="pill">陰陽五行 ${triadStars(triadRating)}</span>
          <span class="pill">社交性 ${esc(sociability)}</span>
        </div>`
      : `<div class="small">陰陽五行データを取得できません</div>`;

    const selectedEntries=
      state.selectedChars.length && state.selectedChars.every(Boolean)
        ? state.selectedChars
        : [...given].map(ch=>state.dict.get(ch)).filter(Boolean);

    $("finalSelectedChars").innerHTML=selectedEntries.map(e=>`
      <div class="pill">${esc(e.char)}（${e.strokes}画）</div>
    `).join("");

    $("finalPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function renderCandidates(pattern,input,personal){
    const candidates=E.buildCandidatesForPattern(
      pattern,state.dict,input.desiredReading,input.wishes,
      personal?12:18,
      {personal,product:code,nameLength:input.nameLength,sex:input.sex}
    );
    if(!candidates.length){
      $("candidates").innerHTML=`<div class="notice warn">${
        personal
          ?"この画数構成では、名乗り読みを持つ漢字だけでは現実的な読み長さの候補を作れませんでした。別の画数構成を選ぶか、希望する読みを指定して再確認してください。"
          :"この画数構成では、現在の読み条件に一致する漢字候補が見つかりませんでした。別の画数構成を選ぶか、希望する読みを空欄にしてお試しください。"
      }</div>`;
      return;
    }

    $("candidates").innerHTML=candidates.map((c,i)=>{
      const scoreText=personal
        ? `主${pattern.scores.jin}・地${pattern.scores.chi}・外${pattern.scores.gai}・総${pattern.scores.sou}`
        : `総${pattern.total}画 ${"★".repeat(pattern.score)}`;
      return `<div class="card">
        <div class="name">${esc(c.text)}</div>
        <div class="reading">${esc(c.reading||"読み候補なし")}</div>
        <div class="small">${pattern.strokes.join("＋")}画 / ${scoreText}</div>
        ${c.tagBonus?`<div class="small">希望タグ一致：${c.tagBonus}</div>`:""}
        <div class="actions"><button class="btn choose-candidate" data-ci="${i}">候補として選択</button></div>
      </div>`;
    }).join("");

    document.querySelectorAll(".choose-candidate").forEach(btn=>btn.addEventListener("click",()=>{
      const c=candidates[Number(btn.dataset.ci)];
      chooseCandidate(c,pattern,input,personal);
    }));
  }

  function chooseCandidate(c,pattern,input,personal){
    state.selected={c,pattern,input,personal};
    $("finalPanel").classList.remove("hidden");
    const full=personal ? input.surname+c.text : c.text;
    $("finalName").textContent=full;
    $("finalReading").textContent=c.reading||"";
    $("finalDetails").innerHTML=personal
      ? `姓：${esc(input.surname)} / 名：${esc(c.text)}<br>主格 ${pattern.scores.jin}・地格 ${pattern.scores.chi}・外格 ${pattern.scores.gai}・総格 ${pattern.scores.sou}`
      : `${input.businessType==="company"?"会社名":"商品名"} / 総画数 ${pattern.total}`;
    $("finalLabel").textContent=P.finalLabel;
    $("finalPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function evaluateDirect(){
    const input=getInput();
    const name=$("directName").value.trim();

    $("finalPanel")?.classList.add("hidden");
    $("directResult")?.classList.remove("hidden");

    if(!name){$("directResult").innerHTML=`<span class="warning">評価する候補名を入力してください。</span>`;return}

    if(P.personal){
      if(!input.surname){$("directResult").innerHTML=`<span class="warning">先に姓を入力してください。</span>`;return}

      const r=E.calcPersonal(input.surname,name,state.dict);
      if(!r.ok){$("directResult").innerHTML=`<span class="danger">辞書未登録文字：${esc(r.missing.join("、"))}</span>`;return}

      if(code==="GUARDIAN") lockNamingConditions("direct");
      state.selectedChars=[...name].map(ch=>state.dict.get(ch)).filter(Boolean);
      state.selectedReadings=Array(state.selectedChars.length).fill("");

      $("directResult").innerHTML="";
      $("directResult").classList.add("hidden");

      showGuardianFinal(name,"",null,input);
    }else{
      const r=E.evaluateBusiness(name,state.dict);
      if(!r.ok){$("directResult").innerHTML=`<span class="danger">辞書未登録文字：${esc(r.missing.join("、"))}</span>`;return}
      $("directResult").innerHTML=
        `<strong>${esc(name)}</strong><br>総画数：${r.total}画　${"★".repeat(r.score)}<br>`+
        `<span class="small">${r.rows.map(x=>`${esc(x.char)}(${x.strokes})`).join("＋")}</span>`;
    }
  }

  function showMessage(text,bad=false){
    $("summary").innerHTML=`<div class="notice ${bad?"bad":""}">${esc(text)}</div>`;
  }

  if(code==="GUARDIAN" && $("finalReading")){
    $("finalReading").addEventListener("input",()=>{
      $("finalYomi").textContent=$("finalReading").value.trim() || "読み未設定";
    });
  }
})();
