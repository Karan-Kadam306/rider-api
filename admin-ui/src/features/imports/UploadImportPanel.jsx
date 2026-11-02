import { useRef, useState } from 'react';

import { uploadImport } from '../../api/importsApi';
import Field from '../../components/ui/Field';
import Icon from '../../components/ui/Icon';
import { formatFileSize } from '../../utils/formatFileSize';
import { todayInIst } from '../../utils/week';
import ImportResult from './ImportResult';

// Same limit as the backend upload middleware.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Quick checks before uploading; the backend checks the same things again.
function checkFile(file) {
    if (!file) {
        return 'Choose a CSV file to upload';
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
        return 'Only CSV files are allowed';
    }

    if (file.size > MAX_FILE_BYTES) {
        return 'File is too large. Maximum size is 5 MB';
    }

    return null;
}

// Pick a type, a work date (when the type needs one) and a CSV, then upload.
// onUploaded({ import, rowErrors }) runs after every upload the server logged,
// including Failed ones; onViewDetails(importId) opens the details panel.
export default function UploadImportPanel({ types, onUploaded, onViewDetails }) {
    const fileInputRef = useRef(null);
    const [typeKey, setTypeKey] = useState(types[0]?.key ?? '');
    const [workDate, setWorkDate] = useState(todayInIst());
    const [file, setFile] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);

    const type = types.find(item => item.key === typeKey);

    function chooseFile(nextFile) {
        setFile(nextFile ?? null);
        setError(null);
        setResult(null);
    }

    function handleDrop(event) {
        event.preventDefault();
        setDragging(false);
        chooseFile(event.dataTransfer.files[0]);
    }

    async function handleSubmit(event) {
        event.preventDefault();

        const fileError = checkFile(file) ?? (type?.requiresWorkDate && !workDate ? 'Choose the work date' : null);

        if (fileError) {
            setError(fileError);
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const uploaded = await uploadImport({
                type: typeKey,
                workDate: type.requiresWorkDate ? workDate : undefined,
                file
            });

            setResult(uploaded.import);
            setFile(null);
            fileInputRef.current.value = '';
            onUploaded(uploaded);
        } catch (uploadError) {
            setError(uploadError.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="card panel">
            <div>
                <h3 className="panel__title">Upload CSV</h3>
                <p className="panel__hint">Rows with problems are skipped and listed; the rest are imported.</p>
            </div>

            <form className="form-fields" onSubmit={handleSubmit} noValidate>
                <Field label="Import type">
                    <select value={typeKey} onChange={event => setTypeKey(event.target.value)}>
                        {types.map(item => (
                            <option key={item.key} value={item.key}>{item.label}</option>
                        ))}
                    </select>
                </Field>

                {type?.requiresWorkDate && (
                    <Field label="Work date">
                        <input
                            type="date"
                            value={workDate}
                            max={todayInIst()}
                            onChange={event => setWorkDate(event.target.value)}
                        />
                    </Field>
                )}

                <label
                    className={`dropzone${dragging ? ' dropzone--active' : ''}`}
                    onDragOver={event => {
                        event.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="visually-hidden"
                        onChange={event => chooseFile(event.target.files[0])}
                    />
                    <Icon name="upload" size={22} />
                    {file ? (
                        <span>
                            <strong>{file.name}</strong>
                            <span className="cell-sub"> · {formatFileSize(file.size)}</span>
                        </span>
                    ) : (
                        <span>Drop a CSV here or <span className="dropzone__link">browse</span></span>
                    )}
                    {type && (
                        <span className="cell-sub">Required columns: {type.requiredColumns.join(', ')}</span>
                    )}
                </label>

                {error && <p className="form-alert" role="alert">{error}</p>}

                <button type="submit" className="button" disabled={busy || !type}>
                    <Icon name="upload" size={16} />
                    {busy ? 'Uploading…' : 'Upload'}
                </button>
            </form>

            {result && (
                <div className="import-result--box">
                    <ImportResult batch={result} />
                    <button
                        type="button"
                        className="button button--secondary button--small"
                        onClick={() => onViewDetails(result.importId)}
                    >
                        <Icon name="eye" size={15} />
                        View details
                    </button>
                </div>
            )}
        </section>
    );
}
