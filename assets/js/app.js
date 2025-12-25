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
      this.next = null;   // mainline continuation
      this.vars = [];     // alternative continuations
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
   * INSERTION (mainline vs variation)
   * ====================================================== */

  function applyMove(san, fen) {
    // Follow existing mainline move if identical
    if (cursor.next && cursor.next.san === san) {
      cursor = cursor.next;
      rebuildTo(cursor, false);
      render();
      return;
    }

    const n = new Node(san, cursor, fen);

    // If at tip -> extend mainline, else -> create variation
    if (!cursor.next) cursor.next = n;
    else cursor.vars.push(n);

    cursor = n;
    rebuildTo(n, false);
    render();
  }


  /* ======================================================
   * RENDERING (PGN-correct placement)
   * ====================================================== */

  function render() {
    movesDiv.innerHTML = "";
    renderMainline();
  }

  function renderMainline() {
    let m = 1;

    // Pointers for current fullmove
    let w = root.next;        // white move node of fullmove m
    let bPrev = null;         // black node of previous fullmove (m-1)... used for white-side variations

    while (w) {
      // ---- White mainline ----
      movesDiv.appendChild(text(m + ".\u00A0"));
      appendMove(movesDiv, w);
      movesDiv.appendChild(text(" "));

      // ✅ White variations (start with WHITE) branch from previous black node
      // Example: after 2...Nc6, alternatives for 3rd WHITE move live on that black node.
      if (bPrev && bPrev.vars && bPrev.vars.length) {
        for (const v of bPrev.vars) {
          renderVarBlock(movesDiv, v, m, "w"); // prefix "m. "
        }
      }

      const b = w.next;
      if (!b) return;

      // ---- Black mainline (NO "m..." in mainline) ----
      appendMove(movesDiv, b);
      movesDiv.appendChild(text(" "));

      // ✅ Black variations (start with BLACK) branch from the current white move
      // Example: 1. e4 e5 (1... c5 ...)
      if (w.vars && w.vars.length) {
        for (const v of w.vars) {
          renderVarBlock(movesDiv, v, m, "b"); // prefix "m... "
        }
      }

      // Advance to next fullmove
      bPrev = b;
      w = b.next;
      m++;
    }
  }

  function renderVarBlock(container, startNode, moveNo, startSide) {
    const span = document.createElement("span");
    span.className = "variation";

    const prefix = startSide === "w"
      ? `${moveNo}.\u00A0`
      : `${moveNo}...\u00A0`;

    span.appendChild(text("(" + prefix));
    renderLine(span, startNode, moveNo, startSide, /*prefixAlreadyPrinted*/ true);
    trim(span);
    span.appendChild(text(") "));
    container.appendChild(span);
  }

  // Render a linear line from node.next chain, starting at (moveNo, side).
  // If prefixAlreadyPrinted=true, the first move number for that side is NOT printed again.
  function renderLine(container, node, moveNo, side, prefixAlreadyPrinted) {
    let cur = node;
    let m = moveNo;
    let s = side;
    let first = true;

    while (cur) {
      // Print move number only for White moves, except when the variation prefix already printed it.
      if (s === "w") {
        if (!(first && prefixAlreadyPrinted)) {
          container.appendChild(text(m + ".\u00A0"));
        }
      }

      appendMove(container, cur);
      container.appendChild(text(" "));

      // advance
      if (s === "b") m++;
      s = (s === "w") ? "b" : "w";
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
    };

    container.appendChild(span);
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

  function goStart() { cursor = root; rebuildTo(root, true); render(); }
  function goEnd()   { let n=root; while(n.next) n=n.next; cursor=n; rebuildTo(n,true); render(); }
  function goPrev()  { if(cursor.parent){ cursor=cursor.parent; rebuildTo(cursor,true); render(); } }
  function goNext()  { if(cursor.next){ cursor=cursor.next; rebuildTo(cursor,true); render(); } }

  btnStart.onclick = goStart;
  btnEnd.onclick   = goEnd;
  btnPrev.onclick  = goPrev;
  btnNext.onclick  = goNext;

  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    switch (e.key) {
      case "ArrowLeft":  e.preventDefault(); goPrev();  break;
      case "ArrowRight": e.preventDefault(); goNext();  break;
      case "ArrowUp":    e.preventDefault(); goStart(); break;
      case "ArrowDown":  e.preventDefault(); goEnd();   break;
    }
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
   * INIT
   * ====================================================== */

  render();
  rebuildTo(root, false);

});
