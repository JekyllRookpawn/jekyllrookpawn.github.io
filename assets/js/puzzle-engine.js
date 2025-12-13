// ======================================================================
// JekyllChess Puzzle Engine — patched (local + remote, opponent auto-move)
// - Fixes: turn display on load, opponent auto-move, capture ghost pieces
// - Animations: ONLY for auto-played opponent moves
// - Prevents Chessboard error 1003 via safeChessboard
// ======================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") {
    console.warn("puzzle-engine.js: chess.js missing");
    return;
  }
  if (typeof Chessboard !== "function") {
    console.warn("puzzle-engine.js: chessboard.js missing");
    return;
  }

  const PIECE_THEME =
    "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

  // --- chessboard.js 1003 prevention ----------------------------------------
  function safeChessboard(targetEl, options, tries = 40) {
    const el = targetEl;
    if (!el) {
      if (tries > 0) requestAnimationFrame(() => safeChessboard(targetEl, options, tries - 1));
      return null;
    }

    const rect = el.getBoundingClientRect();
    if ((rect.width <= 0 || rect.height <= 0) && tries > 0) {
      requestAnimationFrame(() => safeChessboard(targetEl, options, tries - 1));
      return null;
    }

    try {
      return Chessboard(el, options);
    } catch (err) {
      if (tries > 0) {
        requestAnimationFrame(() => safeChessboard(targetEl, options, tries - 1));
        return null;
      }
      console.warn("puzzle-engine.js: Chessboard init failed", err);
      return null;
    }
  }

  // --- helpers ---------------------------------------------------------------
  function stripFigurines(s) {
    return String(s || "").replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, "");
  }

  function parseMovesLine(movesText) {
    return String(movesText || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function parsePGNMoves(pgnText) {
    return String(pgnText || "")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\{[^}]*\}/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b\d+\.\.\./g, " ")
      .replace(/\b\d+\.(?:\.\.)?/g, " ")
      .replace(/\b(1-0|0-1|1\/2-1\/2|½-½|\*)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  function normalizeSAN(san) {
    // remove check/mate/annotations for comparison
    return String(san || "").replace(/[+#?!]/g, "");
  }

  function showCorrect(el) {
    el.innerHTML = `✅ Correct`;
  }
  function showWrong(el) {
    el.innerHTML = `❌ Wrong`;
  }
  function showSolved(el) {
    el.innerHTML = `🏆 Solved`;
  }

  function setInlineRow(row) {
    // make it robust even if CSS is missing/broken
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.flexWrap = "nowrap";
    row.style.whiteSpace = "nowrap";
  }

  function updateTurn(el, game, solved) {
    if (!el) return;
    if (solved) {
      el.textContent = "";
      return;
    }
    el.textContent = game.turn() === "w" ? "⚐ White to move" : "⚑ Black to move";
  }

  function makeUI(container, { withControls, withCounter } = {}) {
    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const statusRow = document.createElement("div");
    statusRow.className = "jc-status-row";
    setInlineRow(statusRow);

    const turnDiv = document.createElement("span");
    turnDiv.className = "jc-turn";

    const feedback = document.createElement("span");
    feedback.className = "jc-feedback";

    statusRow.append(turnDiv, feedback);

    let counter = null;
    if (withCounter) {
      counter = document.createElement("span");
      counter.className = "jc-counter";
      statusRow.append(counter);
    }

    let controls = null;
    let prevBtn = null;
    let nextBtn = null;

    if (withControls) {
      controls = document.createElement("span");
      controls.className = "jc-controls";
      controls.style.display = "inline-flex";
      controls.style.gap = "6px";

      prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.textContent = "↶";

      nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.textContent = "↷";

      controls.append(prevBtn, nextBtn);
      statusRow.append(controls);
    }

    container.append(boardDiv, statusRow);

    return { boardDiv, statusRow, turnDiv, feedback, counter, prevBtn, nextBtn };
  }

  function syncBoard(board, game, animate) {
    if (!board || typeof board.position !== "function") return;
    // IMPORTANT: always sync from FEN to avoid ghost pieces.
    board.position(game.fen(), !!animate);
  }

  // --- local puzzle ----------------------------------------------------------
  function renderLocalPuzzle(container, fen, allMoves) {
    const game = new Chess(fen);
    const solverSide = game.turn(); // side to move initially is the user/solver
    let moveIndex = 0;
    let solved = false;
    let busy = false; // blocks inputs during opponent auto-move

    const ui = makeUI(container, { withControls: false, withCounter: false });

    let board = null;
    board = safeChessboard(ui.boardDiv, {
      draggable: true,
      position: fen,
      pieceTheme: PIECE_THEME,
      onDrop: (src, dst) => (playUserMove(src, dst) ? true : "snapback")
    });

    function ensureReadyThenInit() {
      if (!board || typeof board.position !== "function") {
        requestAnimationFrame(ensureReadyThenInit);
        return;
      }
      // show turn immediately on load
      updateTurn(ui.turnDiv, game, solved);
      ui.feedback.textContent = "";
      syncBoard(board, game, false);
    }
    ensureReadyThenInit();

    function playUserMove(src, dst) {
      if (solved || busy) return false;

      // User should only move when it's solverSide's turn
      if (game.turn() !== solverSide) return false;

      const expected = allMoves[moveIndex];
      if (!expected) return false;

      const mv = game.move({ from: src, to: dst, promotion: "q" });
      if (!mv) return false;

      // verify correctness
      if (normalizeSAN(mv.san) !== normalizeSAN(expected)) {
        game.undo();
        showWrong(ui.feedback);
        updateTurn(ui.turnDiv, game, solved);
        syncBoard(board, game, false);
        return false;
      }

      // correct user move
      moveIndex++;
      showCorrect(ui.feedback);
      updateTurn(ui.turnDiv, game, solved);
      syncBoard(board, game, false); // user move: no animation

      // auto-play opponent if needed
      autoOpponentMove();
      return true;
    }

    function autoOpponentMove() {
      if (moveIndex >= allMoves.length) {
        solved = true;
        showSolved(ui.feedback);
        updateTurn(ui.turnDiv, game, solved);
        return;
      }

      // if it's still solverSide to move, we wait for the user
      if (game.turn() === solverSide) {
        updateTurn(ui.turnDiv, game, solved);
        return;
      }

      // opponent to move: play exactly one move, animate it
      const san = allMoves[moveIndex];
      if (!san) return;

      busy = true;
      updateTurn(ui.turnDiv, game, solved);

      setTimeout(() => {
        const mv = game.move(san, { sloppy: true });
        if (!mv) {
          // if PGN is inconsistent, just mark solved to prevent deadlock
          solved = true;
          showSolved(ui.feedback);
          updateTurn(ui.turnDiv, game, solved);
          busy = false;
          return;
        }

        moveIndex++;
        // opponent move: animate ONLY here
        syncBoard(board, game, true);

        // now back to user
        busy = false;

        if (moveIndex >= allMoves.length) {
          solved = true;
          showSolved(ui.feedback);
        }
        updateTurn(ui.turnDiv, game, solved);
      }, 0);
    }
  }

  // --- remote pack -----------------------------------------------------------
  function initRemotePGNPack(container, url) {
    const ui = makeUI(container, { withControls: true, withCounter: true });

    ui.feedback.textContent = "Loading puzzle pack…";

    // show an empty board immediately while loading
    let board = null;
    board = safeChessboard(ui.boardDiv, {
      draggable: true,
      position: "start",
      pieceTheme: PIECE_THEME,
      onDrop: () => "snapback"
    });

    let puzzles = [];
    let puzzleIndex = 0;
    let moveIndex = 0;
    let game = null;
    let allMoves = null;
    let solverSide = "w";
    let solved = false;
    let busy = false;

    function updateCounter() {
      if (!ui.counter) return;
      ui.counter.textContent = puzzles.length
        ? `Puzzle ${puzzleIndex + 1} / ${puzzles.length}`
        : "";
    }

    function loadPuzzle(i) {
      if (!puzzles.length) return;
      if (i < 0 || i >= puzzles.length) return;

      puzzleIndex = i;
      game = new Chess(puzzles[i].fen);
      allMoves = puzzles[i].all;
      solverSide = game.turn();
      moveIndex = 0;
      solved = false;
      busy = false;

      ui.feedback.textContent = "";
      updateCounter();
      updateTurn(ui.turnDiv, game, solved);

      // board may still be initializing; wait then sync
      const syncWhenReady = () => {
        if (board && typeof board.position === "function") {
          syncBoard(board, game, false);
        } else {
          requestAnimationFrame(syncWhenReady);
        }
      };
      syncWhenReady();

      // attach the correct onDrop handler now that we have puzzle state
      // chessboard.js doesn't let us mutate onDrop; easiest is to keep one handler
      // that calls a variable function.
      currentDropHandler = playUserMove;
    }

    let currentDropHandler = () => false;

    // re-init board with a stable onDrop that delegates
    const rebindBoard = () => {
      if (!ui.boardDiv) return;
      try {
        board = Chessboard(ui.boardDiv, {
          draggable: true,
          position: "start",
          pieceTheme: PIECE_THEME,
          onDrop: (src, dst) => (currentDropHandler(src, dst) ? true : "snapback")
        });
      } catch {
        // if still 1003-ish layout, retry
        requestAnimationFrame(rebindBoard);
      }
    };
    requestAnimationFrame(rebindBoard);

    function playUserMove(src, dst) {
      if (!game || !allMoves) return false;
      if (solved || busy) return false;
      if (game.turn() !== solverSide) return false;

      const expected = allMoves[moveIndex];
      if (!expected) return false;

      const mv = game.move({ from: src, to: dst, promotion: "q" });
      if (!mv) return false;

      if (normalizeSAN(mv.san) !== normalizeSAN(expected)) {
        game.undo();
        showWrong(ui.feedback);
        updateTurn(ui.turnDiv, game, solved);
        syncBoard(board, game, false);
        return false;
      }

      moveIndex++;
      showCorrect(ui.feedback);
      updateTurn(ui.turnDiv, game, solved);
      syncBoard(board, game, false);

      autoOpponentMove();
      return true;
    }

    function autoOpponentMove() {
      if (!game || !allMoves) return;

      if (moveIndex >= allMoves.length) {
        solved = true;
        showSolved(ui.feedback);
        updateTurn(ui.turnDiv, game, solved);
        return;
      }

      if (game.turn() === solverSide) {
        updateTurn(ui.turnDiv, game, solved);
        return;
      }

      const san = allMoves[moveIndex];
      if (!san) return;

      busy = true;
      updateTurn(ui.turnDiv, game, solved);

      setTimeout(() => {
        const mv = game.move(san, { sloppy: true });
        if (!mv) {
          solved = true;
          showSolved(ui.feedback);
          updateTurn(ui.turnDiv, game, solved);
          busy = false;
          return;
        }

        moveIndex++;
        // opponent move: animate ONLY here
        syncBoard(board, game, true);

        busy = false;

        if (moveIndex >= allMoves.length) {
          solved = true;
          showSolved(ui.feedback);
        }
        updateTurn(ui.turnDiv, game, solved);
      }, 0);
    }

    ui.prevBtn && (ui.prevBtn.onclick = () => loadPuzzle(puzzleIndex - 1));
    ui.nextBtn && (ui.nextBtn.onclick = () => loadPuzzle(puzzleIndex + 1));

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(txt => {
        // Robust PGN split: split on [Event ...] blocks
        const games = txt.split(/\[Event\b/).slice(1).map(g => "[Event" + g);

        puzzles = [];
        for (const g of games) {
          const fen = g.match(/\[FEN\s+"([^"]+)"/i)?.[1];
          if (!fen) continue;
          const moves = parsePGNMoves(g);
          if (!moves.length) continue;
          puzzles.push({ fen, all: moves });
        }

        if (!puzzles.length) {
          ui.feedback.textContent = "❌ No puzzles found in PGN.";
          return;
        }

        updateCounter();
        // load the first puzzle (index 0) as requested
        loadPuzzle(0);
      })
      .catch(err => {
        console.error("Remote PGN load failed:", err);
        ui.feedback.textContent = "❌ Failed to load PGN.";
      });
  }

  // --- init ------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    const puzzleNodes = Array.from(document.querySelectorAll("puzzle"));
    let remoteUsed = false;

    puzzleNodes.forEach(node => {
      // IMPORTANT: use textContent, not innerHTML, to avoid markup breaking parsing
      const raw = stripFigurines(node.textContent || "").trim();

      const wrap = document.createElement("div");
      wrap.className = "jc-puzzle-wrapper";
      node.replaceWith(wrap);

      // Accept single-line or multi-line
      const fenMatch = raw.match(/FEN:\s*([^\n]+)/i);
      const movesMatch = raw.match(/Moves:\s*([^\n]+)/i);
      const pgnUrlMatch = raw.match(/PGN:\s*(https?:\/\/\S+)/i);
      const pgnInlineMatch = !pgnUrlMatch && raw.match(/PGN:\s*([\s\S]+)/i);

      if (pgnUrlMatch && !fenMatch) {
        if (remoteUsed) {
          wrap.textContent = "⚠️ Only one remote PGN pack allowed per page.";
          return;
        }
        remoteUsed = true;
        initRemotePGNPack(wrap, pgnUrlMatch[1].trim());
        return;
      }

      if (fenMatch && movesMatch) {
        const fen = fenMatch[1].trim();
        const allMoves = parseMovesLine(movesMatch[1]);
        renderLocalPuzzle(wrap, fen, allMoves);
        return;
      }

      if (fenMatch && pgnInlineMatch) {
        const fen = fenMatch[1].trim();
        const allMoves = parsePGNMoves(pgnInlineMatch[1]);
        renderLocalPuzzle(wrap, fen, allMoves);
        return;
      }

      wrap.textContent = "❌ Invalid <puzzle> block.";
    });
  });
})();
