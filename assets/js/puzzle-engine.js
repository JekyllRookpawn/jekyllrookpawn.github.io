// ======================================================================
//   SINGLE-PUZZLE ENGINE — FIGURINE-SAFE, JEKYLL-SAFE VERSION
//   Supports exactly this Markdown format:
//   <puzzle>
//   FEN: ...
//   Moves: move1 move2 move3 ...
//   </puzzle>
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("Puzzle engine loaded.");

  const node = document.querySelector("puzzle");
  if (!node) {
    console.log("No <puzzle> found.");
    return;
  }

  // ------------------------------------------------------------------
  // Extract raw HTML content (Jekyll may insert <p>, <br>, whitespace)
  // ------------------------------------------------------------------
  let html = node.innerHTML;
  console.log("Raw puzzle innerHTML:", html);

  // ------------------------------------------------------------------
  // Remove figurine symbols (produced by figurine.js or fonts)
  // ------------------------------------------------------------------
  html = html.replace(/[♔♕♖♗♘♙]/g, "");

  // ------------------------------------------------------------------
  // Extract FEN and Moves using HTML-safe regex
  // ------------------------------------------------------------------
  const fenMatch = html.match(/FEN:\s*([^<\n\r]+)/i);
  const movesMatch = html.match(/Moves:\s*([^<\n\r]+)/i);

  if (!fenMatch || !movesMatch) {
    console.log("Failed to extract FEN or Moves.");

    const wrapper = document.createElement("div");
    wrapper.style.margin = "20px 0";
    wrapper.innerHTML = "<div style='color:red'>Puzzle block invalid</div>";
    node.replaceWith(wrapper);
    return;
  }

  const fen = fenMatch[1].trim();
  const movesLine = movesMatch[1].trim().replace(/\s+/g, " ");
  const sanMoves = movesLine.split(" ");

  console.log("Extracted FEN:", fen);
  console.log("Extracted SAN moves:", sanMoves);

  // ------------------------------------------------------------------
  // Replace <puzzle> with container
  // ------------------------------------------------------------------
  const wrapper = document.createElement("div");
  wrapper.style.margin = "20px 0";
  node.replaceWith(wrapper);

  // Render the puzzle
  renderPuzzle(wrapper, fen, sanMoves);
});

// ======================================================================
//   RENDER ONE PUZZLE
// ======================================================================

function renderPuzzle(container, fen, sanMoves) {
  console.log("Rendering puzzle with FEN:", fen);

  // ==================================================================
  //   Convert SAN → UCI (CORRECT PROGRESSION — NO UNDO)
  // ==================================================================
  const gameForConversion = new Chess(fen);
  const solutionUCI = [];

  for (let san of sanMoves) {
    const cleaned = san.replace(/[!?]/g, "").trim();
    console.log("Parsing SAN:", san, "→ cleaned:", cleaned);

    const moveObj = gameForConversion.move(cleaned, { sloppy: true });

    if (!moveObj) {
      console.error("Cannot parse SAN move:", san);
      break; // stop conversion if move fails
    }

    const uci = moveObj.from + moveObj.to + (moveObj.promotion || "");
    solutionUCI.push(uci);
  }

  console.log("FINAL UCI solution:", solutionUCI);

  // ==================================================================
  //   Now create the interactive puzzle using a fresh game instance
  // ==================================================================
  const game = new Chess(fen);

  // UI Elements
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
    pieceTheme:
      "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

    onDragStart: (_, piece) => {
      if (game.turn() === "w" && piece.startsWith("b")) return false;
      if (game.turn() === "b" && piece.startsWith("w")) return false;
    },

    onDrop: (source, target) => {
      console.log("DROP:", source, "→", target);

      const move = game.move({ from: source, to: target, promotion: "q" });
      if (!move) {
        console.log("Illegal move");
        return "snapback";
      }

      const playedUCI = move.from + move.to + (move.promotion || "");
      const expectedUCI = solutionUCI[step];

      console.log("Played:", playedUCI, "Expected:", expectedUCI);

      if (playedUCI !== expectedUCI) {
        statusDiv.textContent = "❌ Wrong move";
        game.undo();
        return "snapback";
      }

      statusDiv.textContent = "✅ Correct";
      step++;

      // Black's reply (move 1.5, 2.5, etc.)
      if (step < solutionUCI.length) {
        const replySAN = sanMoves[step];
        console.log("Black reply:", replySAN);

        game.move(replySAN, { sloppy: true });
        step++;

        setTimeout(() => board.position(game.fen()), 150);
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
