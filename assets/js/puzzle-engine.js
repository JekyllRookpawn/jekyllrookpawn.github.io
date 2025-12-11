// ----------------------------------------------------------
// CONFIG
// ----------------------------------------------------------

const PIECE_THEME = "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

// ----------------------------------------------------------
// UTILITIES
// ----------------------------------------------------------

function cleanSAN(san) {
  return san
    .replace(/^\d+\.+/, "")   // remove "1." "2..."
    .replace(/[!?]+/g, "")    // remove annotations
    .trim();
}

function isValidFEN(fen) {
  try {
    const g = new Chess(fen);
    return g.fen() === fen;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------
// PGN PARSER
// ----------------------------------------------------------

function parsePGNPuzzles(pgnText) {
  const blocks = pgnText.split(/\n\n(?=\[FEN)/g);
  const puzzles = [];

  for (const block of blocks) {
    const fenMatch = block.match(/\[FEN\s+"([^"]+)"/i);
    if (!fenMatch) continue;
    const fen = fenMatch[1].trim();
    if (!isValidFEN(fen)) continue;

    const movesTag = block.match(/\[(Moves|Solution)\s+"([^"]+)"\]/i);
    let moves = [];

    if (movesTag) {
      moves = movesTag[2].trim().split(/\s+/);
    } else {
      const body = block.replace(/\[[^\]]+\]/g, "");
      moves = body
        .replace(/\d+\.+/g, " ")
        .replace(/[\?!]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ");
    }

    if (moves.length > 0)
      puzzles.push({ fen, moves });
  }
  return puzzles;
}

// ----------------------------------------------------------
// PUZZLE RENDERING ENGINE
// ----------------------------------------------------------

function renderPuzzle(container, fen, moves) {
  const game = new Chess(fen);

  // convert SAN → UCI solution
  const puzzleUCI = [];
  for (let san of moves) {
    const cleaned = cleanSAN(san);
    const moveObj = game.move(cleaned, { sloppy: true });
    if (!moveObj) continue;
    puzzleUCI.push(moveObj.from + moveObj.to + (moveObj.promotion || ""));
    game.undo();
  }

  // HTML UI
  const boardDiv = document.createElement("div");
  boardDiv.style.width = "350px";
  boardDiv.style.marginBottom = "10px";

  const statusDiv = document.createElement("div");
  statusDiv.style.fontSize = "16px";
  statusDiv.style.marginBottom = "20px";

  container.appendChild(boardDiv);
  container.appendChild(statusDiv);

  let step = 0;

  function onDragStart(source, piece) {
    if (game.game_over()) return false;
    if (game.turn() === "w" && piece.startsWith("b")) return false;
    if (game.turn() === "b" && piece.startsWith("w")) return false;
  }

  function onDrop(source, target) {
    const move = game.move({ from: source, to: target, promotion: "q" });
    if (!move) return "snapback";

    const uci = move.from + move.to + (move.promotion || "");
    const expected = puzzleUCI[step];

    if (uci !== expected) {
      statusDiv.textContent = "❌ Wrong move.";
      game.undo();
      return "snapback";
    }

    statusDiv.textContent = "✅ Correct.";
    step++;

    if (step < puzzleUCI.length) {
      const replySAN = moves[step];
      game.move(replySAN, { sloppy: true });
      step++;
      setTimeout(() => board.position(game.fen()), 150);
    }

    if (step >= puzzleUCI.length) {
      statusDiv.textContent = "🎉 Puzzle solved!";
    }

    return true;
  }

  function onSnapEnd() {
    board.position(game.fen());
  }

  const board = Chessboard(boardDiv, {
    draggable: true,
    position: fen,
    pieceTheme: PIECE_THEME,
    onDragStart,
    onDrop,
    onSnapEnd
  });

  statusDiv.textContent = "Your move...";
}

// ----------------------------------------------------------
// PROCESS <puzzle> TAGS
// ----------------------------------------------------------

async function processPuzzles() {
  const puzzleNodes = document.querySelectorAll("puzzle");
  for (const node of puzzleNodes) {
    const text = node.textContent.trim();
    const lines = text.split("\n").map(l => l.trim());
    let fen = null;
    let moves = null;
    let pgnUrl = null;

    for (const line of lines) {
      if (line.startsWith("FEN:")) fen = line.replace("FEN:", "").trim();
      if (line.startsWith("Moves:")) moves = line.replace("Moves:", "").trim().split(/\s+/);
      if (line.startsWith("PGN:")) pgnUrl = line.replace("PGN:", "").trim();
    }

    const wrapper = document.createElement("div");
    wrapper.style.margin = "20px 0";
    node.replaceWith(wrapper);

    // CASE 1 — Direct puzzle
    if (fen && moves) {
      renderPuzzle(wrapper, fen, moves);
      continue;
    }

    // CASE 2 — Remote PGN pack
    if (pgnUrl) {
      const pgnText = await fetch(pgnUrl).then(r => r.text());
      const puzzles = parsePGNPuzzles(pgnText);
      puzzles.forEach(p => renderPuzzle(wrapper, p.fen, p.moves));
      continue;
    }

    wrapper.innerHTML = "<div style='color:red'>Invalid puzzle block.</div>";
  }
}

// ----------------------------------------------------------
// START ENGINE WHEN DOM IS READY
// ----------------------------------------------------------

document.addEventListener("DOMContentLoaded", processPuzzles);
