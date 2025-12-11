// ======================================================================
//   JekyllChess Puzzle Engine — CLEAN FEEDBACK + LICHESS INDICATOR
//   NEW: Turn indicator disappears when puzzle is solved
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("Puzzle engine loaded.");

  const puzzleNodes = Array.from(document.querySelectorAll("puzzle"));
  if (puzzleNodes.length === 0) return;

  let remotePackInitialized = false;

  // ============================================================
  // PRIORITY 1 — REMOTE PGN PACK
  // ============================================================
  for (const node of puzzleNodes) {
    if (remotePackInitialized) break;

    const raw = stripFigurines(node.innerHTML || "");
    const pgnUrlMatch = raw.match(/PGN:\s*(https?:\/\/[^\s<]+)/i);
    const fenMatch = raw.match(/FEN:/i);

    if (pgnUrlMatch && !fenMatch) {
      const url = pgnUrlMatch[1].trim();

      const wrapper = document.createElement("div");
      wrapper.style.margin = "20px 0";
      node.replaceWith(wrapper);

      initRemotePackLazy(wrapper, url);
      remotePackInitialized = true;
    }
  }

  // ============================================================
  // PRIORITY 2 — LOCAL PUZZLES
  // ============================================================
  for (const node of puzzleNodes) {
    if (!node.isConnected) continue;

    const raw = stripFigurines(node.innerHTML || "");
    const fenMatch = raw.match(/FEN:\s*([^<\n]+)/i);
    if (!fenMatch) continue;

    const fen = fenMatch[1].trim();

    let sanMoves = null;
    const movesMatch = raw.match(/Moves:\s*([^<\n]+)/i);
    const pgnInlineMatch = raw.match(/PGN:\s*([^<\n]+)/i);

    if (movesMatch) {
      sanMoves = movesMatch[1].trim().split(/\s+/g);
    } else if (pgnInlineMatch) {
      const txt = pgnInlineMatch[1].trim();
      if (!/^https?:\/\//.test(txt)) sanMoves = pgnToSanArray(txt);
    }

    if (!sanMoves || !sanMoves.length) {
      const err = document.createElement("div");
      err.innerHTML = "<div style='color:red'>Invalid puzzle block</div>";
      node.replaceWith(err);
      continue;
    }

    const wrapper = document.createElement("div");
    wrapper.style.margin = "20px 0";
    node.replaceWith(wrapper);

    renderLocalPuzzle(wrapper, fen, sanMoves);
  }
});

// ======================================================================
// Helpers
// ======================================================================

function stripFigurines(str) {
  return str.replace(/[♔♕♖♗♘♙]/g, "");
}

function pgnToSanArray(pgn) {
  let s = pgn;
  s = s.replace(/\{[^}]*\}/g, " ");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ");
  s = s.replace(/\d+\.(\.\.)?/g, " ");
  return s.trim().split(/\s+/g).filter(Boolean);
}

function buildUCISolution(fen, sanMoves) {
  const game = new Chess(fen);
  const out = [];
  for (let san of sanMoves) {
    const clean = san.replace(/[!?]/g, "");
    const mv = game.move(clean, { sloppy: true });
    if (!mv) break;
    out.push(mv.from + mv.to + (mv.promotion || ""));
  }
  return out;
}

// ======================================================================
// Lichess-style indicator (ONLY for "side to move")
// ======================================================================
function createTurnIndicator() {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.marginTop = "4px";
  row.style.fontSize = "15px";
  row.style.fontWeight = "500";
  row.style.fontFamily = "sans-serif";

  const dot = document.createElement("div");
  dot.style.width = "12px";
  dot.style.height = "12px";
  dot.style.borderRadius = "50%";
  dot.style.border = "1px solid #555";

  const label = document.createElement("div");
  label.textContent = "";

  row.append(dot, label);

  return { row, dot, label };
}

function showTurnIndicator(row) {
  row.style.display = "flex";
}

