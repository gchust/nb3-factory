// Only an explicit, leading, standalone marker opts a preset comment out of
// business input. Quoted examples and mentions elsewhere remain ordinary text.
const reviewPrefix = /^\s*<!-- factory:review-only -->[\t ]*(?:\r?\n|$)/;

export function splitPresetComments(comments) {
  const business = [];
  const reviews = [];
  for (const comment of comments) {
    if (!comment.body.trim()) continue;
    const match = reviewPrefix.exec(comment.body);
    if (match) {
      reviews.push({ ...comment, body: comment.body.slice(match[0].length).trim() });
    } else {
      business.push(comment);
    }
  }
  return { business, reviews };
}
