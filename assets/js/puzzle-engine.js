// ======================================================================
// JekyllChess Puzzle Engine — STABLE
// Local puzzles + Remote PGN packs (SetUp FEN-based)
// ======================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function" || typeof Chessboard !== "function") {
    console.warn("Puzzle engine: chess.js or chessboard.js missing");
    return;
  }

  const PIECE_THEME =
    "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

  // 🔁 Set this to a PGN URL when needed
  const REMOTE_PGN_URL = null;
  // e.g. "https://example.com/puzzles.pgn"

  // --------------------------------------------------
  // Utilities
  // --------------------------------------------------
  const strip = (s) =>
    String(s || "").replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, "");

  const normalizeSAN = (s) => String(s || "").replace(/[+#?!]/g, "");

  const parseMovesLine = (t) =>
    String(t || "").trim().split(/\s+/).filter(Boolean);

  const parsePGNMoves = (pgn) =>
    String(pgn)
      .replace(/\[[^\]]*]/g, " ")
      .replace(/\{[^}]*}/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b\d+\.\.\./g, " ")
      .replace(/\b\d+\.(?:\.\.)?/g, " ")
      .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);

  function safeBoard(el, cfg, tries = 60) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if ((r.width === 0 || r.height === 0) && tries > 0) {
      requestAnimationFrame(() => safeBoard(el, cfg, tries - 1));
      return null;
    }
    try {
      return Chessboard(el, cfg);
    } catch {
      if (tries > 0)
        requestAnimationFrame(() => safeBoard(el, cfg, tries - 1));
      return null;
    }
  }

  function renderLocalPuzzle(container, fen, moves) {
    const game = new Chess(fen);
    const solverSide = game.turn();
    let idx = 0;
    let solved = false;
    let awaiting = true;

    const boardEl = document.createElement("div");
    const status = document.createElement("div");
    const turn = document.createElement("span");
    const msg = document.createElement("span");

    status.style.display = "flex";
    status.style.gap = "12px";

    status.append(turn, msg);
    container.append(boardEl, status);

    let board = safeBoard(boardEl, {
      draggable: true,
      position: fen,
      pieceTheme: PIECE_THEME,
      onDrop: (f, t) => (userMove(f, t) ? true : "snapback"),
    });

    function sync() {
      if (board) board.position(game.fen(), false);
    }

    function updateTurn() {
      if (solved) turn.textContent = "";
      else turn.textContent =
        game.turn() === "w" ? "⚐ White to move" : "⚑ Black to move";
    }

    function userMove(from, to) {
      if (!awaiting || solved || game.turn() !== solverSide) return false;

      const expected = moves[idx];
      const mv = game.move({ from, to, promotion: "q" });
      if (!mv || normalizeSAN(mv.san) !== normalizeSAN(expected)) {
        game.undo();
        sync();
        msg.textContent = "❌ Wrong";
        updateTurn();
        return false;
      }

      idx++;
      sync();
      msg.textContent = "✅ Correct";
      awaiting = false;
      updateTurn();

      setTimeout(reply, 150);
      return true;
    }

    function reply() {
      if (idx >= moves.length) {
        solved = true;
        msg.textContent = "🏆 Solved";
        updateTurn();
        return;
      }

      const mv = game.move(moves[idx], { sloppy: true });
      idx++;

      if (mv && board && board.move) {
        board.move(mv.from + "-" + mv.to);
        setTimeout(sync, 220);
      } else sync();

      awaiting = true;
      updateTurn();
    }

    (function wait() {
      if (board) {
        sync();
        updateTurn();
      } else requestAnimationFrame(wait);
    })();
  }

  // --------------------------------------------------
  // Remote PGN support (FEN-based SetUp puzzles)
  // --------------------------------------------------
  function loadRemotePGN(url, container) {
    fetch(url)
      .then((r) => r.text())
      .then((txt) => {
        const games = txt.split(/\n(?=\[Event\b)/g);
        let index = 0;

        function loadGame(i) {
          const g = games[i];
          if (!g) return;

          const fen = g.match(/\[FEN\s+"([^"]+)"/i)?.[1];
          if (!fen) return;

          const moves = parsePGNMoves(g);
          container.innerHTML = "";
          renderLocalPuzzle(container, fen, moves);
        }

        loadGame(0);
      });
  }

  // --------------------------------------------------
  // Entry
  // --------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("puzzle").forEach((el) => {
      const raw = strip(el.textContent);
      const box = document.createElement("div");
      el.replaceWith(box);

      const fen = raw.match(/FEN:\s*([^\n]+)/i)?.[1];
      const moves = raw.match(/Moves:\s*([^\n]+)/i)?.[1];

      if (fen && moves) {
        renderLocalPuzzle(box, fen.trim(), parseMovesLine(moves));
      } else if (REMOTE_PGN_URL) {
        loadRemotePGN(REMOTE_PGN_URL, box);
      } else {
        box.textContent = "❌ Invalid puzzle block.";
      }
    });
  });
})();