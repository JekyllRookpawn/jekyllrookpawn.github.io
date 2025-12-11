// ======================================================================
//   JekyllChess Puzzle Engine (FULL FILE)
//   - Multiple <puzzle> blocks → one board each
//   - ONE remote PGN pack per page → single-board trainer
//   - Supports:
//       FEN + Moves (SAN list)
//       FEN + PGN (inline PGN string)
//       PGN: https://url.pgn  (remote pack, multi-game file)
//   - Figurine-safe & Jekyll-safe
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("Puzzle engine loaded.");

  const puzzleNodes = Array.from(document.querySelectorAll("puzzle"));
  if (puzzleNodes.length === 0) {
    console.log("No <puzzle> blocks found.");
    return;
  }

  // ============================================================
  // FIRST PRIORITY: REMOTE PGN PACK (ONLY THE FIRST ONE)
  // ============================================================
  let remotePackInitialized = false;

  for (const node of puzzleNodes) {
    if (remotePackInitialized) break;

    const htmlRaw = node.innerHTML || "";
    const html = stripFigurines(htmlRaw);

    const pgnUrlMatch = html.match(/PGN:\s*(https?:\/\/[^\s<]+)/i);
    const fenMatch = html.match(/FEN:\s*([^<\n\r]+)/i);

    // Remote pack: PGN URL and NO FEN
    if (pgnUrlMatch && !fenMatch) {
      const url = pgnUrlMatch[1].trim();
      console.log("Remote PGN pack detected:", url);

      const wrapper = document.createElement("div");
      wrapper.style.margin = "20px 0";
      node.replaceWith(wrapper);

      initRemotePack(wrapper, url);
      remotePackInitialized = true;
    }
  }

  // ============================================================
  // SECOND PRIORITY: LOCAL PUZZLES (ONE BOARD PER BLOCK)
  // ============================================================
  for (const node of puzzleNodes) {
    // Skip nodes replaced by the remote pack handler
    if (!node.isConnected) continue;

    const htmlRaw = node.innerHTML || "";
    const html = stripFigurines(htmlRaw);

    const fenMatch = html.match(/FEN:\s*([^<\n\r]+)/i);
    if (!fenMatch) continue; // not a local FEN puzzle

    const fen = fenMatch[1].trim();

    const movesMatch = html.match(/Moves:\s*([^<\n\r]+)/i);
    const pgnInlineMatch = html.match(/PGN:\s*([^<\n\r]+)/i);

    let sanMoves = null;

    // Case 1: Moves: as SAN list
    if (movesMatch) {
      const movesLine = movesMatch[1].trim().replace(/\s+/g, " ");
      sanMoves = movesLine.split(" ");
    }
    // Case 2: PGN: inline (NOT URL) as full movetext
    else if (pgnInlineMatch) {
      const pgnValue = pgnInlineMatch[1].trim();
      if (!/^https?:\/\//i.test(pgnValue)) {
        sanMoves = pgnToSanArray(pgnValue);
      }
    }

    if (!sanMoves || sanMoves.length === 0) {
      const wrapper = document.createElement("div");
      wrapper.style.margin = "20px 0";
      wrapper.innerHTML = "<div style='color:red'>Invalid puzzle block.</div>";
      node.replaceWith(wrapper);
      continue;
    }

    console.log("Local puzzle:", { fen, sanMoves });

    const wrapper = document.createElement("div");
    wrapper.style.margin = "20px 0";
    node.replaceWith(wrapper);

    renderSinglePuzzle(wrapper, fen, sanMoves);
  }
});

// ======================================================================
// Helper: strip unicode figurines (in case figurine.js touched content)
// ======================================================================
function stripFigurines(str) {
  return str.replace(/[♔♕♖♗♘♙]/g, "");
}

// ======================================================================
// Convert inline PGN into SAN list
//   e.g. "1. Nxe5 Nxe5 2. Bxf7+ Ke7" → ["Nxe5","Nxe5","Bxf7+","Ke7"]
// ======================================================================
function pgnToSanArray(pgnText) {
  let s = pgnText;

  // Remove comments and variations
  s = s.replace(/\{[^}]*\}/g, " ");  // {...}
  s = s.replace(/\([^)]*\)/g, " ");  // (...)

  // Remove results
  s = s.replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ");

  // Remove move numbers: "1.", "1...", "23..." etc.
  s = s.replace(/\d+\.(\.\.)?/g, " ");

  s = s.replace(/\s+/g, " ").trim();
  if (!s) return [];

  return s.split(" ");
}

