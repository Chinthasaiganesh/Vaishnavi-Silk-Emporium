import { useEffect, useRef, useState } from "react";

export default function CategoryCombobox({ categories, value, onChange, loading, error, onRetry, onCreate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef(null);
  const selected = categories.find((category) => category.categoryName === value);
  const filtered = categories.filter((category) => category.categoryName.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  function selectCategory(category) {
    onChange(category.categoryName);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlighted((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && filtered[highlighted]) {
      event.preventDefault();
      selectCategory(filtered[highlighted]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return <div className="category-combobox" ref={rootRef}>
    <div className="category-combobox-input-wrap">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="product-category-options"
        aria-autocomplete="list"
        placeholder={loading ? "Loading categories..." : "Select Category"}
        value={open ? query : selected?.categoryName || value}
        disabled={loading || Boolean(error)}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setHighlighted(0); setOpen(true); }}
        onKeyDown={handleKeyDown}
        required
      />
      {value && !loading && <button type="button" className="category-clear" aria-label="Clear category" onClick={() => { onChange(""); setQuery(""); setOpen(true); }}>×</button>}
      <span className="category-chevron" aria-hidden="true">⌄</span>
    </div>
    {open && !loading && !error && <div className="category-options" id="product-category-options" role="listbox">
      {filtered.length > 0 ? filtered.map((category, index) => <button type="button" role="option" aria-selected={category.categoryName === value} className={index === highlighted ? "category-option highlighted" : "category-option"} key={category.categoryId} onMouseDown={(event) => event.preventDefault()} onClick={() => selectCategory(category)}>{category.categoryName}</button>) : <p className="category-empty">No matching categories.</p>}
    </div>}
    {error && <div className="category-field-message error-text"><span>{error}</span><button type="button" onClick={onRetry}>Try again</button></div>}
    {!loading && !error && categories.length === 0 && <div className="category-field-message"><span>No categories available. Please create a category first.</span><button type="button" onClick={onCreate}>Create Category</button></div>}
  </div>;
}
