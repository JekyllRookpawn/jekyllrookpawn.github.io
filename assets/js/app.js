document.addEventListener("DOMContentLoaded", () => {

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

  let ID = 1;
  class Node {
    constructor(san, parent, fen) {
      this.id = "n" + ID++;
      this.san = san;
      this.parent = parent;
      this.fen = fen;
      this.next = null;
      this.vars = [];
    }
  }

  const chess = new Chess();
  const START_FEN = chess.fen();
  const root = new Node(null, null, START_FEN);
  let cursor = root;

  let pendingPromotion = null;
  let boardOrientation = localStorage.getItem("boardOrientation") || "white";

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

  function getMoveNumber(node) {
    let n = node;
    let count = 0;
    while (n.parent) {
      if (n.parent.parent) count++;
      n = n.parent;
    }
    return count + 1;
  }

  function render() {
    movesDiv.innerHTML = "";
    renderMainline(root.next);
  }

  function renderMainline(w) {
    let cur = w;
    while (cur) {
      const m = getMoveNumber(cur);

      movesDiv.appendChild(text(m + ". "));
      appendMove(cur);
      movesDiv.appendChild(text(" "));

      if (cur.vars.length) {
        cur.vars.forEach(v => renderVariation(v, m, "b"));
      }

      const b = cur.next;
      if (!b) return;

      appendMove(b);
      movesDiv.appendChild(text(" "));

      if (b.vars.length) {
        b.vars.forEach(v => renderVariation(v, m, "w"));
      }

      cur = b.next;
    }
  }

  function renderVariation(node, moveNo, startSide) {
    const span = document.createElement("span");
    span.className = "variation";
    span.appendChild(text("(" + moveNo + (startSide === "b" ? "... " : ". ")));

    let cur = node;
    let side = startSide;
    let m = moveNo;

    while (cur) {
      if (side === "w") span.appendChild(text(m + ". "));
      appendMove(cur, span);
      span.appendChild(text(" "));
      if (side === "b") m++;
      side = side === "w" ? "b" : "w";
      cur = cur.next;
    }

    trim(span);
    span.appendChild(text(") "));
    movesDiv.appendChild(span);
  }

  function appendMove(node, container = movesDiv) {
    const s = document.createElement("span");
    s.className = "move" + (node === cursor ? " active" : "");
    s.textContent = figSAN(node.san);
    s.onclick = () => {
      cursor = node;
      rebuildTo(node, true);
      render();
    };
    container.appendChild(s);
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

  btnStart.onclick = () => { cursor = root; rebuildTo(root,true); render(); };
  btnEnd.onclick   = () => { let n=root; while(n.next) n=n.next; cursor=n; rebuildTo(n,true); render(); };
  btnPrev.onclick  = () => { if(cursor.parent){ cursor=cursor.parent; rebuildTo(cursor,true); render(); }};
  btnNext.onclick  = () => { if(cursor.next){ cursor=cursor.next; rebuildTo(cursor,true); render(); }};

  btnFlip.onclick = () => {
    boardOrientation = boardOrientation === "white" ? "black" : "white";
    board.orientation(boardOrientation);
    localStorage.setItem("boardOrientation", boardOrientation);
  };

  render();
  rebuildTo(root, false);

});
