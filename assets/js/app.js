document.addEventListener("DOMContentLoaded", () => {

  /* ======================================================
   *  DOM REFERENCES
   * ====================================================== */

  const movesDiv = document.getElementById("moves");
  const promo = document.getElementById("promo");

  const btnStart = document.getElementById("btnStart");
  const btnEnd   = document.getElementById("btnEnd");
  const btnPrev  = document.getElementById("btnPrev");
  const btnNext  = document.getElementById("btnNext");
  const btnFlip  = document.getElementById("btnFlip");


  /* ======================================================
   *  SAN / FIGURINE HELPERS
   * ====================================================== */

  const FIG = { K:"♔", Q:"♕", R:"♖", B:"♗", N:"♘" };
  const figSAN = s =>
    s.replace(/^[KQRBN]/, p => FIG[p] || p)
     .replace(/=([QRBN])/, (_, p) => "=" + FIG[p]);


  /* ======================================================
   *  TREE DATA MODEL (MAINLINE ONLY)
   * ====================================================== */

  let ID = 1;

  class Node {
    constructor(san, parent, fen) {
      this.id = "n" + ID++;
      this.san = san;
      this.parent = parent;
      this.fen = fen;
      this.next = null;
    }
  }


  /* ======================================================
   *  CHESS STATE
   * ====================================================== */

  const chess = new Chess();
  const START_FEN = chess.fen();

  const root = new Node(null, null, START_FEN);
  let cursor = root;

  let pendingPromotion = null;

  let boardOrientation =
    localStorage.getItem("boardOrientation") || "white";


  /* ======================================================
   *  BOARD SETUP
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
   *  RESIZE OBSERVER
   * ====================================================== */

  const boardEl = document.getElementById("board");

  const boardResizeObserver = new ResizeObserver(() => {
    board.resize();
  });

  boardResizeObserver.observe(boardEl);


  /* ======================================================
   *  MOVE INPUT & PROMOTION
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
    const m = t.move({
      ...pendingPromotion,
      promotion: e.target.dataset.p
    });

    pendingPromotion = null;

    if (m) applyMove(m.san, t.fen());
  };


  /* ======================================================
   *  MAINLINE INSERTION (REPLACE MODE)
   * ====================================================== */

  function applyMove(san, fen) {
    // Always replace continuation from cursor
    const n = new Node(san, cursor, fen);
    cursor.next = n;
    cursor = n;

    rebuildTo(n, false);
    render();
  }


  /* ======================================================
   *  MOVE LIST RENDERING (LINEAR ONLY)
   * ====================================================== */

  function render() {
    movesDiv.innerHTML = "";

    let cur = root.next;
    let moveNo = 1;
    let side = "w";

    while (cur) {
      if (side === "w") {
        movesDiv.appendChild(text(moveNo + ". "));
      }

      appendMove(movesDiv, cur);
      movesDiv.appendChild(text(" "));

      if (side === "b") moveNo++;
      side = side === "w" ? "b" : "w";
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

  function text(t) {
    return document.createTextNode(t);
  }


  /* ======================================================
   *  NAVIGATION CONTROLS
   * ====================================================== */

  btnStart.onclick = () => {
    cursor = root;
    rebuildTo(root, true);
    render();
  };

  btnEnd.onclick = () => {
    let n = root;
    while (n.next) n = n.next;
    cursor = n;
    rebuildTo(n, true);
    render();
  };

  btnPrev.onclick = () => {
    if (!cursor.parent) return;
    cursor = cursor.parent;
    rebuildTo(cursor, true);
    render();
  };

  btnNext.onclick = () => {
    if (!cursor.next) return;
    cursor = cursor.next;
    rebuildTo(cursor, true);
    render();
  };


  /* ======================================================
   *  BOARD ORIENTATION TOGGLE (PERSISTED)
   * ====================================================== */

  btnFlip.onclick = () => {
    boardOrientation = boardOrientation === "white" ? "black" : "white";
    board.orientation(boardOrientation);
    localStorage.setItem("boardOrientation", boardOrientation);
  };


  /* ======================================================
   *  INIT
   * ====================================================== */

  render();
  rebuildTo(root, false);
  setTimeout(() => board.resize(), 0);

});
