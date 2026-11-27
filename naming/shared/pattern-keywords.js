(function(global){
  "use strict";
  // 表示専用。画数計算・吉凶・候補順位には使用しない。
  const fields=[["天格","ten"],["主格","jin"],["地格","chi"],["外格","gai"],["総画","sou"]];
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  async function load(){
    try{
      const res=await fetch("../data/naming-number-keywords.json",{cache:"no-store"});
      if(!res.ok) throw new Error("HTTP "+res.status);
      const data=await res.json();
      if(!data?.numbers || !data?.ten_by_jin) throw new Error("数意データ形式エラー");
      return data;
    }catch(err){
      console.warn("画数の数意データを取得できません",err);
      return null;
    }
  }
  function render(scores,data,starHTML){
    const group=global.NamingEngine.getKeisuGroup;
    return `<div class="naming-pattern-meanings">${fields.map(([label,key])=>{
      const count=scores[key];
      const value=key==="ten"
        ? data?.ten_by_jin?.[group(scores.jin)]?.[group(scores.ten)]?.keywords
        : data?.numbers?.[String(count)]?.[key];
      const text=typeof value==="string" && value.trim() ? value : (data?"数意未収録":"数意データ未取得");
      return `<div class="naming-pattern-meaning-row"><strong class="naming-pattern-meaning-label">${label} ${esc(count)}画</strong><div class="naming-pattern-meaning-detail">${key==="ten"?"":`<div class="naming-pattern-meaning-stars">${starHTML(count)}</div>`}<div class="naming-pattern-meaning-text">${esc(text)}</div></div></div>`;
    }).join("")}</div>`;
  }
  global.NamingPatternKeywords={load,render};
})(window);