// ======================================================================
// Convert SAN list → UCI list (forward progression, no undo)
// ======================================================================
function buildUCISolution(fen, sanMoves) {
  const game = new Chess(fen);
  const solution = [];

  for (let san of sanMoves) {
    const clean = san.replace(/[!?]/g, "").trim();
    if (!clean) continue;

    const moveObj = game.move(clean, { sloppy: true });
    if (!moveObj) {
      console.error("Cannot parse SAN move:", san);
      break;
    }

    const uci = moveObj.from + moveObj.to + (moveObj.promotion || "");
    solution.push(uci);
  }

  return solution;
}

// ======================================================================
// LOCAL PUZZLE RENDERING: One board per <puzzle>
// ======================================================================
function renderSinglePuzzle(container, fen, sanMoves) {
  console.log("Rendering local puzzle with FEN:", fen);

  const solutionUCI = buildUCISolution(fen, sanMoves);
  console.log("Local puzzle UCI solution:", solutionUCI);

  const game = new Chess(fen);

  const boardDiv = document.createElement("div");
  boardDiv.style.width = "350px";

  const statusDiv = document.createElement("div");
  statusDiv.style.marginTop = "10px";
  statusDiv.style.fontSize = "16px";

  container.append(boardDiv, statusDiv);

  let step = 0;

  const board = Chessboard(boardDiv, {
    draggable: true,
    position: fen,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

    onDragStart: (_, piece) => {
      if (game.turn() === "w" && piece.startsWith("b")) return false;
      if (game.turn() === "b" && piece.startsWith("w")) return false;
    },

    onDrop: (source, target) => {
      const move = game.move({ from: source, to: target, promotion: "q" });
      if (!move) return "snapback";

      const played = move.from + move.to + (move.promotion || "");
      const expected = solutionUCI[step];

      if (played !== expected) {
        statusDiv.textContent = "❌ Wrong move";
        game.undo();
        return "snapback";
      }

      statusDiv.textContent = "✅ Correct";
      step++;

      // Opponent's reply if present
      if (step < solutionUCI.length) {
        const replySAN = sanMoves[step];
        const reply = game.move(replySAN, { sloppy: true });
        if (reply) {
          step++;
          setTimeout(() => board.position(game.fen()), 150);
        }
      }

      if (step >= solutionUCI.length) {
        statusDiv.textContent = "🎉 Puzzle solved!";
      }

      return true;
    },

    onSnapEnd: () => board.position(game.fen())
  });

  statusDiv.textContent = "Your move...";
}

