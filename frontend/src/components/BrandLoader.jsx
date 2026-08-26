export default function BrandLoader({ label = "Loading..." }) {
  return (
    <main className="brand-loader" aria-live="polite">
      <img src="/brand/vaishnavi-vs-monogram.png" alt="Vaishnavi Silk Emporium" />
      <strong>Vaishnavi Silk Emporium</strong>
      <span>{label}</span>
    </main>
  );
}