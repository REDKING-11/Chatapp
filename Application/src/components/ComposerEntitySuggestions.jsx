export default function ComposerEntitySuggestions({
    suggestions,
    activeIndex = 0,
    onSelect
}) {
    if (!suggestions?.items?.length) {
        return null;
    }

    return (
        <div className="composer-entity-suggestions" role="listbox" aria-label="Suggestions">
            {suggestions.items.map((item, index) => (
                <button
                    key={`${item.token}:${item.id}`}
                    type="button"
                    className={`composer-entity-suggestion ${index === activeIndex ? "is-active" : ""}`.trim()}
                    onMouseDown={(event) => {
                        event.preventDefault();
                        onSelect?.(item);
                    }}
                    role="option"
                    aria-selected={index === activeIndex}
                >
                    <span className="composer-entity-suggestion-token">{item.token}</span>
                    {item.description ? (
                        <span className="composer-entity-suggestion-description">{item.description}</span>
                    ) : null}
                </button>
            ))}
        </div>
    );
}
