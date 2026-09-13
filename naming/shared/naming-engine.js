(function(global){
  "use strict";

  const SCORE_TABLE = {
    6:[1,3,5,6,11,13,15,16,21,23,24,31,32,33,35,37,39,41,45,47,48,52,57,61,63,65,67,68,81],
    5:[7,8,17,18,25,29,38],
    4:[30,42,51,53,55,56,58,71,73,75,77,78],
    3:[28,40,43,50,62,72,76,80],
    2:[2,4,12,14,22,26,27,34,36,44,46,49,54,59,60,64,66,69,70,74,79],
    1:[9,10,19,20]
  };
  const STRONG = new Set([21,23,33,39,29]);

  function scoreInfo(n){
    n = Number(n);
    for(const s of [6,5,4,3,2,1]){
      if(SCORE_TABLE[s].includes(n)) return {score:s,strong:STRONG.has(n)};
    }
    return {score:0,strong:STRONG.has(n)};
  }

  function normalizeDictionary(raw){
    const map = new Map();
    if(!raw) return map;
    const rows = Array.isArray(raw)
      ? raw.map(x => [x.kanji || x.char || x.literal, x])
      : Object.entries(raw);

    for(const [ch0,v0] of rows){
      const ch = String(ch0 || "");
      if(!ch) continue;
      let strokes, readings = {}, tags = [];
      if(typeof v0 === "number"){
        strokes = v0;
      }else if(v0 && typeof v0 === "object"){
        strokes = Number(v0.kumazaki_strokes ?? v0.strokes ?? v0.stroke);
        readings = v0.readings || {};
        tags = Array.isArray(v0.tags) ? v0.tags :
               Array.isArray(v0.keywords) ? v0.keywords : [];
      }
      if(!Number.isFinite(Number(strokes))) continue;
      map.set(ch,{
        char:ch,
        strokes:Number(strokes),
        readings:{
          on:Array.isArray(readings.on)?readings.on:[],
          kun:Array.isArray(readings.kun)?readings.kun:[],
          nanori:Array.isArray(readings.nanori)?readings.nanori:[],
          other:Array.isArray(readings.other)?readings.other:[]
        },
        tags
      });
    }
    return map;
  }

  function isCJK(ch){
    const cp = ch.codePointAt(0);
    return (cp>=0x3400 && cp<=0x4DBF) ||
           (cp>=0x4E00 && cp<=0x9FFF) ||
           (cp>=0xF900 && cp<=0xFAFF) ||
           (cp>=0x20000 && cp<=0x2FA1F);
  }

  function allReadings(entry){
    if(!entry) return [];
    const r = entry.readings || {};
    return [...(r.nanori||[]),...(r.kun||[]),...(r.on||[]),...(r.other||[])];
  }

  function readingNorm(s){
    return String(s||"")
      .normalize("NFKC")
      .replace(/[・\.\-‐‑‒–—―ー\s]/g,"")
      .replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0)-0x60))
      .trim();
  }

  function cleanReading(s){
    return String(s||"").replace(/\./g,"").trim();
  }

  function primaryReading(entry){
    if(!entry) return "";
    const r = entry.readings || {};
    return cleanReading((r.nanori&&r.nanori[0]) || (r.kun&&r.kun[0]) || (r.on&&r.on[0]) || (r.other&&r.other[0]) || "");
  }

  function strokesForText(text,dict){
    const chars = Array.from(String(text||"").trim());
    const rows = [];
    for(let i=0;i<chars.length;i++){
      const ch = chars[i];
      if(ch==="々" && i>0){
        const prev = dict.get(chars[i-1]);
        if(!prev) return {ok:false,missing:[chars[i-1]],rows:[]};
        rows.push({char:ch,strokes:prev.strokes});
        continue;
      }
      const e = dict.get(ch);
      if(!e) return {ok:false,missing:[ch],rows:[]};
      rows.push({char:ch,strokes:e.strokes});
    }
    return {ok:true,missing:[],rows};
  }

  function calcPersonalFromStrokes(surnameStrokes,givenStrokes){
    const addReiTop = surnameStrokes.length===1;
    const addReiBottom = givenStrokes.length===1;
    const s1 = surnameStrokes.reduce((a,b)=>a+b,0);
    const s2 = givenStrokes.reduce((a,b)=>a+b,0);
    const ten = s1 + (addReiTop?1:0);
    const chi = s2 + (addReiBottom?1:0);
    const jin = surnameStrokes[surnameStrokes.length-1] + givenStrokes[0];
    const sou = s1+s2;
    const gai = (sou-jin) + (addReiTop?1:0) + (addReiBottom?1:0);
    return {ten,jin,chi,gai,sou,addReiTop,addReiBottom};
  }

  function calcPersonal(surname,given,dict){
    const s = strokesForText(surname,dict);
    const g = strokesForText(given,dict);
    if(!s.ok || !g.ok) return {ok:false,missing:[...(s.missing||[]),...(g.missing||[])]};
    const scores = calcPersonalFromStrokes(s.rows.map(x=>x.strokes),g.rows.map(x=>x.strokes));
    return {ok:true,surnameRows:s.rows,givenRows:g.rows,...scores};
  }

  function getKeisuGroup(n){
    const d = Math.abs(Number(n))%10;
    if(d===1||d===2) return "1_2";
    if(d===3||d===4) return "3_4";
    if(d===5||d===6) return "5_6";
    if(d===7||d===8) return "7_8";
    return "9_10";
  }

  // 旧 diagnosis_triad_free.json 互換用。
  // 新しい名付け本番では sansai.json（125通り）を使用する。
  function pickTriad(triad,category,jinCount,otherCount){
    if(!triad) return null;
    const jinNode = triad["jin_"+getKeisuGroup(jinCount)];
    const catNode = jinNode && jinNode[category];
    return catNode ? (catNode[getKeisuGroup(otherCount)] || null) : null;
  }

  function symbolRank(v){
    const s = String((v&&v.symbol) || "");
    if(!s) return 0;
    if(s.includes("×") || s.includes("要注意") || s.includes("凶")) return -6;
    if(s.includes("◎") || s.includes("大吉")) return 6;
    if(s.includes("○") || s.includes("〇") || s.includes("吉")) return 4;
    if(s.includes("△")) return 1;
    return 0;
  }

  function pickTriadRating(triad,tenCount,jinCount,chiCount){
    if(!triad || !triad.ratings) return null;
    const tenGroup = getKeisuGroup(tenCount);
    const jinGroup = getKeisuGroup(jinCount);
    const chiGroup = getKeisuGroup(chiCount);
    const rating = triad.ratings?.[tenGroup]?.[jinGroup]?.[chiGroup];
    return typeof rating === "string" && rating ? rating : null;
  }

  function triadRatingRank(rating){
    const s = String(rating || "");
    if(s === "◎") return 6;
    if(s === "〇" || s === "○") return 4;
    if(s.includes("要注意")) return -6;
    return 0;
  }

  function triadSummary(scores,triad){
    if(!triad) return {available:false,bad:0,total:0,rating:null,items:[]};

    // 新方式：天格 × 主格 × 地格の125通りを直接参照する。
    if(triad.ratings){
      const tenGroup = getKeisuGroup(scores.ten);
      const jinGroup = getKeisuGroup(scores.jin);
      const chiGroup = getKeisuGroup(scores.chi);
      const rating = pickTriadRating(triad,scores.ten,scores.jin,scores.chi);
      if(!rating){
        return {
          available:false,bad:0,total:0,rating:null,
          key:`${tenGroup}|${jinGroup}|${chiGroup}`,
          items:[]
        };
      }
      const rank = triadRatingRank(rating);
      const bad = rating.includes("要注意") ? 1 : 0;
      return {
        available:true,
        bad,
        total:rank,
        rating,
        key:`${tenGroup}|${jinGroup}|${chiGroup}`,
        items:[["三才",{symbol:rating}]]
      };
    }

    // 旧方式も残しておき、他の画面が直ちに壊れないようにする。
    const items = [
      ["成功",pickTriad(triad,"success",scores.jin,scores.ten)],
      ["基礎",pickTriad(triad,"foundation",scores.jin,scores.chi)],
      ["対人",pickTriad(triad,"relation",scores.jin,scores.gai)],
      ["総合",pickTriad(triad,"total",scores.jin,scores.sou)]
    ];
    let bad=0,total=0;
    for(const [,v] of items){
      const r = symbolRank(v);
      total += r;
      if(r<0) bad++;
    }
    return {available:true,bad,total,rating:null,items};
  }

  function personalPatternScore(scores,triad,opts={}){
    const t = triadSummary(scores,triad);
    const gItems = ["jin","chi","gai","sou"].map(k=>scoreInfo(scores[k]).score);
    let gokaku = gItems.reduce((a,b)=>a+b,0);
    let penalty = 0;
    if(opts.product==="BABY" && opts.sex==="female" && !opts.socialIndependence){
      for(const k of ["jin","chi","sou"]){
        if(STRONG.has(scores[k])) penalty += 1;
      }
    }
    gokaku -= penalty;
    return {
      triadBad:t.available?t.bad:0,
      triadTotal:t.available?t.total:0,
      gokaku,
      minGokaku:Math.min(...gItems),
      triad:t
    };
  }

  function passesPersonalPattern(scores,triad,opts={}){
    const ratings = {
      jin: scoreInfo(scores.jin).score,
      chi: scoreInfo(scores.chi).score,
      gai: scoreInfo(scores.gai).score,
      sou: scoreInfo(scores.sou).score
    };
    const reasons = [];

    if(ratings.sou <= 2) reasons.push("総格が★1〜2");
    if(ratings.jin <= 2) reasons.push("主格が★1〜2");
    if(ratings.chi <= 2) reasons.push("地格が★1〜2");
    if(ratings.gai <= 2) reasons.push("外格が★1〜2");

    // 地格31以上は、実用上のバランスを考えて候補から除外する。
    if(Number(scores.chi) >= 31) reasons.push("地格が31以上");

    const t = triadSummary(scores,triad);
    if(t.available && t.bad > 0) reasons.push("三才に要注意判定あり");

    return {ok:reasons.length===0,ratings,reasons,triad:t};
  }

  function uniqueStrokeValues(dict,max=40){
    return [...new Set([...dict.values()]
      .filter(e=>isCJK(e.char) && e.strokes>0 && e.strokes<=max && allReadings(e).length)
      .map(e=>e.strokes))].sort((a,b)=>a-b);
  }

  function generatePersonalPatterns(surname,dict,triad,nameLength,opts={}){
    const s = strokesForText(surname,dict);
    if(!s.ok) return {ok:false,missing:s.missing,patterns:[]};

    const sStrokes = s.rows.map(x=>x.strokes);
    const values = uniqueStrokeValues(dict,40);
    const patterns = [];
    const cur = [];
    const filterStats = {
      examined:0,accepted:0,rejectedTotal:0,rejectedJin:0,
      rejectedChi:0,rejectedGai:0,rejectedChi31:0,rejectedTriad:0
    };

    function rec(pos){
      if(pos===nameLength){
        filterStats.examined++;
        const scores = calcPersonalFromStrokes(sStrokes,cur);
        const gate = passesPersonalPattern(scores,triad,opts);

        if(!gate.ok){
          if(gate.reasons.includes("総格が★1〜2")) filterStats.rejectedTotal++;
          if(gate.reasons.includes("主格が★1〜2")) filterStats.rejectedJin++;
          if(gate.reasons.includes("地格が★1〜2")) filterStats.rejectedChi++;
          if(gate.reasons.includes("外格が★1〜2")) filterStats.rejectedGai++;
          if(gate.reasons.includes("地格が31以上")) filterStats.rejectedChi31++;
          if(gate.reasons.includes("三才に要注意判定あり")) filterStats.rejectedTriad++;
          return;
        }

        const r = personalPatternScore(scores,triad,opts);
        patterns.push({strokes:[...cur],scores,...r,ratings:gate.ratings});
        filterStats.accepted++;
        return;
      }
      for(const n of values){
        cur.push(n); rec(pos+1); cur.pop();
      }
    }
    rec(0);

    patterns.sort((a,b)=>{
      if(a.triad.available || b.triad.available){
        if(a.triadBad!==b.triadBad) return a.triadBad-b.triadBad;
        if(a.triadTotal!==b.triadTotal) return b.triadTotal-a.triadTotal;
      }
      if(a.ratings.sou!==b.ratings.sou) return b.ratings.sou-a.ratings.sou;
      if(a.ratings.jin!==b.ratings.jin) return b.ratings.jin-a.ratings.jin;
      if(a.ratings.chi!==b.ratings.chi) return b.ratings.chi-a.ratings.chi;
      if(a.minGokaku!==b.minGokaku) return b.minGokaku-a.minGokaku;
      if(a.gokaku!==b.gokaku) return b.gokaku-a.gokaku;
      return a.strokes.reduce((x,y)=>x+y,0)-b.strokes.reduce((x,y)=>x+y,0);
    });

    return {
      ok:true,
      patterns:patterns.slice(0,18),
      surnameRows:s.rows,
      filterStats
    };
  }

  function personalNanoriVariants(entry){
    const n = entry?.readings && Array.isArray(entry.readings.nanori)
      ? entry.readings.nanori : [];
    return [...new Set(
      n.map(cleanReading)
       .filter(Boolean)
       .filter(v=>!String(v).includes("."))
       .filter(v=>{
         const len=Array.from(readingNorm(v)).length;
         return len>=1 && len<=4;
       })
    )];
  }

  function charsByStroke(dict,stroke,limit=60,opts={}){
    const out=[...dict.values()].filter(e=>{
      if(e.strokes!==stroke || !isCJK(e.char)) return false;
      if(opts.personal) return personalNanoriVariants(e).length>0;
      return allReadings(e).length>0;
    });

    out.sort((a,b)=>{
      const an=personalNanoriVariants(a).length, bn=personalNanoriVariants(b).length;
      if(an!==bn) return bn-an;
      const ar=allReadings(a).length, br=allReadings(b).length;
      if(ar!==br) return br-ar;
      return a.char.localeCompare(b.char,"ja");
    });
    return out.slice(0,limit);
  }

  function readingVariants(e,opts={}){
    if(opts.personal) return personalNanoriVariants(e);
    return [...new Set(allReadings(e).map(cleanReading).filter(Boolean))];
  }

  function tagBonus(entries,wishes){
    if(!wishes || !wishes.length) return 0;
    const wanted=new Set(wishes);
    let n=0;
    for(const e of entries){
      for(const t of (e.tags||[])) if(wanted.has(t)) n++;
    }
    return n;
  }

  function naturalReadingScore(norm,nameLength,product){
    const len=Array.from(norm).length;
    if(!len) return -999;

    let min=1,max=7,target=4;
    if(nameLength===1){min=1;max=4;target=3;}
    if(nameLength===2){min=2;max=5;target=4;}
    if(nameLength===3){min=3;max=6;target=5;}
    if(product==="GUARDIAN") max+=1;

    if(len<min || len>max) return -999;
    return 12-Math.abs(len-target)*2;
  }

  function bestReadingForEntries(entries,target,nameLength,product,personal){
    const readingLists = entries.map(e=>readingVariants(e,{personal}));
    if(readingLists.some(x=>!x.length)) return null;

    let best = null;
    const chosen = [];

    function rec(pos,prefix){
      if(pos===readingLists.length){
        if(target && prefix!==target) return;

        const natural = personal
          ? naturalReadingScore(prefix,nameLength,product)
          : 0;

        if(personal && natural<0) return;

        const display = chosen.join("");
        const score = natural;

        if(!best || score>best.score ||
           (score===best.score && display.localeCompare(best.display,"ja")<0)){
          best = {display,norm:prefix,score};
        }
        return;
      }

      for(const rv of readingLists[pos]){
        const nr = readingNorm(rv);
        if(!nr) continue;

        const next = prefix + nr;

        if(target){
          if(!target.startsWith(next)) continue;
        }else if(personal){
          const hardMax = nameLength===1 ? 4 : (nameLength===2 ? 5 : 6);
          const extra = product==="GUARDIAN" ? 1 : 0;
          if(Array.from(next).length > hardMax + extra) continue;
        }

        chosen.push(cleanReading(rv));
        rec(pos+1,next);
        chosen.pop();
      }
    }

    rec(0,"");
    return best;
  }

  function diversifyByFirstChar(rows,limit){
    if(rows.length<=limit) return rows.slice(0,limit);

    const selected = [];
    const used = new Set();
    const firstCount = new Map();

    // 第1巡: 同じ先頭漢字は最大2件までにして多様性を確保
    for(const row of rows){
      if(selected.length>=limit) break;
      const first = Array.from(row.text)[0] || "";
      const count = firstCount.get(first) || 0;
      if(count>=2) continue;

      selected.push(row);
      used.add(row.text);
      firstCount.set(first,count+1);
    }

    // 足りなければ順位順に残りを補充
    if(selected.length<limit){
      for(const row of rows){
        if(selected.length>=limit) break;
        if(used.has(row.text)) continue;
        selected.push(row);
        used.add(row.text);
      }
    }

    return selected;
  }

  function buildCandidatesForPattern(pattern,dict,desiredReading="",wishes=[],limit=18,opts={}){
    const personal = !!opts.personal;
    const nameLength = opts.nameLength || pattern.strokes.length;
    const product = opts.product || "";

    const lists = pattern.strokes.map(s=>
      charsByStroke(dict,s,personal ? 90 : (desiredReading ? 90 : 24),{personal})
    );

    if(lists.some(x=>!x.length)) return [];

    const target = readingNorm(desiredReading);
    const uniqueByText = new Map();
    const chosenEntries = [];

    // 文字組合せを先に作り、その1つにつき最も自然な読みを1つだけ選ぶ。
    function recChars(pos){
      if(pos===lists.length){
        const text = chosenEntries.map(e=>e.char).join("");
        if(uniqueByText.has(text)) return;

        const bestReading = bestReadingForEntries(
          chosenEntries,
          target,
          nameLength,
          product,
          personal
        );
        if(!bestReading) return;

        const row = {
          text,
          reading:bestReading.display,
          entries:[...chosenEntries],
          tagBonus:tagBonus(chosenEntries,wishes),
          naturalScore:bestReading.score,
          nanoriCount:chosenEntries.reduce(
            (n,e)=>n+personalNanoriVariants(e).length,0
          )
        };

        uniqueByText.set(text,row);
        return;
      }

      for(const e of lists[pos]){
        if(chosenEntries.some(x=>x.char===e.char)) continue;
        chosenEntries.push(e);
        recChars(pos+1);
        chosenEntries.pop();

        // 3文字以上では組合せ爆発を避けるため十分な候補が集まったら抑制
        if(nameLength>=3 && uniqueByText.size>=500) return;
      }
    }

    recChars(0);

    const rows = [...uniqueByText.values()];

    rows.sort((a,b)=>
      b.tagBonus-a.tagBonus ||
      b.naturalScore-a.naturalScore ||
      b.nanoriCount-a.nanoriCount ||
      a.reading.localeCompare(b.reading,"ja") ||
      a.text.localeCompare(b.text,"ja")
    );

    // 同じ表記は既に1件だけ。さらに先頭漢字が偏りすぎないように選ぶ。
    return personal
      ? diversifyByFirstChar(rows,limit)
      : rows.slice(0,limit);
  }

  function favorableTotals(){
    const rows=[];
    for(const s of [6,5,4,3,2,1]){
      for(const n of SCORE_TABLE[s]) rows.push({total:n,score:s});
    }
    return rows.sort((a,b)=>b.score-a.score || a.total-b.total);
  }

  function generateBusinessPatterns(dict,nameLength){
    const values = uniqueStrokeValues(dict,40);
    const available = new Set(values);
    const results=[];
    const seen=new Set();
    for(const target of favorableTotals()){
      if(target.total>120) continue;
      const cur=[];
      function rec(pos,sum){
        if(results.length>=30) return;
        if(pos===nameLength){
          if(sum===target.total){
            const key=cur.join("-");
            if(!seen.has(key)){
              seen.add(key);
              results.push({strokes:[...cur],total:sum,score:target.score});
            }
          }
          return;
        }
        for(const n of values){
          const next=sum+n;
          if(next>target.total) break;
          cur.push(n);rec(pos+1,next);cur.pop();
          if(results.length>=30) return;
        }
      }
      rec(0,0);
      if(results.length>=18) break;
    }
    results.sort((a,b)=>b.score-a.score || a.total-b.total);
    return results.slice(0,18);
  }

  function evaluateBusiness(text,dict){
    const r = strokesForText(text,dict);
    if(!r.ok) return {ok:false,missing:r.missing};
    const total = r.rows.reduce((a,b)=>a+b.strokes,0);
    return {ok:true,rows:r.rows,total,...scoreInfo(total)};
  }

  const API = {
    SCORE_TABLE,STRONG,scoreInfo,normalizeDictionary,isCJK,allReadings,primaryReading,
    readingNorm,strokesForText,calcPersonalFromStrokes,calcPersonal,getKeisuGroup,pickTriad,
    pickTriadRating,triadSummary,personalPatternScore,passesPersonalPattern,generatePersonalPatterns,
    personalNanoriVariants,charsByStroke,bestReadingForEntries,
    diversifyByFirstChar,buildCandidatesForPattern,
    generateBusinessPatterns,evaluateBusiness
  };

  global.NamingEngine = API;
  if(typeof module!=="undefined" && module.exports) module.exports=API;
})(typeof window!=="undefined"?window:globalThis);