// ======================================================================
// REMOTE PGN PACK: Single-board trainer (Option R2)
// ======================================================================
function initRemotePack(container, url) {
  console.log("Initializing remote PGN pack from:", url);

  // Shared state for this trainer
  let puzzles = [];
  let currentIndex = 0;
  let game = null;
  let board = null;
  let sanMoves = [];
  let solutionUCI = [];
  let step = 0;

  // --- UI elements ---
  const title = document.createElement("div");
  title.textContent = "Puzzle Pack";
  title.style.fontWeight = "bold";
  title.style.marginBottom = "5px";

  const infoDiv = document.createElement("div");
  infoDiv.style.marginBottom = "5px";

  const boardDiv = document.createElement("div");
  boardDiv.style.width = "350px";
  boardDiv.style.marginBottom = "10px";

  const statusDiv = document.createElement("div");
  statusDiv.style.marginBottom = "10px";

  const controlsDiv = document.createElement("div");
  controlsDiv.style.display = "flex";
  controlsDiv.style.gap = "8px";
  controlsDiv.style.marginBottom = "10px";

  const prevBtn = document.createElement("button");
  prevBtn.className = "btn btn-sm btn-secondary";
  prevBtn.textContent = "Previous";

  const nextBtn = document.createElement("button");
  nextBtn.className = "btn btn-sm btn-secondary";
  nextBtn.textContent = "Next";

  controlsDiv.append(prevBtn, nextBtn);

  container.append(title, infoDiv, boardDiv, statusDiv, controlsDiv);

  // --- Fetch PGN file ---
  fetch(url)
    .then(r => r.text())
    .then(text => {
      puzzles = parsePGNPack(text);
      if (!puzzles.length) {
        statusDiv.textContent = "No puzzles found in PGN.";
        return;
      }

      console.log("Parsed remote PGN puzzles:", puzzles.length);

      initBoard();
      loadPuzzle(0);
    })
    .catch(err => {
      console.error(err);
      statusDiv.textContent = "Failed to load PGN file.";
    });

  // --- Initialize board once ---
  function initBoard() {
    board = Chessboard(boardDiv, {
      draggable: true,
      position: "start",
      pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

      onDragStart: (_, piece) => {
        if (!game) return false;
        if (game.turn() === "w" && piece.startsWith("b")) return false;
        if (game.turn() === "b" && piece.startsWith("w")) return false;
      },

      onDrop: (source, target) => {
        if (!game) return "snapback";

        const move = game.move({ from: source, to: target, promotion: "q" });
        if (!move) return "snapback";

        const played = move.from + move.to + (move.promotion || "");
        const expected = solutionUCI[step];

        if (played !== expected) {
          statusDiv.textContent = "❌ Wrong move";
          game.undo();
          return "snapback";
        }

        statusDiv.textContent = "✅ Correct";
        step++;

        // Opponent reply if exists
        if (step < solutionUCI.length) {
          const replySAN = sanMoves[step];
          const reply = game.move(replySAN, { sloppy: true });
          if (reply) {
            step++;
            setTimeout(() => board.position(game.fen()), 150);
          }
        }

        if (step >= solutionUCI.length) {
          statusDiv.textContent = "🎉 Puzzle solved!";
        }

        return true;
      },

      onSnapEnd: () => {
        if (game) board.position(game.fen());
      }
    });

    // Navigation
    prevBtn.onclick = () => {
      if (!puzzles.length) return;
      currentIndex = (currentIndex - 1 + puzzles.length) % puzzles.length;
      loadPuzzle(currentIndex);
    };

    nextBtn.onclick = () => {
      if (!puzzles.length) return;
      currentIndex = (currentIndex + 1) % puzzles.length;
      loadPuzzle(currentIndex);
    };
  }

  // --- Load puzzle by index ---
  function loadPuzzle(index) {
    const p = puzzles[index];
    if (!p) return;

    infoDiv.textContent = `Puzzle ${index + 1} / ${puzzles.length}`;
    statusDiv.textContent = "Your move...";

    game = new Chess(p.fen);
    sanMoves = p.moves.slice();
    solutionUCI = buildUCISolution(p.fen, sanMoves);
    step = 0;

    board.position(p.fen);
  }
}

// ======================================================================
// PGN PACK PARSER (Option A: each puzzle is a separate PGN game)
// - We support multi-game PGN files like:
//   [Event "Puzzle 1"]
//   [FEN "...."]
//   ...
//   1. Qh4 ...
//
//   [Event "Puzzle 2"]
//   [FEN "...."]
//   ...
//   1. Qg7+ ...
// ======================================================================
function parsePGNPack(text) {
  const puzzles = [];
  const cleaned = text.replace(/\r/g, "");

  let games;

  // Prefer splitting by [Event] (standard multi-game PGN)
  if (/\[Event\b/i.test(cleaned)) {
    games = cleaned.split(/\n\n(?=\[Event\b)/g);
  } else {
    // Fallback: split by FEN if no [Event] tags
    games = cleaned.split(/\n\n(?=\[FEN\b)/g);
  }

  for (const rawGame of games) {
    const gameText = rawGame.trim();
    if (!gameText) continue;

    const fenMatch = gameText.match(/\[FEN\s+"([^"]+)"\]/i);
    if (!fenMatch) continue;

    const fen = fenMatch[1].trim();
    let moves = [];

    const tagMatch = gameText.match(/\[(Moves|Solution)\s+"([^"]+)"\]/i);
    if (tagMatch) {
      moves = pgnToSanArray(tagMatch[2]);
    } else {
      // Extract movetext body (remove all [Tags])
      const body = gameText.replace(/\[[^\]]+\]/g, " ");
      moves = pgnToSanArray(body);
    }

    if (!moves.length) continue;

    puzzles.push({ fen, moves });
  }

  return puzzles;
}
