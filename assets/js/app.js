document.addEventListener("DOMContentLoaded", () => {

  /* ======================================================
   * DOM REFERENCES
   * ====================================================== */

  const movesDiv = document.getElementById("moves");
  const promo = document.getElementById("promo");

  const btnStart = document.getElementById("btnStart");
  const btnEnd   = document.getElementById("btnEnd");
  const btnPrev  = document.getElementById("btnPrev");
  const btnNext  = document.getElementById("btnNext");
  const btnFlip  = document.getElementById("btnFlip");

  const widgetContainer = document.querySelector(".placeholder-controls");


  /* ======================================================
   * SAN / FIGURINES
   * ====================================================== */

  const FIG = { K:"♔", Q:"♕", R:"♖", B:"♗", N:"♘" };
  const figSAN = s =>
    s.replace(/^[KQRBN]/, p => FIG[p] || p)
     .replace(/=([QRBN])/, (_, p) => "=" + FIG[p]);


  /* ======================================================
   * TREE MODEL
   * ====================================================== */

  let ID = 1;
  class Node {
    constructor(san, parent, fen) {
      this.id = "n" + ID++;
      this.san = san;
      this.parent = parent;
      this.fen = fen;
      this.next = null;
      this.vars = [];
      this.comment = "";
    }
  }


  /* ======================================================
   * CHESS STATE
   * ====================================================== */

  const chess = new Chess();
  const START_FEN = chess.fen();

  const root = new Node(null, null, START_FEN);
  let cursor = root;

  let pendingPromotion = null;
  let boardOrientation = localStorage.getItem("boardOrientation") || "white";


  /* ======================================================
   * BOARD
   * ====================================================== */

  const board = Chessboard("board", {
    position: "start",
    draggable: true,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
    onDrop
  });

  board.orientation(boardOrientation);

  function rebuildTo(node, animate) {
    chess.load(node?.fen || START_FEN);
    board.position(chess.fen(), !!animate);
  }


  /* ======================================================
   * MOVE INPUT + PROMOTION
   * ====================================================== */

  function onDrop(from, to) {
    const t = new Chess(chess.fen());
    const p = t.get(from);

    if (p?.type === "p" && (to[1] === "8" || to[1] === "1")) {
      pendingPromotion = { from, to };
      promo.style.display = "flex";
      return;
    }

    const m = t.move({ from, to, promotion: "q" });
    if (!m) return "snapback";
    applyMove(m.san, t.fen());
  }

  promo.onclick = e => {
    if (!e.target.dataset.p) return;
    promo.style.display = "none";

    const t = new Chess(chess.fen());
    const m = t.move({ ...pendingPromotion, promotion: e.target.dataset.p });
    pendingPromotion = null;

    if (m) applyMove(m.san, t.fen());
  };


  /* ======================================================
   * INSERTION (MAINLINE vs VARIATION)
   * ====================================================== */

  function applyMove(san, fen) {
    if (cursor.next && cursor.next.san === san) {
      cursor = cursor.next;
      rebuildTo(cursor, false);
      render();
      return;
    }

    const n = new Node(san, cursor, fen);
    if (!cursor.next) cursor.next = n;
    else cursor.vars.push(n);

    cursor = n;
    rebuildTo(n, false);
    render();
  }


  /* ======================================================
   * RENDERING (PGN + COMMENTS)
   * ====================================================== */

  function render() {
    movesDiv.innerHTML = "";
    renderMainline();
  }

  function renderMainline() {
    let m = 1;
    let w = root.next;
    let bPrev = null;

    while (w) {
      let printedWhiteVar = false;

      movesDiv.appendChild(text(m + ".\u00A0"));
      appendMove(movesDiv, w);
      appendComment(movesDiv, w);
      movesDiv.appendChild(text(" "));

      if (bPrev && bPrev.vars.length) {
        for (const v of bPrev.vars) {
          renderVarBlock(movesDiv, v, m, "w");
          printedWhiteVar = true;
        }
      }

      const b = w.next;
      if (!b) return;

      if (printedWhiteVar) {
        movesDiv.appendChild(text(m + "...\u00A0"));
      }

      appendMove(movesDiv, b);
      appendComment(movesDiv, b);
      movesDiv.appendChild(text(" "));

      if (w.vars.length) {
        for (const v of w.vars) {
          renderVarBlock(movesDiv, v, m, "b");
        }
      }

      bPrev = b;
      w = b.next;
      m++;
    }
  }

  function renderVarBlock(container, node, moveNo, side) {
    const span = document.createElement("span");
    span.className = "variation";
    span.appendChild(text("(" + moveNo + (side === "w" ? ".\u00A0" : "...\u00A0")));
    renderLine(span, node, moveNo, side, true);
    trim(span);
    span.appendChild(text(") "));
    container.appendChild(span);
  }

  function renderLine(container, node, moveNo, side, skipPrefix) {
    let cur = node, m = moveNo, s = side, first = true;

    while (cur) {
      if (s === "w" && !(first && skipPrefix)) {
        container.appendChild(text(m + ".\u00A0"));
      }

      appendMove(container, cur);
      appendComment(container, cur);
      container.appendChild(text(" "));

      if (s === "b") m++;
      s = s === "w" ? "b" : "w";
      first = false;
      cur = cur.next;
    }
  }

  function appendMove(container, node) {
    const span = document.createElement("span");
    span.className = "move" + (node === cursor ? " active" : "");
    span.textContent = figSAN(node.san);
    span.onclick = () => {
      cursor = node;
      rebuildTo(node, true);
      render();
      updateWidgetState();
    };
    container.appendChild(span);
  }

  function appendComment(container, node) {
    if (!node.comment) return;
    const c = document.createElement("span");
    c.className = "comment";
    c.textContent = `{ ${node.comment} }`;
    container.appendChild(c);
  }

  function trim(el) {
    const t = el.lastChild;
    if (t?.nodeType === 3) {
      t.nodeValue = t.nodeValue.replace(/\s+$/, "");
      if (!t.nodeValue) el.removeChild(t);
    }
  }

  function text(t) {
    return document.createTextNode(t);
  }


  /* ======================================================
   * NAVIGATION + KEYBOARD
   * ====================================================== */

  function goStart() { cursor = root; rebuildTo(root,true); render(); updateWidgetState(); }
  function goEnd()   { let n=root; while(n.next) n=n.next; cursor=n; rebuildTo(n,true); render(); updateWidgetState(); }
  function goPrev()  { if(cursor.parent){ cursor=cursor.parent; rebuildTo(cursor,true); render(); updateWidgetState(); } }
  function goNext()  { if(cursor.next){ cursor=cursor.next; rebuildTo(cursor,true); render(); updateWidgetState(); } }

  btnStart.onclick = goStart;
  btnEnd.onclick   = goEnd;
  btnPrev.onclick  = goPrev;
  btnNext.onclick  = goNext;

  document.addEventListener("keydown", e => {
    if (["INPUT","TEXTAREA"].includes(e.target.tagName)) return;
    if (e.key==="ArrowLeft")  goPrev();
    if (e.key==="ArrowRight") goNext();
    if (e.key==="ArrowUp")    goStart();
    if (e.key==="ArrowDown")  goEnd();
  });


  /* ======================================================
   * ORIENTATION
   * ====================================================== */

  btnFlip.onclick = () => {
    boardOrientation = boardOrientation === "white" ? "black" : "white";
    board.orientation(boardOrientation);
    localStorage.setItem("boardOrientation", boardOrientation);
  };


  /* ======================================================
   * ================= WIDGET BUTTONS =====================
   * ====================================================== */

  if (widgetContainer) {

    widgetContainer.textContent = "";

    function makeBtn(icon, title) {
      const wrap = document.createElement("span");
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";

      const b = document.createElement("button");
      b.textContent = icon;
      b.title = title;

      const check = document.createElement("span");
      check.textContent = "✓";
      check.style.cssText = `
        color:#3ddc84;
        margin-left:6px;
        opacity:0;
        transform:scale(.8);
        transition:opacity .25s, transform .25s;
      `;

      wrap.append(b, check);
      return { wrap, b, check };
    }

    function showCheck(c) {
      c.style.opacity = "1";
      c.style.transform = "scale(1)";
      setTimeout(() => {
        c.style.opacity = "0";
        c.style.transform = "scale(.8)";
      }, 3000);
    }

    const fenBtn = makeBtn("📋","Copy FEN");
    const pgnBtn = makeBtn("📄","Copy PGN");
    const comBtn = makeBtn("➕","Add comment");
    const proBtn = makeBtn("⬆️","Promote variation");
    const delBtn = makeBtn("🗑️","Delete variation");
    const undoBtn= makeBtn("↶","Undo");

    proBtn.wrap.style.display = "none";
    delBtn.wrap.style.display = "none";
    undoBtn.wrap.style.display= "none";

    widgetContainer.append(
      fenBtn.wrap,pgnBtn.wrap,comBtn.wrap,
      proBtn.wrap,delBtn.wrap,undoBtn.wrap
    );

    /* ---------- COMMENT MODAL ---------- */

    const modal = document.createElement("div");
    modal.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,.6);
      display:none; align-items:center; justify-content:center; z-index:9999;
    `;
    modal.innerHTML = `
      <div style="background:#161a24;padding:16px;border-radius:12px;width:360px">
        <textarea id="jc-cmt" style="width:100%;min-height:90px"></textarea>
        <div style="text-align:right;margin-top:8px">
          <button id="jc-cmt-ok">Done</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const cBox = modal.querySelector("#jc-cmt");
    const cOk  = modal.querySelector("#jc-cmt-ok");

    let undoAction = null;

    function isVariation(n){ return n && n.parent && n.parent.next !== n; }

    function updateWidgetState(){
      const v = isVariation(cursor);
      proBtn.wrap.style.display = v ? "" : "none";
      delBtn.wrap.style.display = v ? "" : "none";
    }

    fenBtn.b.onclick = () => {
      if (cursor?.fen) {
        navigator.clipboard.writeText(cursor.fen);
        showCheck(fenBtn.check);
      }
    };

    pgnBtn.b.onclick = () => {
      navigator.clipboard.writeText(movesDiv.innerText.trim());
      showCheck(pgnBtn.check);
    };

    comBtn.b.onclick = () => {
      if (!cursor || cursor===root) return;
      cBox.value = cursor.comment || "";
      modal.style.display="flex";
      cOk.onclick = () => {
        cursor.comment = cBox.value.trim();
        modal.style.display="none";
        render();
      };
    };

    proBtn.b.onclick = () => {
      const p = cursor.parent, old = p.next;
      undoAction = { type:"promote", p, old, n:cursor };
      undoBtn.wrap.style.display="";
      p.vars = p.vars.filter(v=>v!==cursor);
      if (old) p.vars.unshift(old);
      p.next = cursor;
      rebuildTo(cursor,true); render();
    };

    delBtn.b.onclick = () => {
      const p = cursor.parent;
      undoAction = { type:"delete", p, n:cursor };
      undoBtn.wrap.style.display="";
      p.vars = p.vars.filter(v=>v!==cursor);
      cursor = p;
      rebuildTo(cursor,true); render();
    };

    undoBtn.b.onclick = () => {
      if (!undoAction) return;
      if (undoAction.type==="promote") {
        undoAction.p.next = undoAction.old;
        undoAction.p.vars.unshift(undoAction.n);
      } else {
        undoAction.p.vars.push(undoAction.n);
        cursor = undoAction.n;
      }
      undoAction=null;
      undoBtn.wrap.style.display="none";
      rebuildTo(cursor,true); render();
    };
  }


  /* ======================================================
   * INIT
   * ====================================================== */

  render();
  rebuildTo(root,false);

});
