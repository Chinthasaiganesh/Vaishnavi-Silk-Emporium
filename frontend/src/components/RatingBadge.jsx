export default function RatingBadge({ rating = 0, reviewCount }) {
  const score = Number(rating || 0);
  const tone = score >= 4 ? "good" : score >= 3 ? "average" : "poor";
  const reviews = reviewCount ?? Math.max(12, Math.round(score * 327));

  return (
    <span className="rating-wrap" aria-label={`Rated ${score.toFixed(1)} out of 5 from ${reviews.toLocaleString()} reviews`}>
      <span className={`rating-badge ${tone}`}>{score.toFixed(1)} <span aria-hidden="true">★</span></span>
      <span className="review-count">({reviews.toLocaleString()} Reviews)</span>
    </span>
  );
}