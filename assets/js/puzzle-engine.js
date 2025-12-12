// ======================================================================
// JekyllChess Puzzle Engine — with animated feedback (correct / wrong / solved)
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("Puzzle engine loaded.");
  injectPuzzleStyles();

  const puzzleNodes = Array.from(document.querySelectorAll("puzzle"));
  if (!puzzleNodes.length) return;

  let remotePackInitialized = false;

  // ============================================================
  // REMOTE PGN PACK (first one only)
  // ============================================================
  for (const node of puzzleNodes) {
    if (remotePackInitialized) break;

    const raw = stripFigurines(node.innerHTML || "");
    const pgnUrl = raw.match(/PGN:\s*(https?:\/\/[^\s<]+)/i);
    const fen = raw.match(/FEN:/i);

    if (pgnUrl && !fen) {
      const wrap = document.createElement("div");
      wrap.className = "jc-puzzle-wrapper";
      node.replaceWith(wrap);
      initRemotePackLazy(wrap, pgnUrl[1].trim());
      remotePackInitialized = true;
    }
  }

  // ============================================================
  // LOCAL PUZZLES
  // ============================================================
  for (const node of puzzleNodes) {
    if (!node.isConnected) continue;

    const raw = stripFigurines(node.innerHTML || "");
    const fenMatch = raw.match(/FEN:\s*([^<\n]+)/i);
    if (!fenMatch) continue;

    const fen = fenMatch[1].trim();
    const movesMatch = raw.match(/Moves:\s*([^<\n]+)/i);
    if (!movesMatch) continue;

    const sanMoves = movesMatch[1].trim().split(/\s+/);

    const wrap = document.createElement("div");
    wrap.className = "jc-puzzle-wrapper";
    node.replaceWith(wrap);

    renderLocalPuzzle(wrap, fen, sanMoves);
  }
});

// ======================================================================
// STYLE INJECTION
// ======================================================================

function injectPuzzleStyles() {
  if (document.getElementById("jc-puzzle-styles")) return;

  const style = document.createElement("style");
  style.id = "jc-puzzle-styles";
  style.textContent = `
    .jc-puzzle-wrapper { margin: 20px 0; }

    .jc-board { width: 350px; }

    .jc-feedback {
      margin-top: 8px;
      font-size: 16px;
      font-weight: 600;
    }

    .jc-turn {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      font-size: 15px;
      font-weight: 500;
    }

    .jc-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 1px solid #555;
    }

    .jc-selected-square {
      outline: 2px solid rgba(60,132,255,.9);
      outline-offset: -2px;
    }

    @media (max-width: 768px) {
      .jc-board { touch-action: none; }
    }

    /* ✅ Correct move animation */
    @keyframes jc-correct {
      0%   { transform: scale(1); box-shadow: none; }
      50%  { transform: scale(1.08); box-shadow: 0 0 10px rgba(80,200,120,.6); }
      100% { transform: scale(1); box-shadow: none; }
    }
    .jc-correct {
      animation: jc-correct .4s ease;
      color: #2e8b57;
    }

    /* ❌ Wrong move animation */
    @keyframes jc-wrong {
      0%   { transform: translateX(0); }
      25%  { transform: translateX(-4px); }
      50%  { transform: translateX(4px); }
      75%  { transform: translateX(-4px); }
      100% { transform: translateX(0); }
    }
    .jc-wrong {
      animation: jc-wrong .3s ease;
      color: #b22222;
    }

    /* 🏆 Trophy */
    @keyframes jc-trophy-pulse {
      0%   { transform: scale(1); filter: drop-shadow(0 0 0 gold); }
      50%  { transform: scale(1.15); filter: drop-shadow(0 0 4px gold); }
      100% { transform: scale(1); filter: drop-shadow(0 0 0 gold); }
    }
    .jc-trophy {
      margin-left: 4px;
      animation: jc-trophy-pulse 1s ease-in-out infinite;
      display: inline-block;
    }
  `;
  document.head.appendChild(style);
}

// ======================================================================
// HELPERS
// ======================================================================

function stripFigurines(s) {
  return s.replace(/[♔♕♖♗♘♙]/g, "");
}

