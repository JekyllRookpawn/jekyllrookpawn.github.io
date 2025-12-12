// ======================================================================
// JekyllChess Puzzle Engine — BATCH / LAZY REMOTE PGN LOADING
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
  injectPuzzleStyles();

  const puzzles = Array.from(document.querySelectorAll("puzzle"));
  let remoteUsed = false;

  puzzles.forEach(node => {
    const raw = stripFigurines(node.innerHTML || "").trim();
    const wrap = document.createElement("div");
    wrap.className = "jc-puzzle-wrapper";
    node.replaceWith(wrap);

    const fenMatch = raw.match(/FEN:\s*([^\n<]+)/i);
    const movesMatch = raw.match(/Moves:\s*([^\n<]+)/i);
    const pgnUrlMatch = raw.match(/PGN:\s*(https?:\/\/[^\s<]+)/i);
    const pgnInlineMatch = !pgnUrlMatch && raw.match(/PGN:\s*(1\.[\s\S]+)/i);

    if (pgnUrlMatch && !fenMatch) {
      if (remoteUsed) {
        wrap.textContent = "⚠️ Only one remote PGN pack allowed per page.";
        return;
      }
      remoteUsed = true;
      initRemotePGNPackLazy(wrap, pgnUrlMatch[1].trim());
      return;
    }

    if (fenMatch && pgnInlineMatch) {
      renderLocalPuzzle(wrap, fenMatch[1].trim(), parsePGNMoves(pgnInlineMatch[1]));
      return;
    }

    if (fenMatch && movesMatch) {
      renderLocalPuzzle(wrap, fenMatch[1].trim(), movesMatch[1].trim().split(/\s+/));
      return;
    }

    wrap.textContent = "❌ Invalid <puzzle> block.";
  });
});

// ======================================================================
// STYLES
// ======================================================================

function injectPuzzleStyles() {
  if (document.getElementById("jc-puzzle-styles")) return;

  const s = document.createElement("style");
  s.id = "jc-puzzle-styles";
  s.textContent = `
    .jc-puzzle-wrapper { margin: 20px 0; }
    .jc-board { width: 350px; }
    .jc-feedback { margin-top:8px; font-weight:600; display:flex; gap:6px; }
    .jc-icon { animation: jc-pulse 1s ease-in-out infinite; }
    .jc-correct { color:#2e8b57; }
    .jc-wrong { color:#b22222; }

    @keyframes jc-pulse {
      0% { transform:scale(1); }
      50% { transform:scale(1.15); }
      100% { transform:scale(1); }
    }

    .jc-controls { margin-top:10px; display:flex; gap:8px; }

    @media (max-width:768px) {
      .jc-board { touch-action:none; }
    }
  `;
  document.head.appendChild(s);
}

// ======================================================================
// HELPERS
// ======================================================================

function stripFigurines(s) {
  return s.replace(/[♔♕♖♗♘♙]/g, "");
}

function parsePGNMoves(pgn) {
  return pgn
    .replace(/\{[^}]*\}/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\d+\.(\.\.)?/g, "")
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function buildUCISolution(fen, san) {
  const g = new Chess(fen);
  const out = [];
  for (const m of san) {
    const mv = g.move(m, { sloppy:true });
    if (!mv) break;
    out.push(mv.from + mv.to + (mv.promotion || ""));
  }
  return out;
}

// ======================================================================
// FEEDBACK
// ======================================================================

function showCorrect(el) {
  el.innerHTML = `Correct move <span class="jc-icon jc-correct">✔️</span>`;
}
function showWrong(el) {
  el.innerHTML = `Wrong move <span class="jc-icon jc-wrong">✖️</span>`;
}
function showSolved(el) {
  el.innerHTML = `Puzzle solved <span class="jc-icon">🏆</span>`;
}

// ======================================================================
// LOCAL PUZZLES (unchanged)
// ======================================================================

