// Label, input (passed as children) and an optional error message under it.
export default function Field({ label, error, children }) {
    return (
        <label className={`field${error ? ' field--invalid' : ''}`}>
            <span className="field__label">{label}</span>
            {children}
            {error && <span className="field__error">{error}</span>}
        </label>
    );
}
