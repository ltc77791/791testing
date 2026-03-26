/**
 * Escape special regex characters in a string for safe use in MongoDB $regex.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
