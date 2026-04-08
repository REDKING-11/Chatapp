export async function fetchCustomization(backendUrl) {
    const res = await fetch(`${backendUrl}/api/customization`);

    if (!res.ok) {
        throw new Error("Failed to load customization");
    }

    return res.json();
}

export async function saveCustomization(backendUrl, customization) {
    const res = await fetch(`${backendUrl}/api/customization`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(customization)
    });

    if (!res.ok) {
        throw new Error("Failed to save customization");
    }

    return res.json();
}

export async function resetCustomization(backendUrl) {
    const res = await fetch(`${backendUrl}/api/customization/reset`, {
        method: "POST"
    });

    if (!res.ok) {
        throw new Error("Failed to reset customization");
    }

    return res.json();
}