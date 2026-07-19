const MAX_ORDER_COMMENT_LENGTH = 1000;

function normalizeOrderComment(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, MAX_ORDER_COMMENT_LENGTH);
}

module.exports = { MAX_ORDER_COMMENT_LENGTH, normalizeOrderComment };
