(function(){
  "use strict";

  const E = window.NamingEngine;
  const $ = id => document.getElementById(id);

  const state = {
    dict:new Map(),
    diagnosis:null
  };

  async function fetchJSON(url){
    const r = await fetch(url,{cache:"no-store"});
    if(!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
    return await r.json();
  }

  function setMessage(text){
    const box=$("inputMessage");
    if(!text){
      box.textContent="";
      box.classList.add("hidden");
      return;
    }
    box.textContent=text;
    box.classList.remove("hidden");
  }

  async function load(){
    try{
      const [rawDict,diagnosis] = await Promise.all([
        fetchJSON("../data/kanjidic-naming.json"),
        fetchJSON("../data/business-total-diagnosis.json")
      ]);

      state.dict=E.normalizeDictionary(rawDict);
      state.diagnosis=diagnosis;

      if(!state.dict.size) throw new Error("漢字・かな辞書が空です。");
      if(!diagnosis?.totals || Object.keys(diagnosis.totals).length!==81){
        throw new Error("総画診断データが81数そろっていません。");
      }

      $("diagnoseBtn").disabled=false;
    }catch(err){
      setMessage("診断データを読み込めません："+err.message);
    }
  }

  function countCharacters(text){
    const value=String(text||"").trim();
    if(!value) return 0;
    if(typeof Intl!=="undefined" && typeof Intl.Segmenter==="function"){
      return Array.from(new Intl.Segmenter("ja",{granularity:"grapheme"}).segment(value)).length;
    }
    return Array.from(value).length;
  }

  function updateNameLength(){
    $("nameLength").value=String(countCharacters($("businessName").value));
  }

  function diagnose(){
    setMessage("");
    $("resultPanel").classList.add("hidden");

    const name=$("businessName").value.trim();

    if(!name){
      setMessage("診断する名称を入力してください。");
      $("businessName").focus();
      return;
    }

    if(/[A-Za-z0-9]|[!-/:-@[-`{-~]|[・･★☆＋+＆&]/u.test(name)){
      setMessage("型式・分類を表す英字・数字・記号は除き、診断する基本名称部分だけを入力してください。");
      return;
    }

    const r=E.evaluateBusiness(name,state.dict);
    if(!r.ok){
      setMessage("画数辞書に未登録の文字があります："+(r.missing||[]).join("、"));
      return;
    }

    const row=state.diagnosis?.totals?.[String(r.total)];
    if(!row){
      setMessage(`総画は${r.total}画です。現在の診断データは1〜81画までです。`);
      return;
    }

    $("resultName").textContent=name;
    $("charBreakdown").innerHTML=r.rows.map(x=>
      `<span class="pill">${x.char} ${x.strokes}画</span>`
    ).join("");
    $("totalNumber").textContent=`${r.total}画`;
    $("ratingMark").textContent=row.rating;
    $("featureText").textContent=row.text;

    $("resultPanel").classList.remove("hidden");
    $("resultPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }

  $("diagnoseBtn").addEventListener("click",diagnose);
  $("businessName").addEventListener("input",updateNameLength);
  $("businessName").addEventListener("keydown",e=>{
    if(e.key==="Enter" && !$("diagnoseBtn").disabled) diagnose();
  });

  updateNameLength();
  load();
})();
