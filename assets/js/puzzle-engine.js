(function () {
  "use strict";

  if (typeof Chess !== "function" || typeof Chessboard !== "function") return;

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("puzzle").forEach(initPuzzle);
  });

  /* -------------------------------------------------- */
  /* Helpers                                            */
  /* -------------------------------------------------- */

  const PIECE_THEME =
    "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

  function stripFigurines(s) {
    return (s || "").replace(/[♔♕♖♗♘♙]/g, "");
  }

  function normalizeSAN(s) {
    return (s || "").replace(/[+#?!]/g, "");
  }

  function parseMoves(text) {
    return text
      .replace(/\[[^\]]*]/g, " ")
      .replace(/\{[^}]*}/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b\d+\.(\.\.)?/g, " ")
      .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  function solverIndexes(moves) {
    return moves.map((_, i) => i).filter(i => i % 2 === 0);
  }

  /* -------------------------------------------------- */
  /* UI helpers                                         */
  /* -------------------------------------------------- */

  function statusRow() {
    const row = document.createElement("div");
    row.className = "jc-status-row";

    const turn = document.createElement("span");
    const feedback = document.createElement("span");
    const counter = document.createElement("span");
    const controls = document.createElement("span");

    row.append(turn, feedback, counter, controls);
    return { row, turn, feedback, counter, controls };
  }

  function updateTurn(el, game) {
    el.textContent =
      game.turn() === "w" ? "⚐ White to move" : "⚑ Black to move";
  }

  /* -------------------------------------------------- */
  /* Puzzle init                                        */
  /* -------------------------------------------------- */

  function initPuzzle(node) {
    const raw = stripFigurines(node.textContent);
    const wrap = document.createElement("div");
    wrap.className = "jc-puzzle-wrapper";
    node.replaceWith(wrap);

    const fen = raw.match(/FEN:\s*([^\n]+)/i)?.[1]?.trim();
    const moves = raw.match(/Moves:\s*([^\n]+)/i)?.[1];
    const url = raw.match(/PGN:\s*(https?:\/\/\S+)/i)?.[1];

    if (fen && moves) {
      renderLocalPuzzle(wrap, fen, parseMoves(moves));
      return;
    }

    if (url) {
      renderRemotePuzzle(wrap, url);
      return;
    }

    wrap.textContent = "❌ Invalid <puzzle> block.";
  }

  /* -------------------------------------------------- */
  /* Local puzzle                                       */
  /* -------------------------------------------------- */

  function renderLocalPuzzle(container, fen, allMoves) {
    const game = new Chess(fen);
    const solver = solverIndexes(allMoves).map(i => allMoves[i]);
    let step = 0;

    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";
    container.appendChild(boardDiv);

    const ui = statusRow();
    container.appendChild(ui.row);

    const board = Chessboard(boardDiv, {
      position: fen,
      draggable: true,
      pieceTheme: PIECE_THEME,
      onDrop: (s, t) => onUserMove(s, t)
    });

    updateTurn(ui.turn, game);

    function onUserMove(src, dst) {
      const mv = game.move({ from: src, to: dst, promotion: "q" });
      if (!mv) return "snapback";

      if (normalizeSAN(mv.san) !== normalizeSAN(solver[step])) {
        game.undo();
        ui.feedback.textContent = "❌ Wrong";
        updateTurn(ui.turn, game);
        return "snapback";
      }

      ui.feedback.textContent = "✅ Correct";
      step++;

      playOpponent();
    }

    function playOpponent() {
      if (step >= allMoves.length) return;

      setTimeout(() => {
        game.move(allMoves[step], { sloppy: true });
        board.position(game.fen(), true); // ✅ animation ONLY here
        step++;
        updateTurn(ui.turn, game);
      }, 300);
    }
  }

  /* -------------------------------------------------- */
  /* Remote PGN puzzle                                  */
  /* -------------------------------------------------- */

  function renderRemotePuzzle(container, url) {
    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";
    container.appendChild(boardDiv);

    const ui = statusRow();
    ui.feedback.textContent = "Loading puzzle pack…";
    container.appendChild(ui.row);

    const board = Chessboard(boardDiv, {
      position: "start",
      draggable: true,
      pieceTheme: PIECE_THEME
    });

    fetch(url)
      .then(r => r.text())
      .then(text => {
        const games = text.split(/\[Event\b/).slice(1);
        const puzzles = games
          .map(g => {
            const fen = g.match(/\[FEN\s+"([^"]+)"/)?.[1];
            const moves = parseMoves(g);
            return fen && moves.length ? { fen, moves } : null;
          })
          .filter(Boolean);

        let index = 0;
        load(index);

        function load(i) {
          const p = puzzles[i];
          if (!p) return;

          const game = new Chess(p.fen);
          const solver = solverIndexes(p.moves).map(j => p.moves[j]);
          let step = 0;

          board.position(game.fen(), false);
          ui.feedback.textContent = "";
          ui.counter.textContent = `Puzzle ${i + 1} / ${puzzles.length}`;
          updateTurn(ui.turn, game);

          board.config.onDrop = (s, t) => {
            const mv = game.move({ from: s, to: t, promotion: "q" });
            if (!mv) return "snapback";

            if (normalizeSAN(mv.san) !== normalizeSAN(solver[step])) {
              game.undo();
              ui.feedback.textContent = "❌ Wrong";
              updateTurn(ui.turn, game);
              return "snapback";
            }

            ui.feedback.textContent = "✅ Correct";
            step++;
            playOpponent();
          };

          function playOpponent() {
            if (step >= p.moves.length) return;
            setTimeout(() => {
              game.move(p.moves[step], { sloppy: true });
              board.position(game.fen(), true);
              step++;
              updateTurn(ui.turn, game);
            }, 300);
          }
        }
      })
      .catch(() => {
        ui.feedback.textContent = "❌ Failed to load PGN.";
      });
  }
})();
