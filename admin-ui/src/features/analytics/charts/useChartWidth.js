import { useEffect, useRef, useState } from 'react';

// Width of the element in px, kept current as the card resizes, so the SVG is drawn at its real size
// and text never stretches.
export function useChartWidth(initialWidth = 600) {
    const ref = useRef(null);
    const [width, setWidth] = useState(initialWidth);

    useEffect(() => {
        const element = ref.current;

        if (!element) {
            return undefined;
        }

        const observer = new ResizeObserver(([entry]) => {
            setWidth(Math.max(Math.floor(entry.contentRect.width), 120));
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return [ref, width];
}
