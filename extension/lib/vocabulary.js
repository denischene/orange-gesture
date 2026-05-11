/* Gesture vocabulary — maps a sequence of 8 cardinal directions to an action id.
 * Directions: U (up), D (down), L (left), R (right), UL, UR, DL, DR.
 * Ported from the legacy OGC RDF vocabulary; extend freely from the options page.
 */
(function (root) {
  const OGC_VOCABULARY = {
    // Page navigation (history)
    "L":           "page.back",
    "R":           "page.forward",
    // Scroll one step (contextual: copy/paste on selection / input)
    "U":           "scroll.up",
    "D":           "scroll.down",
    // Page extremes
    "RU":          "page.top",
    "RD":          "page.bottom",
    // Site / browser home
    "LURDR":       "site.home",
    // Search
    "URUURRDLDDL": "search.web",
    // Help sidebar
    "UURRDDLDD":   "help.toggle",
    // Tabs
    "DUURRDRD":    "tab.new",
    "URRDRD":      "tab.next",
    "DDLLULU":     "tab.prev",
    // Close tab — alpha shape
    "DRULDR":      "tab.close",
    // Window state
    "UR":          "window.maximize",
    "DL":          "window.minimize",
    // Zoom (10% steps)
    "DRDDLLLUURUR":"zoom.in",
    "LDLDDRRULUUL":"zoom.out",
    // Bookmark current url
    "LRULRD":      "bookmarks.add",
    // Save link/image as
    "DDRURUULL":   "page.saveAs"
  };
  root.OGC_VOCABULARY = OGC_VOCABULARY;
})(typeof window !== "undefined" ? window : globalThis);