function hideTurnIndicator(row) {
  row.style.display = "none";
}

function updateTurnIndicatorOnly(game, dot, label) {
  if (!game) return;

  if (game.turn() === "w") {
    dot.style.background = "#fff";
    dot.style.border = "1px solid #aaa";
    label.textContent = "White to move";
  } else {
    dot.style.background = "#000";
    dot.style.border = "1px solid #444";
    label.textContent = "Black to move";
  }
}

// ======================================================================
// LOCAL PUZZLES
// ======================================================================
function renderLocalPuzzle(container, fen, sanMoves) {
  const solutionUCI = buildUCISolution(fen, sanMoves);
  const game = new Chess(fen);
  let step = 0;

  const boardDiv = document.createElement("div");
  boardDiv.style.width = "350px";

  const feedbackDiv = document.createElement("div");
  feedbackDiv.style.marginTop = "8px";
  feedbackDiv.style.fontSize = "16px";
  feedbackDiv.style.fontWeight = "600";

  const { row: turnDiv, dot, label } = createTurnIndicator();

  container.append(boardDiv, feedbackDiv, turnDiv);

  const board = Chessboard(boardDiv, {
    draggable: true,
    position: fen,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

    onDragStart: (_, piece) => {
      if (game.turn() === "w" && piece.startsWith("b")) return false;
      if (game.turn() === "b" && piece.startsWith("w")) return false;
    },

    onDrop: (src, dst) => {
      const mv = game.move({ from: src, to: dst, promotion: "q" });
      if (!mv) return "snapback";

      const played = mv.from + mv.to + (mv.promotion || "");
      const expected = solutionUCI[step];

      if (played !== expected) {
        game.undo();
        feedbackDiv.textContent = "Wrong move";
        updateTurnIndicatorOnly(game, dot, label);
        return "snapback";
      }

      step++;
      feedbackDiv.textContent = "Correct move!";
      updateTurnIndicatorOnly(game, dot, label);

      if (step < solutionUCI.length) {
        const replySAN = sanMoves[step];
        const reply = game.move(replySAN, { sloppy: true });
        if (reply) {
          step++;
          setTimeout(() => {
            board.position(game.fen());
            updateTurnIndicatorOnly(game, dot, label);
          }, 150);
        }
      }

      if (step >= solutionUCI.length) {
        feedbackDiv.textContent = "Puzzle solved!";
        hideTurnIndicator(turnDiv);   // <— NEW
      }

      return true;
    },

    onSnapEnd: () => board.position(game.fen())
  });

  showTurnIndicator(turnDiv);
  updateTurnIndicatorOnly(game, dot, label);
}

