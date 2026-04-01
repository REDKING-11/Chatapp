export async function parseJsonResponse(res, fallbackMessage = "Request failed") {
    const raw = await res.text();

    let data;
    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        throw new Error(`Server returned invalid JSON: ${raw || "[empty response]"}`);
    }

    if (!res.ok) {
        throw new Error(data.error || fallbackMessage);
    }

    return data;
}