// ======================================================================
// JekyllChess Puzzle Engine — FIXED & HARDENED
// ======================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function" || typeof Chessboard !== "function") return;

  const PIECE_THEME =
    "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

  /* ------------------------------------------------------------------ */
  /* Safe Chessboard init (prevents error 1003)                          */
  /* ------------------------------------------------------------------ */
  function safeChessboard(el, opts, tries = 40) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if ((r.width === 0 || r.height === 0) && tries > 0) {
      return requestAnimationFrame(() =>
        safeChessboard(el, opts, tries - 1)
      );
    }
    try {
      return Chessboard(el, opts);
    } catch {
      if (tries > 0)
        requestAnimationFrame(() =>
          safeChessboard(el, opts, tries - 1)
        );
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */
  function stripFigurines(s) {
    return s.replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, "");
  }

  function parsePGNMoves(pgn) {
    return pgn
      .replace(/\[[^\]]*]/g, " ")
      .replace(/\{[^}]*}/g, " ")
      .replace(/\([^)]*?\)/g, " ")
      .replace(/\b\d+\.\.\./g, " ")
      .replace(/\b\d+\.(?:\.\.)?/g, " ")
      .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  function normalizeSAN(s) {
    return (s || "").replace(/[+#?!]/g, "");
  }

  function updateTurn(el, game, solved) {
    el.textContent = solved
      ? ""
      : game.turn() === "w"
      ? "⚐ White to move"
      : "⚑ Black to move";
  }

  function showCorrect(el) {
    el.innerHTML = `Correct <span class="jc-icon">✅</span>`;
  }
  function showWrong(el) {
    el.innerHTML = `Wrong <span class="jc-icon">❌</span>`;
  }
  function showSolved(el) {
    el.innerHTML = `Solved <span class="jc-icon">🏆</span>`;
  }

  /* ------------------------------------------------------------------ */
  /* Local Puzzle                                                       */
  /* ------------------------------------------------------------------ */
  function renderLocalPuzzle(container, fen, allMoves) {
    const game = new Chess(fen);
    const solverSide = game.turn();
    let index = 0;
    let solved = false;

    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const row = document.createElement("div");
    row.className = "jc-status-row";

    const turn = document.createElement("span");
    const feedback = document.createElement("span");

    row.append(turn, feedback);
    container.append(boardDiv, row);

    const board = safeChessboard(boardDiv, {
      draggable: true,
      position: fen,
      pieceTheme: PIECE_THEME,
      onDrop: onDrop
    });

    function sync() {
      if (board) board.position(game.fen(), false);
    }

    function onDrop(src, dst) {
      if (solved || game.turn() !== solverSide) return "snapback";

      const expected = allMoves[index];
      const mv = game.move({ from: src, to: dst, promotion: "q" });
      if (!mv) return "snapback";

      if (normalizeSAN(mv.san) !== normalizeSAN(expected)) {
        game.undo();
        sync();
        showWrong(feedback);
        return "snapback";
      }

      index++;
      sync();
      showCorrect(feedback);
      autoReply();
      return true;
    }

    function autoReply() {
      if (index >= allMoves.length) {
        solved = true;
        showSolved(feedback);
        updateTurn(turn, game, solved);
        return;
      }

      if (game.turn() === solverSide) {
        updateTurn(turn, game, solved);
        return;
      }

      const san = allMoves[index];
      setTimeout(() => {
        game.move(san, { sloppy: true });
        index++;
        sync();
        updateTurn(turn, game, solved);
      }, 150);
    }

    sync();
    updateTurn(turn, game, solved);
  }

  /* ------------------------------------------------------------------ */
  /* Remote PGN Pack                                                    */
  /* ------------------------------------------------------------------ */
  function initRemotePGNPack(container, url) {
    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const row = document.createElement("div");
    row.className = "jc-status-row";

    const turn = document.createElement("span");
    const feedback = document.createElement("span");
    const counter = document.createElement("span");

    row.append(turn, feedback, counter);
    container.append(boardDiv, row);

    feedback.textContent = "Loading puzzle pack…";

    fetch(url)
      .then(r => r.text())
      .then(txt => {
        const blocks = txt
          .split(/\[Event\b/)
          .slice(1)
          .map(b => "[Event" + b);

        const puzzles = [];
        blocks.forEach(b => {
          const fen = b.match(/\[FEN\s+"([^"]+)"/)?.[1];
          if (!fen) return;
          const moves = parsePGNMoves(b);
          if (moves.length) puzzles.push({ fen, moves });
        });

        if (!puzzles.length) {
          feedback.textContent = "❌ No puzzles found.";
          return;
        }

        let pIndex = 0,
          mIndex = 0,
          solved = false,
          game,
          solverSide,
          board;

        board = safeChessboard(boardDiv, {
          draggable: true,
          pieceTheme: PIECE_THEME,
          onDrop: onDrop
        });

        function loadPuzzle(i) {
          const p = puzzles[i];
          if (!p) return;

          pIndex = i;
          mIndex = 0;
          solved = false;

          game = new Chess(p.fen);
          solverSide = game.turn();
          board.position(game.fen(), false);
          counter.textContent = `Puzzle ${i + 1} / ${puzzles.length}`;
          feedback.textContent = "";
          updateTurn(turn, game, solved);
        }

        function onDrop(src, dst) {
          if (solved || game.turn() !== solverSide) return "snapback";

          const mv = game.move({ from: src, to: dst, promotion: "q" });
          if (!mv) return "snapback";

          if (
            normalizeSAN(mv.san) !==
            normalizeSAN(puzzles[pIndex].moves[mIndex])
          ) {
            game.undo();
            board.position(game.fen(), false);
            showWrong(feedback);
            return "snapback";
          }

          mIndex++;
          board.position(game.fen(), false);
          showCorrect(feedback);
          autoReply();
          return true;
        }

        function autoReply() {
          if (mIndex >= puzzles[pIndex].moves.length) {
            solved = true;
            showSolved(feedback);
            updateTurn(turn, game, solved);
            return;
          }

          if (game.turn() === solverSide) {
            updateTurn(turn, game, solved);
            return;
          }

          setTimeout(() => {
            game.move(puzzles[pIndex].moves[mIndex], { sloppy: true });
            mIndex++;
            board.position(game.fen(), false);
            updateTurn(turn, game, solved);
          }, 150);
        }

        loadPuzzle(0);
      })
      .catch(err => {
        feedback.textContent = "❌ Failed to load PGN.";
        console.error(err);
      });
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                               */
  /* ------------------------------------------------------------------ */
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("puzzle").forEach(node => {
      const raw = stripFigurines(node.innerHTML || "").trim();
      const wrap = document.createElement("div");
      wrap.className = "jc-puzzle-wrapper";
      node.replaceWith(wrap);

      const fen = raw.match(/FEN:\s*([^\n<]+)/i)?.[1];
      const moves = raw.match(/Moves:\s*([^\n<]+)/i)?.[1];
      const pgn = raw.match(/PGN:\s*(https?:\/\/[^\s<]+)/i)?.[1];

      if (pgn && !fen) return initRemotePGNPack(wrap, pgn);
      if (fen && moves)
        return renderLocalPuzzle(wrap, fen.trim(), moves.trim().split(/\s+/));

      wrap.textContent = "❌ Invalid puzzle block.";
    });
  });
})();
