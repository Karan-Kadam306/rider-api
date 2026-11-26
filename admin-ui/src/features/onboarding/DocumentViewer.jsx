import { useEffect, useRef, useState } from 'react';

import Icon from '../../components/ui/Icon';
import { applicationFileUrl } from '../../api/onboardingApi';

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];

// One uploaded file, large, with zoom and rotate for photos taken sideways. PDFs open in the
// browser's own viewer instead. Every open is logged by the API. Mounted only while open.
// file: { fileId, side, mimeType }; title names the document.
export default function DocumentViewer({ applicationId, file, title, onClose }) {
    const dialogRef = useRef(null);
    const [zoomIndex, setZoomIndex] = useState(ZOOM_STEPS.indexOf(1));
    const [rotation, setRotation] = useState(0);
    const url = applicationFileUrl(applicationId, file.fileId);

    useEffect(() => {
        dialogRef.current.showModal();
    }, []);

    return (
        <dialog ref={dialogRef} className="dialog dialog--wide document-viewer" onCancel={onClose}>
            <div className="document-viewer__header">
                <h3 className="dialog__title">{title} · {file.side}</h3>
                <div className="row-actions">
                    <button
                        type="button"
                        className="pill-button"
                        disabled={zoomIndex === 0}
                        onClick={() => setZoomIndex(index => index - 1)}
                    >
                        Zoom out
                    </button>
                    <span className="muted">{Math.round(ZOOM_STEPS[zoomIndex] * 100)}%</span>
                    <button
                        type="button"
                        className="pill-button"
                        disabled={zoomIndex === ZOOM_STEPS.length - 1}
                        onClick={() => setZoomIndex(index => index + 1)}
                    >
                        Zoom in
                    </button>
                    <button type="button" className="pill-button" onClick={() => setRotation(degrees => (degrees + 90) % 360)}>
                        <Icon name="refresh" size={15} />
                        Rotate
                    </button>
                    <a className="pill-button" href={url} target="_blank" rel="noreferrer">Open in new tab</a>
                    <button type="button" className="button button--icon" aria-label="Close" onClick={onClose}>
                        <Icon name="close" size={18} />
                    </button>
                </div>
            </div>

            <div className="document-viewer__stage">
                {file.mimeType === 'application/pdf' ? (
                    <p className="muted">
                        PDF files open in the browser&apos;s viewer: <a href={url} target="_blank" rel="noreferrer">open the PDF</a>.
                    </p>
                ) : (
                    <img
                        src={url}
                        alt={`${title} ${file.side}`}
                        style={{ transform: `rotate(${rotation}deg) scale(${ZOOM_STEPS[zoomIndex]})` }}
                    />
                )}
            </div>
        </dialog>
    );
}