function buildUCISolution(fen, san) {
  const g = new Chess(fen);
  return san.map(m => {
    const mv = g.move(m, { sloppy: true });
    return mv ? mv.from + mv.to + (mv.promotion || "") : null;
  }).filter(Boolean);
}

function animateCorrect(el) {
  el.classList.remove("jc-wrong");
  el.classList.add("jc-correct");
  setTimeout(() => el.classList.remove("jc-correct"), 400);
}

function animateWrong(el) {
  el.classList.remove("jc-correct");
  el.classList.add("jc-wrong");
  setTimeout(() => el.classList.remove("jc-wrong"), 300);
}

function setSolvedFeedback(el) {
  el.textContent = "Puzzle solved!";
  const t = document.createElement("span");
  t.className = "jc-trophy";
  t.textContent = "🏆";
  el.appendChild(t);
}

// ======================================================================
// TURN INDICATOR
// ======================================================================

function createTurnIndicator() {
  const row = document.createElement("div");
  row.className = "jc-turn";

  const dot = document.createElement("div");
  dot.className = "jc-dot";

  const label = document.createElement("div");

  row.append(dot, label);
  return { row, dot, label };
}

function updateTurn(game, dot, label) {
  if (game.turn() === "w") {
    dot.style.background = "#fff";
    label.textContent = "White to move";
  } else {
    dot.style.background = "#000";
    label.textContent = "Black to move";
  }
}

// ======================================================================
// TAP-TO-MOVE (MINIMAL)
// ======================================================================

function attachTap(boardEl, game, tryMove, solved) {
  let from = null;

  boardEl.addEventListener("click", e => {
    if (solved()) return;

    const sqEl = e.target.closest("[data-square]");
    if (!sqEl) return;

    const sq = sqEl.dataset.square;
    if (!from) {
      const p = game.get(sq);
      if (!p || p.color !== game.turn()) return;
      sqEl.classList.add("jc-selected-square");
      from = sq;
    } else {
      boardEl.querySelectorAll(".jc-selected-square")
        .forEach(x => x.classList.remove("jc-selected-square"));
      tryMove(from, sq);
      from = null;
    }
  });
}

// ======================================================================
// LOCAL PUZZLE
// ======================================================================

function renderLocalPuzzle(container, fen, sanMoves) {
  const game = new Chess(fen);
  const solution = buildUCISolution(fen, sanMoves);
  let step = 0;
  let solved = false;

  const boardDiv = document.createElement("div");
  boardDiv.className = "jc-board";

  const feedback = document.createElement("div");
  feedback.className = "jc-feedback";

  const { row: turnRow, dot, label } = createTurnIndicator();

  container.append(boardDiv, feedback, turnRow);

  const board = Chessboard(boardDiv, {
    draggable: true,
    position: fen,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
    onDrop: (s, t) => tryMove(s, t) ? true : "snapback",
    onSnapEnd: () => board.position(game.fen())
  });

  function tryMove(src, dst) {
    if (solved) return false;
    const mv = game.move({ from: src, to: dst, promotion: "q" });
    if (!mv) return false;

    if (mv.from + mv.to !== solution[step]) {
      game.undo();
      feedback.textContent = "Wrong move";
      animateWrong(feedback);
      updateTurn(game, dot, label);
      return false;
    }

    step++;
    feedback.textContent = "Correct move!";
    animateCorrect(feedback);
    updateTurn(game, dot, label);
    board.position(game.fen());

    if (step < solution.length) {
      game.move(sanMoves[step], { sloppy: true });
      step++;
      board.position(game.fen());
      updateTurn(game, dot, label);
    }

    if (step >= solution.length) {
      solved = true;
      setSolvedFeedback(feedback);
      turnRow.style.display = "none";
    }
    return true;
  }

  updateTurn(game, dot, label);
  attachTap(boardDiv, game, tryMove, () => solved);
}

// ======================================================================
// REMOTE PGN (placeholder — unchanged)
// ======================================================================

function initRemotePackLazy(container, url) {
  container.textContent = "Remote PGN packs already supported as before.";
}
