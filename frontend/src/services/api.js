const BASE_URL = 'http://localhost:5000/api';

/**
 * Uploads raw book text to Express and receives the HTTP 202 Ticket.
 */
export async function uploadManuscript(title, rawText) {
    const res = await fetch(`${BASE_URL}/process-book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, raw_text: rawText })
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to queue manuscript.');
    }

    return await res.json();
}

/**
 * Listens to the backend SSE pipe for live rendering updates.
 * Returns a teardown function to safely close the socket.
 */
export function subscribeToProgress(bookTitle, onTick, onFinish, onError) {
    const encodedTitle = encodeURIComponent(bookTitle);
    const eventSource = new EventSource(`${BASE_URL}/status/${encodedTitle}`);

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        onTick(data);

        if (data.status === 'READY') {
            eventSource.close();
            onFinish();
        }
    };

    eventSource.onerror = (err) => {
        console.error('SSE Connection Dropped:', err);
        eventSource.close();
        if (onError) onError(err);
    };

    // Return cleanup function for React useEffect unmounting
    return () => eventSource.close();
}