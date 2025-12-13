(function () {
  "use strict";

  if (typeof Chess !== "function" || typeof Chessboard !== "function") return;

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("puzzle").forEach(initPuzzle);
  });

  function initPuzzle(node) {
    const raw = (node.textContent || "").trim();
    const fenMatch = raw.match(/FEN:\s*([^\n]+)/i);
    const movesMatch = raw.match(/Moves:\s*([^\n]+)/i);

    if (!fenMatch || !movesMatch) {
      node.textContent = "❌ Invalid <puzzle> block.";
      return;
    }

    const fen = fenMatch[1].trim();
    const allMoves = movesMatch[1].trim().split(/\s+/);

    const wrapper = document.createElement("div");
    wrapper.className = "jc-puzzle-wrapper";

    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const status = document.createElement("div");
    status.className = "jc-status";

    const turnEl = document.createElement("span");
    turnEl.className = "jc-turn";

    const feedback = document.createElement("span");
    feedback.className = "jc-feedback";

    status.append(turnEl, feedback);
    wrapper.append(boardDiv, status);
    node.replaceWith(wrapper);

    const game = new Chess(fen);

    let solverIndex = 0;
    let autoIndex = 1;
    let solved = false;

    let board;

    requestAnimationFrame(() => {
      board = Chessboard(boardDiv, {
        position: fen,
        draggable: true,
        pieceTheme:
          "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
        onDrop: onUserMove
      });
      updateTurn();
    });

    function normalizeSAN(s) {
      return s.replace(/[+#?!]/g, "");
    }

    function onUserMove(from, to) {
      if (solved) return "snapback";

      const mv = game.move({ from, to, promotion: "q" });
      if (!mv) return "snapback";

      if (
        normalizeSAN(mv.san) !== normalizeSAN(allMoves[solverIndex])
      ) {
        game.undo();
        feedback.textContent = "❌ Wrong move";
        updateTurn();
        return "snapback";
      }

      feedback.textContent = "✅ Correct";
      solverIndex += 2;

      playOpponentMove();
      return true;
    }

    function playOpponentMove() {
      if (solverIndex - 1 >= allMoves.length) {
        solved = true;
        feedback.textContent = "🏆 Puzzle solved";
        updateTurn();
        return;
      }

      const san = allMoves[solverIndex - 1];
      const mv = game.move(san, { sloppy: true });

      if (!mv) {
        solved = true;
        feedback.textContent = "🏆 Puzzle solved";
        updateTurn();
        return;
      }

      board.position(game.fen(), true); // ✅ animated
      updateTurn();
    }

    function updateTurn() {
      if (solved) {
        turnEl.textContent = "";
        return;
      }
      turnEl.textContent =
        game.turn() === "w" ? "⚐ White to move" : "⚑ Black to move";
    }
  }
})();
