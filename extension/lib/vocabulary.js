/* Gesture vocabulary — maps a sequence of 8 cardinal directions to an action id.
 * Directions: U (up), D (down), L (left), R (right), UL, UR, DL, DR.
 * Ported from the legacy OGC RDF vocabulary; extend freely from the options page.
 */
(function (root) {
  const OGC_VOCABULARY = {
    "L":      "tab.back",
    "R":      "tab.forward",
    "U":      "tab.scrollTop",
    "D":      "tab.scrollBottom",
    "DR":     "tab.close",
    "DL":     "tab.reopen",
    "UR":     "tab.next",
    "UL":     "tab.prev",
    "UD":     "tab.reload",
    "RL":     "tab.duplicate",
    "LR":     "window.new",
    "DU":     "page.top",
    "RUL":    "history.open",
    "LDR":    "bookmarks.open",
    "URD":    "downloads.open"
  };
  root.OGC_VOCABULARY = OGC_VOCABULARY;
})(typeof window !== "undefined" ? window : globalThis);