// ======================================================================
// REMOTE PGN — LAZY LOADING (20 per batch)
// ======================================================================
function initRemotePackLazy(container, url) {
  let games = [];
  let puzzles = [];
  let currentIndex = 0;

  let game = null;
  let board = null;
  let sanMoves = [];
  let solutionUCI = [];
  let step = 0;
  let allParsed = false;

  const BATCH = 20;

  const infoDiv = document.createElement("div");
  infoDiv.style.marginBottom = "5px";

  const boardDiv = document.createElement("div");
  boardDiv.style.width = "350px";

  const feedbackDiv = document.createElement("div");
  feedbackDiv.style.marginTop = "8px";
  feedbackDiv.style.fontSize = "16px";
  feedbackDiv.style.fontWeight = "600";

  const { row: turnDiv, dot, label } = createTurnIndicator();

  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.gap = "8px";
  controls.style.marginTop = "10px";

  const prevBtn = document.createElement("button");
  prevBtn.className = "btn btn-sm btn-secondary";
  prevBtn.textContent = "Previous";

  const nextBtn = document.createElement("button");
  nextBtn.className = "btn btn-sm btn-secondary";
  nextBtn.textContent = "Next";

  controls.append(prevBtn, nextBtn);
  container.append(infoDiv, boardDiv, feedbackDiv, turnDiv, controls);

  feedbackDiv.textContent = "Loading puzzle pack…";

  fetch(url)
    .then(r => r.text())
    .then(text => {
      games = text.replace(/\r/g, "").split(/(?=\[Event\b)/g).filter(Boolean);
      parseBatch(0);
    })
    .catch(() => (feedbackDiv.textContent = "Failed to load PGN."));

  function parseOne(txt) {
    const fenMatch = txt.match(/\[FEN\s+"([^"]+)"\]/i);
    if (!fenMatch) return null;

    const fen = fenMatch[1].trim();
    let moves = [];

    const tag = txt.match(/\[(Moves|Solution)\s+"([^"]+)"\]/i);
    if (tag) moves = pgnToSanArray(tag[2]);
    else moves = pgnToSanArray(txt.replace(/\[[^\]]+\]/g, " "));

    if (!moves.length) return null;
    return { fen, moves };
  }

  function parseBatch(start) {
    const end = Math.min(start + BATCH, games.length);

    for (let i = start; i < end; i++) {
      const p = parseOne(games[i]);
      if (p) puzzles.push(p);
    }

    infoDiv.textContent = `Loaded ${puzzles.length} puzzle(s)…`;

    if (!board && puzzles.length) {
      initBoard();
      loadPuzzle(0);
    }

    if (end < games.length) {
      setTimeout(() => parseBatch(end), 0);
    } else {
      allParsed = true;
    }
  }

  function initBoard() {
    board = Chessboard(boardDiv, {
      draggable: true,
      pieceTheme:
        "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

      onDragStart: (_, piece) => {
        if (game.turn() === "w" && piece.startsWith("b")) return false;
        if (game.turn() === "b" && piece.startsWith("w")) return false;
      },

      onDrop: (src, dst) => {
        const mv = game.move({ from: src, to: dst, promotion: "q" });
        if (!mv) return "snapback";

        const played = mv.from + mv.to + (mv.promotion || "");
        const expected = solutionUCI[step];

        if (played !== expected) {
          game.undo();
          feedbackDiv.textContent = "Wrong move";
          updateTurnIndicatorOnly(game, dot, label);
          return "snapback";
        }

        step++;
        feedbackDiv.textContent = "Correct move!";
        updateTurnIndicatorOnly(game, dot, label);

        if (step < solutionUCI.length) {
          const replySAN = sanMoves[step];
          const rep = game.move(replySAN, { sloppy: true });
          if (rep) step++;
          setTimeout(() => {
            board.position(game.fen());
            updateTurnIndicatorOnly(game, dot, label);
          }, 150);
        }

        if (step >= solutionUCI.length) {
          feedbackDiv.textContent = "Puzzle solved!";
          hideTurnIndicator(turnDiv);   // <— NEW
        }

        return true;
      },

      onSnapEnd: () => board.position(game.fen())
    });

    prevBtn.onclick = () => {
      if (!puzzles.length) return;

      currentIndex =
        currentIndex > 0
          ? currentIndex - 1
          : allParsed
          ? puzzles.length - 1
          : 0;

      loadPuzzle(currentIndex);
    };

    nextBtn.onclick = () => {
      if (!puzzles.length) return;

      if (currentIndex + 1 < puzzles.length) {
        loadPuzzle(++currentIndex);
      } else if (!allParsed) {
        feedbackDiv.textContent = "Loading more puzzles…";
      } else {
        currentIndex = 0;
        loadPuzzle(0);
      }
    };
  }

  function loadPuzzle(i) {
    const p = puzzles[i];
    if (!p) return;

    game = new Chess(p.fen);
    sanMoves = p.moves;
    solutionUCI = buildUCISolution(p.fen, sanMoves);
    step = 0;

    board.position(p.fen);
    feedbackDiv.textContent = "";
    showTurnIndicator(turnDiv);       // <— indicator returns
    updateTurnIndicatorOnly(game, dot, label);
  }
}
