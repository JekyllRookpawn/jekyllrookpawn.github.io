document.addEventListener("DOMContentLoaded", () => {
  console.log("Puzzle engine loaded.");

  const node = document.querySelector("puzzle");
  if (!node) {
    console.log("No <puzzle> found on page.");
    return;
  }

  // Jekyll may insert HTML inside <puzzle>, so extract ONLY text.
  let raw = node.innerText || node.textContent || "";
  raw = raw.replace(/\r/g, "").replace(/\u00A0/g, " ").trim();

  console.log("Raw puzzle block:", raw);

  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);

  let fen = null;
  let sanMoves = null;

  for (let line of lines) {
    if (line.startsWith("FEN:")) {
      fen = line.replace("FEN:", "").trim();
    }
    if (line.startsWith("Moves:")) {
      sanMoves = line.replace("Moves:", "").trim().split(/\s+/);
    }
  }

  console.log("Extracted FEN:", fen);
  console.log("Extracted SAN moves:", sanMoves);

  // Replace <puzzle> with a wrapper div
  const wrapper = document.createElement("div");
  wrapper.style.margin = "20px 0";
  node.replaceWith(wrapper);

  if (!fen || !sanMoves) {
    wrapper.innerHTML = "<div style='color:red'>Puzzle block invalid</div>";
    return;
  }

  renderSinglePuzzle(wrapper, fen, sanMoves);
});


// ======================================================================
//  RENDER PUZZLE
// ======================================================================

function renderSinglePuzzle(container, fen, sanMoves) {
  console.log("renderSinglePuzzle() called.");

  const game = new Chess(fen);

  console.log("Initial FEN validated, creating board...");

  // Convert SAN → UCI
  const solution = [];

  for (let san of sanMoves) {
    let clean = san.replace(/[!?]/g, "");

    console.log("Parsing SAN:", san, "Cleaned:", clean);

    const moveObj = game.move(clean, { sloppy: true });

    if (!moveObj) {
      console.error("SAN move could NOT be parsed:", san);
      continue;
    }

    const uci = moveObj.from + moveObj.to + (moveObj.promotion || "");
    solution.push(uci);

    game.undo();
  }

  console.log("Final UCI solution array:", solution);

  // Create UI
  const boardDiv = document.createElement("div");
  boardDiv.style.width = "350px";
  container.appendChild(boardDiv);

  const statusDiv = document.createElement("div");
  statusDiv.style.marginTop = "8px";
  statusDiv.style.fontSize = "16px";
  container.appendChild(statusDiv);

  let step = 0;

  // Create board
  const board = Chessboard(boardDiv, {
    draggable: true,
    position: fen,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

    onDragStart: (_, piece) => {
      console.log("onDragStart fired.");
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

      const expected = solution[step];
      console.log("Expected UCI:", expected);

      if (uci !== expected) {
        statusDiv.textContent = "❌ Wrong move";
        game.undo();
        return "snapback";
      }

      statusDiv.textContent = "✅ Correct";
      step++;

      // Opponent reply
      if (step < solution.length) {
        const replySAN = sanMoves[step];
        console.log("Opponent reply SAN:", replySAN);

        const reply = game.move(replySAN, { sloppy: true });

        step++;
        setTimeout(() => board.position(game.fen()), 150);
      }

      if (step >= solution.length) {
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