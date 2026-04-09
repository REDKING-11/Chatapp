const CORE_API_BASE = import.meta.env.VITE_CORE_API_BASE || "";

export function getCoreApiBase() {
    return CORE_API_BASE;
}
