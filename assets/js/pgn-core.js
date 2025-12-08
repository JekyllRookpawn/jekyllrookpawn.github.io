// ============================================================================
// pgn-core.js
// Shared parsing constants + helpers for pgn.js and pgn-reader.js
// ============================================================================

(function () {
  "use strict";

  const PIECE_THEME_URL =
    "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

  const SAN_CORE_REGEX =
    /^([O0]-[O0](-[O0])?[+#]?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?|[a-h][1-8](=[QRBN])?[+#]?)$/;

  const RESULT_REGEX = /^(1-0|0-1|1\/2-1\/2|½-½|\*)$/;
  const MOVE_NUMBER_REGEX = /^(\d+)(\.+)$/;

  const NBSP = "\u00A0";

  const NAG_MAP = {
    1: "!", 2: "?", 3: "‼", 4: "⁇", 5: "⁉", 6: "⁈",
    13: "→", 14: "↑", 15: "⇆", 16: "⇄",
    17: "⟂", 18: "∞", 19: "⟳", 20: "⟲",
    36: "⩲", 37: "⩱", 38: "±", 39: "∓",
    40: "+=", 41: "=+", 42: "±", 43: "∓",
    44: "⨀", 45: "⨁"
  };

  const EVAL_MAP = {
    "=": "=",
    "+/=": "⩲",
    "=/+": "⩱",
    "+/-": "±",
    "+/−": "±",
    "-/+": "∓",
    "−/+": "∓",
    "+-": "+−",
    "+−": "+−",
    "-+": "−+",
    "−+": "−+",
    "∞": "∞",
    "=/∞": "⯹"
  };

  function normalizeResult(r) {
    return r ? r.replace(/1\/2-1\/2/g, "½-½") : "";
  }

  function extractYear(d) {
    if (!d) return "";
    let p = d.split(".");
    return /^\d{4}$/.test(p[0]) ? p[0] : "";
  }

  function flipName(n) {
    if (!n) return "";
    let i = n.indexOf(",");
    return i === -1
      ? n.trim()
      : n.slice(i + 1).trim() + " " + n.slice(0, i).trim();
  }

  function normalizeFigurines(text) {
    return text
      .replace(/♔/g, "K")
      .replace(/♕/g, "Q")
      .replace(/♖/g, "R")
      .replace(/♗/g, "B")
      .replace(/♘/g, "N");
  }

  function appendText(el, txt) {
    if (txt) el.appendChild(document.createTextNode(txt));
  }

  function makeCastlingUnbreakable(s) {
    return s
      .replace(/0-0-0|O-O-O/g, m => m[0] + "\u2011" + m[2] + "\u2011" + m[4])
      .replace(/0-0|O-O/g, m => m[0] + "\u2011" + m[2]);
  }

  // Expose everything
  window.PGNCore = {
    PIECE_THEME_URL,
    SAN_CORE_REGEX,
    RESULT_REGEX,
    MOVE_NUMBER_REGEX,
    NBSP,
    NAG_MAP,
    EVAL_MAP,
    normalizeResult,
    extractYear,
    flipName,
    normalizeFigurines,
    appendText,
    makeCastlingUnbreakable
  };
})();