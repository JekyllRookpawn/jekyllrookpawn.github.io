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

  const boardEl  = document.getElementById("board");
  const card     = movesDiv.closest(".card");
  const cardHead = card.querySelector(".cardHead");
  const cardBody = card.querySelector(".cardBody");


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
      this.next = null;   // mainline
      this.vars = [];     // variations
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

  let boardOrientation =
    localStorage.getItem("boardOrientation") || "white";


  /* ======================================================
   * BOARD
   * ====================================================== */

  const board = Chessboard("board", {
    position: "start",
    draggable: true,
    pieceTheme:
      "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
    onDrop
  });

  board.orientation(boardOrientation);

  function rebuildTo(node, animate) {
    chess.load(node?.fen || START_FEN);
    board.position(chess.fen(), !!animate);
  }


  /* ======================================================
   * HEIGHT SYNC
   * ====================================================== */

  function syncMovesPaneHeight() {
    const boardH = boardEl.getBoundingClientRect().height;
    const headH  = cardHead.getBoundingClientRect().height;
    const bodyH  = boardH - headH;

    if (bodyH > 0) {
      cardBody.style.height = bodyH + "px";
      movesDiv.style.overflowY = "auto";
    }
  }

  const ro = new ResizeObserver(() => {
    board.resize();
    syncMovesPaneHeight();
  });

  ro.observe(boardEl);


  /* ======================================================
   * MOVE INPUT
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
   * INSERTION (MAINLINE + VARS)
   * ====================================================== */

  function applyMove(san, fen) {
    if (cursor.next && cursor.next.san === san) {
      cursor = cursor.next;
      rebuildTo(cursor, false);
      render();
      return;
    }

    const n = new Node(san, cursor, fen);

    if (!cursor.next) {
      cursor.next = n;
    } else {
      cursor.vars.push(n);
    }

    cursor = n;
    rebuildTo(n, false);
    render();
  }


  /* ======================================================
   * RENDERING (PGN-CORRECT ORDER)
   * ====================================================== */

  function render() {
    movesDiv.innerHTML = "";
    renderLine(root.next, movesDiv, 1, "w");
  }

  function renderLine(node, container, moveNo, side) {
    let cur = node;
    let m = moveNo;
    let s = side;

    while (cur) {

      /* --- print current mainline move --- */
      if (s === "w") {
        container.appendChild(text(m + ".\u00A0"));
      }

      appendMove(container, cur);
      container.appendChild(text(" "));

      /* --- look ahead to opponent reply --- */
      const reply = cur.next;

      /* --- advance side / move number temporarily --- */
      const nextSide = s === "w" ? "b" : "w";
      const nextMoveNo = s === "b" ? m + 1 : m;

      /* --- if there is a reply, render it first --- */
      if (reply && s === "w") {
        appendMove(container, reply);
        container.appendChild(text(" "));
      }

      /* --- NOW render variations branching here --- */
      if (cur.vars.length) {
        cur.vars.forEach(v => {
          const span = document.createElement("span");
          span.className = "variation";

          const prefix =
            s === "w"
              ? m + "...\u00A0"
              : m + ".\u00A0";

          span.appendChild(text("(" + prefix));
          renderLine(v, span, m, nextSide);
          trim(span);
          span.appendChild(text(") "));
          container.appendChild(span);
        });
      }

      /* --- move forward in mainline --- */
      if (!reply) {
        if (s === "b") m++;
        s = nextSide;
        cur = cur.next;
      } else {
        // reply already rendered, skip it
        cur = reply.next;
        m = nextMoveNo;
        s = nextSide;
      }
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
   * NAVIGATION
   * ====================================================== */

  function goStart() {
    cursor = root;
    rebuildTo(root, true);
    render();
  }

  function goEnd() {
    let n = root;
    while (n.next) n = n.next;
    cursor = n;
    rebuildTo(n, true);
    render();
  }

  function goPrev() {
    if (!cursor.parent) return;
    cursor = cursor.parent;
    rebuildTo(cursor, true);
    render();
  }

  function goNext() {
    if (!cursor.next) return;
    cursor = cursor.next;
    rebuildTo(cursor, true);
    render();
  }

  btnStart.onclick = goStart;
  btnEnd.onclick   = goEnd;
  btnPrev.onclick  = goPrev;
  btnNext.onclick  = goNext;

  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowLeft")  goPrev();
    if (e.key === "ArrowRight") goNext();
    if (e.key === "ArrowUp")    goStart();
    if (e.key === "ArrowDown")  goEnd();
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

  setTimeout(() => {
    board.resize();
    syncMovesPaneHeight();
  }, 0);

});