function renderLocalPuzzle(container, fen, sanMoves) {
  const game = new Chess(fen);
  const solution = buildUCISolution(fen, sanMoves);
  let step = 0, solved = false;

  const boardDiv = document.createElement("div");
  boardDiv.className = "jc-board";
  const feedback = document.createElement("div");
  feedback.className = "jc-feedback";

  container.append(boardDiv, feedback);

  const board = Chessboard(boardDiv, {
    draggable:true,
    position:fen,
    pieceTheme:"https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
    onDrop:(s,t)=> play(s,t) ? true : "snapback"
  });

  function play(src,dst) {
    if (solved) return false;
    const mv = game.move({ from:src, to:dst, promotion:"q" });
    if (!mv) return false;

    if (mv.from + mv.to !== solution[step]) {
      game.undo();
      showWrong(feedback);
      return false;
    }

    step++;
    showCorrect(feedback);

    if (step < solution.length) {
      game.move(sanMoves[step], { sloppy:true });
      step++;
      setTimeout(()=> board.position(game.fen(), true), 200);
    }

    if (step >= solution.length) {
      solved = true;
      showSolved(feedback);
    }
    return true;
  }
}

// ======================================================================
// REMOTE PGN — BATCH / LAZY LOADER (REAL IMPLEMENTATION)
// ======================================================================

function initRemotePGNPackLazy(container, url) {
  const BATCH_SIZE = 20;

  const boardDiv = document.createElement("div");
  boardDiv.className = "jc-board";
  const feedback = document.createElement("div");
  feedback.className = "jc-feedback";
  const controls = document.createElement("div");
  controls.className = "jc-controls";

  const prev = document.createElement("button");
  prev.textContent = "Previous";
  const next = document.createElement("button");
  next.textContent = "Next";

  controls.append(prev, next);
  container.append(boardDiv, feedback, controls);

  feedback.textContent = "Loading puzzle pack…";

  fetch(url)
    .then(r => r.text())
    .then(txt => {
      const games = txt.split(/\[Event\b/).slice(1).map(g => "[Event" + g);
      const puzzles = [];
      let parsedUntil = 0;

      let index = 0;
      let game, solution, step = 0, solved = false;

      const board = Chessboard(boardDiv, {
        draggable:true,
        pieceTheme:"https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
        onDrop:(s,t)=> play(s,t) ? true : "snapback"
      });

      function parseNextBatch() {
        const end = Math.min(parsedUntil + BATCH_SIZE, games.length);

        for (let i = parsedUntil; i < end; i++) {
          const g = games[i];
          const fen = g.match(/\[FEN\s+"([^"]+)"/)?.[1];
          if (!fen) continue;
          const moves = parsePGNMoves(g);
          if (moves.length) puzzles.push({ fen, moves });
        }

        parsedUntil = end;
      }

      function load(i) {
        if (i >= puzzles.length && parsedUntil < games.length) {
          parseNextBatch();
        }

        if (!puzzles[i]) return;

        index = i;
        game = new Chess(puzzles[i].fen);
        solution = buildUCISolution(puzzles[i].fen, puzzles[i].moves);
        step = 0;
        solved = false;
        board.position(game.fen());
        feedback.textContent = "";
      }

      function play(src,dst) {
        if (solved) return false;
        const mv = game.move({ from:src, to:dst, promotion:"q" });
        if (!mv) return false;

        if (mv.from + mv.to !== solution[step]) {
          game.undo();
          showWrong(feedback);
          return false;
        }

        step++;
        showCorrect(feedback);

        if (step < solution.length) {
          game.move(puzzles[index].moves[step], { sloppy:true });
          step++;
          setTimeout(()=> board.position(game.fen(), true), 200);
        }

        if (step >= solution.length) {
          solved = true;
          showSolved(feedback);
        }
        return true;
      }

      prev.onclick = () => load(Math.max(index - 1, 0));
      next.onclick = () => load(index + 1);

      parseNextBatch();
      load(0);
    })
    .catch(() => {
      feedback.textContent = "❌ Failed to load PGN.";
    });
}
