import { useRef, useState } from "react";
import {
    importClientSettingsFromFile
} from "../features/clientSettings";
import { formatAppError } from "../lib/debug";
import PolicyDocumentModal from "./PolicyDocumentModal";
import privacyPolicyMarkdown from "../assets/PP.md?raw";
import termsOfServiceMarkdown from "../assets/TOS.md?raw";

const SETUP_STEPS = [
    "Welcome",
    "Settings",
    "Policies",
    "Account"
];

export default function InitialSetupWizard({
    currentSettings,
    onImportSettings,
    onComplete
}) {
    const [stepIndex, setStepIndex] = useState(0);
    const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
    const [acceptedTos, setAcceptedTos] = useState(false);
    const [importStatus, setImportStatus] = useState("");
    const [importError, setImportError] = useState("");
    const [openPolicy, setOpenPolicy] = useState("");
    const inputRef = useRef(null);

    async function handleImportFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const imported = await importClientSettingsFromFile(file);
            onImportSettings(imported);
            setImportStatus("Previous settings imported successfully.");
            setImportError("");
        } catch (error) {
            setImportStatus("");
            setImportError(formatAppError(error, {
                fallbackMessage: "Could not import those previous settings.",
                context: "Setup import"
            }).message);
        } finally {
            event.target.value = "";
        }
    }

    function nextStep() {
        setStepIndex((prev) => Math.min(prev + 1, SETUP_STEPS.length - 1));
    }

    function previousStep() {
        setStepIndex((prev) => Math.max(prev - 1, 0));
    }

    function finishSetup() {
        if (!acceptedPrivacy || !acceptedTos) {
            return;
        }

        onComplete({
            acceptedPrivacy: true,
            acceptedTos: true
        });
    }

    return (
        <div className="auth-screen onboarding-screen">
            <div className="auth-card onboarding-card">
                <div className="onboarding-progress">
                    {SETUP_STEPS.map((step, index) => (
                        <div
                            key={step}
                            className={`onboarding-progress-step ${index === stepIndex ? "active" : index < stepIndex ? "complete" : ""}`}
                        >
                            <span>{index + 1}</span>
                            <strong>{step}</strong>
                        </div>
                    ))}
                </div>

                {stepIndex === 0 ? (
                    <div className="onboarding-panel">
                        <h1>Welcome to Chatapp</h1>
                        <p>
                            Let's get this device ready. You can bring in previous client settings,
                            review local privacy basics, and then continue to login or register.
                        </p>
                        <ul className="onboarding-list">
                            <li>Import your previous client settings if you already tuned another device.</li>
                            <li>Review privacy and terms before using the app.</li>
                            <li>Future setup items can be added here without disrupting your account flow.</li>
                        </ul>
                    </div>
                ) : null}

                {stepIndex === 1 ? (
                    <div className="onboarding-panel">
                        <h1>Previous Settings</h1>
                        <p>
                            If you exported your client settings before, you can import them now.
                            Otherwise just continue with the defaults and change them later from Client Settings.
                        </p>

                        <input
                            ref={inputRef}
                            type="file"
                            accept=".json,application/json"
                            className="client-hidden-input"
                            onChange={handleImportFile}
                        />

                        <div className="onboarding-actions">
                            <button type="button" onClick={() => inputRef.current?.click()}>
                                Import Previous Settings
                            </button>
                        </div>

                        {importStatus ? <p className="onboarding-success">{importStatus}</p> : null}
                        {importError ? <p className="auth-error">{importError}</p> : null}
                    </div>
                ) : null}

                {stepIndex === 2 ? (
                    <div className="onboarding-panel">
                        <h1>Privacy And Terms</h1>
                        <p>
                            Review the current privacy policy and terms before finishing setup.
                        </p>

                        <div className="onboarding-policy-card">
                            <strong>Privacy Policy</strong>
                            <p>Open the full privacy policy in a dedicated reading view.</p>
                            <button type="button" onClick={() => setOpenPolicy("privacy")}>
                                Open Privacy Policy
                            </button>
                        </div>

                        <div className="onboarding-policy-card">
                            <strong>Terms Of Service</strong>
                            <p>Open the full terms document in a dedicated reading view.</p>
                            <button type="button" onClick={() => setOpenPolicy("terms")}>
                                Open Terms Of Service
                            </button>
                        </div>

                        <label className="onboarding-check">
                            <input
                                type="checkbox"
                                checked={acceptedPrivacy}
                                onChange={(event) => setAcceptedPrivacy(event.target.checked)}
                            />
                            <span>I accept the privacy policy for this setup.</span>
                        </label>

                        <label className="onboarding-check">
                            <input
                                type="checkbox"
                                checked={acceptedTos}
                                onChange={(event) => setAcceptedTos(event.target.checked)}
                            />
                            <span>I accept the terms of service for this setup.</span>
                        </label>
                    </div>
                ) : null}

                {stepIndex === 3 ? (
                    <div className="onboarding-panel">
                        <h1>Continue To Account</h1>
                        <p>
                            Setup is ready. Continue to login or register.
                        </p>
                        <div className="onboarding-policy-card">
                            <strong>What happens next</strong>
                            <p>
                                After you continue, the normal login/register screen opens. You can still import,
                                export, or change client settings later from the top bar.
                            </p>
                        </div>
                    </div>
                ) : null}

                <div className="onboarding-footer">
                    <button
                        type="button"
                        className="secondary"
                        onClick={previousStep}
                        disabled={stepIndex === 0}
                    >
                        Back
                    </button>

                    {stepIndex < SETUP_STEPS.length - 1 ? (
                        <button
                            type="button"
                            onClick={nextStep}
                            disabled={stepIndex === 2 && (!acceptedPrivacy || !acceptedTos)}
                        >
                            Continue
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={finishSetup}
                            disabled={!acceptedPrivacy || !acceptedTos}
                        >
                            Continue To Login
                        </button>
                    )}
                </div>

                {openPolicy === "privacy" ? (
                    <PolicyDocumentModal
                        title="Privacy Policy"
                        markdown={privacyPolicyMarkdown}
                        onClose={() => setOpenPolicy("")}
                    />
                ) : null}

                {openPolicy === "terms" ? (
                    <PolicyDocumentModal
                        title="Terms Of Service"
                        markdown={termsOfServiceMarkdown}
                        onClose={() => setOpenPolicy("")}
                    />
                ) : null}
            </div>
        </div>
    );
}
