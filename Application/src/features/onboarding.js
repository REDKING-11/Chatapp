const STORAGE_KEY = "clientOnboarding:v1";

const DEFAULT_STATE = {
    completed: false,
    acceptedPrivacy: false,
    acceptedTos: false,
    autoLoadProfileDescriptions: true,
    completedAt: null
};

export function loadOnboardingState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { ...DEFAULT_STATE };
        }

        const parsed = JSON.parse(raw);
        return {
            ...DEFAULT_STATE,
            ...parsed
        };
    } catch {
        return { ...DEFAULT_STATE };
    }
}

export function saveOnboardingState(state) {
    const next = {
        ...DEFAULT_STATE,
        ...state
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
}
