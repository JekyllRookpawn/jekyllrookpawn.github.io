// ======================================================================
//   SIMPLE SINGLE-PUZZLE ENGINE FOR JEKYLL
//   <puzzle>
//   FEN: ...
//   Moves: ...
//   </puzzle>
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("Puzzle engine loaded.");

  // Only handle the first <puzzle> for now
  const node = document.querySelector("puzzle");
  if (!node) {
    console.log("No <puzzle> element found on page.");
    return;
  }

  // Jekyll may inject <p>, <br>, etc. inside <puzzle>.
  // We'll parse from innerHTML using regex.
  const rawHtml = node.innerHTML;
  console.log("Raw puzzle innerHTML:", rawHtml);

  // Grab the text after 'FEN:' up to the next tag or newline
  const fenMatch = rawHtml.match(/FEN:\s*([^<\n\r]+)/i);
  const movesMatch = rawHtml.match(/Moves:\s*([^<\n\r]+)/i);

  if (!fenMatch || !movesMatch) {
    console.log("FEN or Moves not found via regex.");
    const wrapper = document.createElement("div");
    wrapper.style.margin = "20px 0";
    wrapper.innerHTML = "<div style='color:red'>Puzzle block invalid</div>";
    node.replaceWith(wrapper);
    return;
  }

  const fen = fenMatch[1].trim().replace(/\s+/g, " ");
  const movesLine = movesMatch[1].trim().replace(/\s+/g, " ");
  const sanMoves = movesLine.split(" ");

  console.log("Extracted FEN:", fen);
  console.log("Extracted SAN moves:", sanMoves);

  // Replace <puzzle> with a wrapper div
  const wrapper = document.createElement("div");
  wrapper.style.margin = "20px 0";
  node.replaceWith(wrapper);

  renderSinglePuzzle(wrapper, fen, sanMoves);
});

// ======================================================================
//   RENDER ONE PUZZLE
// ======================================================================

function renderSinglePuzzle(container, fen, sanMoves) {
  console.log("renderSinglePuzzle called with FEN:", fen);
  const convertGame = new Chess(fen);

  // Convert SAN → UCI using a separate game
  const solutionUCI = [];

  for (let san of sanMoves) {
    const cleaned = san.replace(/[!?]/g, "").trim();
    if (!cleaned) continue;

    const moveObj = convertGame.move(cleaned, { sloppy: true });
    if (!moveObj) {
      console.error("Cannot parse SAN move:", san, "in FEN:", fen);
      continue;
    }
    const uci = moveObj.from + moveObj.to + (moveObj.promotion || "");
    solutionUCI.push(uci);
  }

  console.log("Solution UCI sequence:", solutionUCI);

  // This game is used for actual play
  const game = new Chess(fen);

  // UI elements
  const boardDiv = document.createElement("div");
  boardDiv.style.width = "350px";
  const statusDiv = document.createElement("div");
  statusDiv.style.marginTop = "8px";
  statusDiv.style.fontSize = "16px";

  container.append(boardDiv, statusDiv);

  let step = 0;

  const board = Chessboard(boardDiv, {
    draggable: true,
    position: fen,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

    onDragStart: (_, piece) => {
      console.log("onDragStart fired.");
      if (game.game_over()) return false;
      if (game.turn() === "w" && piece.startsWith("b")) return false;
      if (game.turn() === "b" && piece.startsWith("w")) return false;
    },

    onDrop: (source, target) => {
      console.log("onDrop fired. Source:", source, "Target:", target);

      const move = game.move({ from: source, to: target, promotion: "q" });
      if (!move) {
        console.log("Illegal move.");
        return "snapback";
      }

      const uci = move.from + move.to + (move.promotion || "");
      console.log("User played UCI:", uci);

      const expected = solutionUCI[step];
      console.log("Expected UCI:", expected);

      if (uci !== expected) {
        statusDiv.textContent = "❌ Wrong move";
        game.undo();
        return "snapback";
      }

      statusDiv.textContent = "✅ Correct";
      step++;

      // Opponent reply (odd indices: 1,3,5,...)
      if (step < solutionUCI.length) {
        const replySAN = sanMoves[step];
        console.log("Opponent reply SAN:", replySAN);
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
      console.log("onSnapEnd fired.");
      board.position(game.fen());
    }
  });

  statusDiv.textContent = "Your move...";
}
