const BASE_URL = 'http://localhost:5000/api';

/**
 * Uploads raw book text to Express and receives the HTTP 202 Ticket.
 */
/**
 * Packages the physical binary file into FormData and transmits to Express.
 */
export async function uploadManuscript(file, title, voice) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('voice', voice || 'nova');

    const res = await fetch(`${BASE_URL}/process-book`, {
        method: 'POST',
        // ⚠️ CRITICAL INTERVIEW NOTE: Never manually set 'Content-Type': 'multipart/form-data' here!
        // The browser must automatically compute and inject the exact binary boundary string.
        body: formData
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