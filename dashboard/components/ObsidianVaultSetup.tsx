"use client";

import { useState, type FormEvent } from "react";

export default function ObsidianVaultSetup({
  onDestinationChange,
  syncing,
}: {
  syncing: boolean;
  onDestinationChange: (
    vault: { path: string; destination: string } | null,
  ) => void;
}) {
  const [folder, setFolder] = useState("");
  const [validated, setValidated] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function validate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setValidated("");
    onDestinationChange(null);
    try {
      const response = await fetch("/api/obsidian/vault/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: folder }),
      });
      const result = await response.json();
      if (response.ok) {
        setValidated(result.destination);
        onDestinationChange(result);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Could not check the vault folder. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="deliverable-expectations">
      <summary>Set up an Obsidian vault</summary>
      <p className="muted">
        Enter the path to an existing vault on this computer. This step checks
        the folder and shows where the notes would go.
      </p>
      <form onSubmit={(event) => void validate(event)}>
        <div className="resource-filters">
          <label>
            Vault folder path
            <input
              disabled={pending || syncing}
              required
              maxLength={4096}
              placeholder="~/Documents/My Vault"
              value={folder}
              onChange={(event) => {
                setFolder(event.target.value);
                setValidated("");
                onDestinationChange(null);
                setError("");
              }}
            />
          </label>
        </div>
        <button disabled={pending || syncing || !folder.trim()}>
          {pending ? "Checking…" : "Validate vault folder"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {validated && (
        <div role="status">
          <p>Validated destination for Pursuit notes</p>
          <p className="export-path">{validated}</p>
          <button
            disabled={syncing}
            onClick={() => {
              setValidated("");
              setFolder("");
              onDestinationChange(null);
            }}
          >
            Disconnect vault
          </button>
        </div>
      )}
    </details>
  );
}
