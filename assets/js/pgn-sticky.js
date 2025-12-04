(function(){ "use strict";

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS & REGEXES (identical to pgn.js)
////////////////////////////////////////////////////////////////////////////////
const PIECE_THEME_URL="https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
SAN_CORE_REGEX=/^([O0]-[O0](-[O0])?[+#]?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?|[a-h][1-8](=[QRBN])?[+#]?)$/,
RESULT_REGEX=/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/,
MOVE_NUMBER_REGEX=/^(\d+)(\.+)$/,
NBSP="\u00A0",
NAG_MAP={1:"!",2:"?",3:"‼",4:"⁇",5:"⁉",6:"⁈",13:"→",14:"↑",15:"⇆",16:"⇄",17:"⟂",18:"∞",19:"⟳",20:"⟲",36:"⩲",37:"⩱",38:"±",39:"∓",40:"+=",41:"=+",42:"±",43:"∓",44:"⨀",45:"⨁"};

// Evaluation symbol mapping (same as pgn.js)
const EVAL_MAP={
  "=":"=",
  "+/=":"⩲",
  "=/+":"⩱",
  "+/-":"±",
  "+/−":"±",
  "-/+":"∓",
  "−/+":"∓",
  "+-":"+−",
  "+−":"+−",
  "-+":"−+",
  "−+":"−+",
  "∞":"∞",
  "=/∞":"⯹"
};

////////////////////////////////////////////////////////////////////////////////
// HELPERS (identical to pgn.js)
////////////////////////////////////////////////////////////////////////////////
function ensureDeps(){
  if(typeof Chess==="undefined"){
    console.warn("pgn-sticky.js: chess.js missing");
    return false;
  }
  return true;
}
function normalizeResult(r){ return r?r.replace(/1\/2-1\/2/g,"½-½"):"";}
function extractYear(d){ if(!d) return ""; let p=d.split("."); return /^\d{4}$/.test(p[0])?p[0]:"";}
function flipName(n){ if(!n) return ""; let i=n.indexOf(","); return i===-1?n.trim():n.slice(i+1).trim()+" "+n.slice(0,i).trim();}
function appendText(el,txt){ if(txt) el.appendChild(document.createTextNode(txt));}
function makeCastlingUnbreakable(s){
  return s.replace(/0-0-0|O-O-O/g,m=>m[0]+"\u2011"+m[2]+"\u2011"+m[4])
          .replace(/0-0|O-O/g,m=>m[0]+"\u2011"+m[2]);
}

////////////////////////////////////////////////////////////////////////////////
// PGN STICKY VIEW  — SAME PARSER AS pgn.js
// except:
//   - NO [D] diagrams
//   - ONE sticky board before moves
//   - moves become .sticky-move
////////////////////////////////////////////////////////////////////////////////

class PGNStickyView{

  constructor(src){
    this.sourceEl=src;
    this.wrapper=document.createElement("div");
    this.wrapper.className="pgn-sticky-block";
    this.finalResultPrinted=false;
    this.build();
    this.applyFigurines();
  }

  // identical to pgn.js
  static isSANCore(t){ return SAN_CORE_REGEX.test(t); }

  // identical to pgn.js
  static split(t){
    let lines=t.split(/\r?\n/),H=[],M=[],inH=true;
    for(let L of lines){
      let T=L.trim();
      if(inH && T.startsWith("[")&&T.endsWith("]")) H.push(L);
      else if(inH && T==="") inH=false;
      else{ inH=false; M.push(L); }
    }
    return {headers:H,moveText:M.join(" ").replace(/\s+/g," ").trim()};
  }

  build(){
    let raw=this.sourceEl.textContent.trim(),
        {headers:H,moveText:M}=PGNStickyView.split(raw),
        pgn=(H.length?H.join("\n")+"\n\n":"")+M,
        chess=new Chess();

    chess.load_pgn(pgn,{sloppy:true});
    let head=chess.header(),
        res=normalizeResult(head.Result||""),
        needs=/ (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(M),
        movetext=needs?M:M+(res?" "+res:"");

    // HEADER (exact same format as pgn.js)
    this.header(head);

    // SINGLE sticky playable board under header
    this.createStickyBoard();

    // parse moves/comments/variations using pgn.js engine
    this.parse(movetext);

    this.sourceEl.replaceWith(this.wrapper);
  }

  header(h){
    let W=(h.WhiteTitle?h.WhiteTitle+" ":"")+flipName(h.White||"")+(h.WhiteElo?" ("+h.WhiteElo+")":""),
        B=(h.BlackTitle?h.BlackTitle+" ":"")+flipName(h.Black||"")+(h.BlackElo?" ("+h.BlackElo+")":""),
        Y=extractYear(h.Date),
        line=(h.Event||"")+(Y?", "+Y:""),
        H=document.createElement("h4");

    H.appendChild(document.createTextNode(W+" – "+B));
    H.appendChild(document.createElement("br"));
    H.appendChild(document.createTextNode(line));
    this.wrapper.appendChild(H);
  }

  createStickyBoard(){
    if(typeof Chessboard==="undefined"){
      console.warn("pgn-sticky.js: chessboard.js missing");
      return;
    }
    let d=document.createElement("div");
    d.id="pgn-sticky-board";
    d.className="pgn-sticky-diagram";
    this.wrapper.appendChild(d);

    setTimeout(()=>{ 
      StickyBoard.board=Chessboard(d,{
        position:"start",
        draggable:false,
        pieceTheme:PIECE_THEME_URL,
        moveSpeed:200,
        snapSpeed:20,
        snapbackSpeed:20,
        appearSpeed:150
      });
    },0);
  }

  ensure(ctx,cls){
    if(!ctx.container){
      let p=document.createElement("p");
      p.className=cls;
      this.wrapper.appendChild(p);
      ctx.container=p;
    }
  }

  ////////////////////////////////////////////////////////////////////////////
  // handleSAN — identical to pgn.js except span includes .sticky-move
  ////////////////////////////////////////////////////////////////////////////
  handleSAN(tok,ctx){
    let core=tok.replace(/[^a-hKQRBN0-9=O0-]+$/g,"").replace(/0/g,"O");

    if(!PGNStickyView.isSANCore(core)){
      appendText(ctx.container,tok+" ");
      return null;
    }

    let base=ctx.baseHistoryLen||0,
        count=ctx.chess.history().length,
        ply=base+count,
        white=ply%2===0,
        num=Math.floor(ply/2)+1;

    if(ctx.type==="main"){
      if(white) appendText(ctx.container,num+"."+NBSP);
      else if(ctx.lastWasInterrupt) appendText(ctx.container,num+"..."+NBSP);
    } else{
      if(white) appendText(ctx.container,num+"."+NBSP);
      else if(ctx.lastWasInterrupt) appendText(ctx.container,num+"..."+NBSP);
    }

    ctx.prevFen=ctx.chess.fen();
    ctx.prevHistoryLen=ply;

    let mv=ctx.chess.move(core,{sloppy:true});
    if(!mv){
      appendText(ctx.container,tok+" ");
      return null;
    }

    ctx.lastWasInterrupt=false;

    let span=document.createElement("span");
    span.className="pgn-move sticky-move";   // <— difference from pgn.js
    span.dataset.fen=ctx.chess.fen();
    span.textContent=makeCastlingUnbreakable(tok)+" ";
    ctx.container.appendChild(span);
    return span;
  }

  ////////////////////////////////////////////////////////////////////////////
  // parseComment — identical to pgn.js except NO [D] diagrams
  ////////////////////////////////////////////////////////////////////////////
  parseComment(text,i,ctx){
    let j=i;
    while(j<text.length && text[j]!=="}") j++;
    let raw=text.substring(i,j).trim();
    if(text[j]==="}") j++;

    raw=raw.replace(/\[%.*?]/g,"").trim();
    if(!raw.length) return j;

    // sticky PGN DIFFERENCE: remove [D], no diagrams
    raw=raw.replace(/\[D]/g,"").trim();

    if(ctx.type==="main"){
      let k=j;
      while(k<text.length && /\s/.test(text[k])) k++;
      let next="";
      while(k<text.length && !/\s/.test(text[k]) && !"(){}".includes(text[k])) next+=text[k++];
      if(RESULT_REGEX.test(next)){
        raw=raw.replace(/(1-0|0-1|1\/2-1\/2|½-½|\*)$/,"").trim();
      }
    }

    if(ctx.type==="variation"){
      this.ensure(ctx,"pgn-variation");
      if(raw) appendText(ctx.container," "+raw);
    } else{
      if(raw){
        let p=document.createElement("p");
        p.className="pgn-comment";
        appendText(p,raw);
        this.wrapper.appendChild(p);
      }
      ctx.container=null;
    }

    ctx.lastWasInterrupt=true;
    return j;
  }

  ////////////////////////////////////////////////////////////////////////////
  // parse — EXACT pgn.js algorithm, except [D] does nothing
  ////////////////////////////////////////////////////////////////////////////
  parse(t){
    let chess=new Chess(),
        ctx={
          type:"main",
          chess,chess,
          container:null,
          parent:null,
          lastWasInterrupt:false,
          prevFen:chess.fen(),
          prevHistoryLen:0,
          baseHistoryLen:null
        },
        i=0;

    for(;i<t.length;){
      let ch=t[i];

      // whitespace
      if(/\s/.test(ch)){
        while(i<t.length && /\s/.test(t[i])) i++;
        this.ensure(ctx,ctx.type==="main"?"pgn-mainline":"pgn-variation");
        appendText(ctx.container," ");
        continue;
      }

      // variation start
      if(ch==="("){
        i++;
        let fen=ctx.prevFen||ctx.chess.fen(),
            len=(typeof ctx.prevHistoryLen==="number"?ctx.prevHistoryLen:ctx.chess.history().length);
        ctx={
          type:"variation",
          chess:new Chess(fen),
          container:null,
          parent:ctx,
          lastWasInterrupt:true,
          prevFen:fen,
          prevHistoryLen:len,
          baseHistoryLen:len
        };
        this.ensure(ctx,"pgn-variation");
        continue;
      }

      // variation end
      if(ch===")"){
        i++;
        if(ctx.parent){
          ctx=ctx.parent;
          ctx.lastWasInterrupt=true;
          ctx.container=null;
        }
        continue;
      }

      // comment
      if(ch==="{"){
        i=this.parseComment(t,i+1,ctx);
        continue;
      }

      // token
      let s=i;
      while(i<t.length && !/\s/.test(t[i]) && !"(){}".includes(t[i])) i++;
      let tok=t.substring(s,i);
      if(!tok) continue;

      if(/^\[%.*]$/.test(tok)) continue;

      // sticky PGN difference: [D] ignored
      if(tok==="[D]"){
        ctx.lastWasInterrupt=true;
        ctx.container=null;
        continue;
      }

      if(RESULT_REGEX.test(tok)){
        if(this.finalResultPrinted) continue;
        this.finalResultPrinted=true;
        this.ensure(ctx,ctx.type==="main"?"pgn-mainline":"pgn-variation");
        appendText(ctx.container,tok+" ");
        continue;
      }

      if(MOVE_NUMBER_REGEX.test(tok)) continue;

      // token may be SAN
      let core=tok.replace(/[^a-hKQRBN0-9=O0-]+$/g,"").replace(/0/g,"O"),
          isSAN=PGNStickyView.isSANCore(core);

      if(!isSAN){

        // EVAL MAP
        if(EVAL_MAP[tok]){
          this.ensure(ctx,ctx.type==="main"?"pgn-mainline":"pgn-variation");
          appendText(ctx.container,EVAL_MAP[tok]+" ");
          continue;
        }

        // NAG MAP
        if(tok[0]==="$"){
          let code=+tok.slice(1);
          if(NAG_MAP[code]){
            this.ensure(ctx,ctx.type==="main"?"pgn-mainline":"pgn-variation");
            appendText(ctx.container,NAG_MAP[code]+" ");
          }
          continue;
        }

        // word-like commentary
        if(/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tok)){
          if(ctx.type==="variation"){
            this.ensure(ctx,"pgn-variation");
            appendText(ctx.container," "+tok);
          } else{
            let p=document.createElement("p");
            p.className="pgn-comment";
            appendText(p,tok);
            this.wrapper.appendChild(p);
            ctx.container=null;
            ctx.lastWasInterrupt=false;
          }
        }else{
          this.ensure(ctx,ctx.type==="main"?"pgn-mainline":"pgn-variation");
          appendText(ctx.container,tok+" ");
        }
        continue;
      }

      // SAN move
      this.ensure(ctx,ctx.type==="main"?"pgn-mainline":"pgn-variation");
      let m=this.handleSAN(tok,ctx);
      if(!m) appendText(ctx.container,makeCastlingUnbreakable(tok)+" ");
    }
  }

  ////////////////////////////////////////////////////////////////////////////
  // Figurines — identical to pgn.js
  ////////////////////////////////////////////////////////////////////////////
  applyFigurines(){
    const map={K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘"};
    this.wrapper.querySelectorAll(".pgn-move").forEach(span=>{
      let m=span.textContent.match(/^([KQRBN])(.+?)(\s*)$/);
      if(m) span.textContent=map[m[1]]+m[2]+(m[3]||"");
    });
  }
}

////////////////////////////////////////////////////////////////////////////////
// StickyBoard (board created by PGNStickyView)
////////////////////////////////////////////////////////////////////////////////

const StickyBoard={
  board:null,
  moveSpans:[],
  currentIndex:-1,

  initBoard(){},

  collectMoves(root){
    this.moveSpans=Array.from(
      (root||document).querySelectorAll(".sticky-move")
    );
  },

  goto(i){
    if(i<0||i>=this.moveSpans.length) return;
    this.currentIndex=i;
    let span=this.moveSpans[i],
        fen=span.dataset.fen;
    if(!fen||!this.board) return;

    this.board.position(fen,true);

    this.moveSpans.forEach(s=>s.classList.remove("sticky-move-active"));
    span.classList.add("sticky-move-active");
    span.scrollIntoView({behavior:"smooth",block:"center"});
  },

  next(){ this.goto(this.currentIndex+1); },
  prev(){ this.goto(this.currentIndex-1); },

  activate(root){
    this.collectMoves(root);
    this.moveSpans.forEach((span,i)=>{
      span.addEventListener("click",()=>this.goto(i));
    });
    window.addEventListener("keydown",e=>{
      let tag=(e.target.tagName||"").toLowerCase();
      if(tag==="input"||tag==="textarea") return;
      if(e.key==="ArrowRight"){ e.preventDefault(); this.next(); }
      if(e.key==="ArrowLeft"){ e.preventDefault(); this.prev(); }
    });
  }
};

////////////////////////////////////////////////////////////////////////////////
// CSS
////////////////////////////////////////////////////////////////////////////////
const style=document.createElement("style");
style.textContent=`
.pgn-sticky-block{
  position:relative;
  margin-bottom:2rem;
}

.pgn-sticky-diagram{
  position:sticky;
  top:1rem;
  width:320px;
  max-width:100%;
  margin:1rem 0;
  z-index:40;
}

.pgn-mainline,
.pgn-variation{
  line-height:1.7;
  font-size:1rem;
}

.pgn-variation{
  margin-left:1.5rem;
  padding-left:0.5rem;
  border-left:2px solid #ddd;
  margin-top:0.5rem;
}

.pgn-comment{
  font-style:italic;
  margin:0.3rem 0;
}

.sticky-move{
  cursor:pointer;
}

.sticky-move-active{
  background:#ffe38a;
  border-radius:4px;
  padding:2px 4px;
}
`;
document.head.appendChild(style);

////////////////////////////////////////////////////////////////////////////////
// INIT — only run if <pgn-sticky> exists
////////////////////////////////////////////////////////////////////////////////
function initSticky(){
  if(!ensureDeps()) return;
  let els=document.querySelectorAll("pgn-sticky");
  if(!els.length) return;
  els.forEach(el=>new PGNStickyView(el));
  StickyBoard.activate(document);
}

document.readyState==="loading"
  ?document.addEventListener("DOMContentLoaded",initSticky)
  :initSticky();

})();
