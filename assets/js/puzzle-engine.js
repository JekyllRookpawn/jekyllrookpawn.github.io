// ======================================================================
//   SIMPLE SINGLE-PUZZLE VERSION (DEBUG MODE)
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
  const node = document.querySelector("puzzle");
  if (!node) return;

  const text = node.textContent.trim();
  const lines = text.split("\n").map(l => l.trim());

  let fen = null;
  let moves = null;

  for (let line of lines) {
    if (line.startsWith("FEN:")) fen = line.replace("FEN:", "").trim();
    if (line.startsWith("Moves:")) moves = line.replace("Moves:", "").trim().split(/\s+/);
  }

  // container where board + status go
  const wrapper = document.createElement("div");
  wrapper.style.margin = "25px 0";
  node.replaceWith(wrapper);

  if (!fen || !moves) {
    wrapper.innerHTML = "<div style='color:red'>Invalid puzzle block</div>";
    return;
  }

  renderSinglePuzzle(wrapper, fen, moves);
});

// ======================================================================
//  RENDER PUZZLE
// ======================================================================

function renderSinglePuzzle(container, fen, sanMoves) {
  const game = new Chess(fen);

  // -----------------------------
  //  Convert SAN -> UCI CORRECTLY
  // -----------------------------

  const solution = [];

  // always start from original position
  for (let san of sanMoves) {
    const cleaned = san.replace(/[!?]/g, "").trim();
    const moveObj = game.move(cleaned, { sloppy: true });

    if (!moveObj) {
      console.error("SAN cannot be parsed:", san, "in FEN:", fen);
      continue;
    }

    solution.push(moveObj.from + moveObj.to + (moveObj.promotion || ""));
    game.undo(); // go back so next SAN parses from fresh position
  }

  console.log("SAN moves:", sanMoves);
  console.log("UCI solution:", solution);

  // -----------------------------
  //  CREATE DOM
  // -----------------------------

  const boardDiv = document.createElement("div");
  boardDiv.style.width = "350px";

  const statusDiv = document.createElement("div");
  statusDiv.style.marginTop = "8px";
  statusDiv.style.fontSize = "16px";

  container.append(boardDiv, statusDiv);

  let step = 0;

  // -----------------------------
  //  INIT BOARD
  // -----------------------------

  const board = Chessboard(boardDiv, {
    draggable: true,
    position: fen,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

    onDragStart: (_, piece) => {
      // enforce side to move
      if (game.turn() === "w" && piece.startsWith("b")) return false;
      if (game.turn() === "b" && piece.startsWith("w")) return false;
    },

    onDrop: (source, target) => {
      const move = game.move({ from: source, to: target, promotion: "q" });

      if (!move) return "snapback";

      const uci = move.from + move.to + (move.promotion || "");
      const expected = solution[step];

      console.log("User played:", uci, "Expected:", expected);

      if (uci !== expected) {
        statusDiv.textContent = "❌ Wrong move";
        game.undo();
        return "snapback";
      }

      statusDiv.textContent = "✅ Correct!";
      step++;

      // Opponent reply (step 1,3,5...)
      if (step < solution.length) {
        const replySan = sanMoves[step];
        const replyMove = game.move(replySan, { sloppy: true });
        step++;
        setTimeout(() => board.position(game.fen()), 150);
      }

      if (step >= solution.length) {
        statusDiv.textContent = "🎉 Puzzle solved!";
      }

      return true;
    },

    onSnapEnd: () => board.position(game.fen())
  });

  statusDiv.textContent = "Your move...";
}
