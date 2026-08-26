export default function AdminSectionPage({ title, description }) {
  return (
    <main className="admin-section-page">
      <p className="eyebrow">Admin Portal</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </main>
  );
}