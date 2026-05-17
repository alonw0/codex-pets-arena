"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Upload, XCircle } from "lucide-react";
import { validatePetFiles, type PetValidationResult } from "@/lib/pets/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function PetUploader() {
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [spritesheetFile, setSpritesheetFile] = useState<File | null>(null);
  const [result, setResult] = useState<PetValidationResult | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState<{ name: string; moves: string[] } | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [authState, setAuthState] = useState<"checking" | "missing-config" | "signed-out" | "signed-in">("checking");

  const previewUrl = useMemo(() => (spritesheetFile ? URL.createObjectURL(spritesheetFile) : null), [spritesheetFile]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setAuthState("missing-config");
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setAuthState(data.user ? "signed-in" : "signed-out");
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState(session?.user ? "signed-in" : "signed-out");
    });

    return () => subscription.unsubscribe();
  }, []);

  async function validate() {
    setUploadMessage("");
    setUploadSuccess(null);
    try {
      const validation = await validatePetFiles(manifestFile, spritesheetFile);
      setResult(validation);
    } catch (error) {
      setResult({ ok: false, errors: [error instanceof Error ? error.message : "Spritesheet validation failed."] });
    }
  }

  async function importFromCodexPets() {
    setImportBusy(true);
    setImportStatus("");
    setUploadMessage("");
    setUploadSuccess(null);
    setResult(null);

    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase env vars are missing. Import requires auth.");
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) throw new Error("Log in before importing a Codex pet.");

      const metadataResponse = await fetch("/api/codex-pets/import", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ url: importUrl })
      });
      const metadata = (await metadataResponse.json()) as {
        error?: string;
        pet?: {
          id: string;
          name: string;
          description: string;
          manifest: Record<string, unknown>;
          spritesheetProxyUrl: string;
        };
      };

      if (!metadataResponse.ok || !metadata.pet) {
        throw new Error(metadata.error ?? "Could not import this Codex pet.");
      }

      const spritesheetResponse = await fetch(metadata.pet.spritesheetProxyUrl, {
        headers: { authorization: `Bearer ${session.access_token}` }
      });
      if (!spritesheetResponse.ok) {
        throw new Error("Could not download the Codex pet spritesheet.");
      }

      const spritesheetBlob = await spritesheetResponse.blob();
      const manifestBlob = new Blob([JSON.stringify(metadata.pet.manifest, null, 2)], { type: "application/json" });
      const importedManifest = new File([manifestBlob], "pet.json", { type: "application/json" });
      const importedSpritesheet = new File([spritesheetBlob], "spritesheet.webp", { type: "image/webp" });
      const validation = await validatePetFiles(importedManifest, importedSpritesheet);

      setManifestFile(importedManifest);
      setSpritesheetFile(importedSpritesheet);
      setResult(validation);
      setImportStatus(
        validation.ok
          ? `${metadata.pet.name} imported and validated. Log in to save it to your roster.`
          : `${metadata.pet.name} imported, but validation failed: ${validation.errors.join(" ")}`
      );
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImportBusy(false);
    }
  }

  async function upload() {
    if (!result?.ok || !manifestFile || !spritesheetFile || uploadBusy) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setUploadMessage("Supabase env vars are missing. Validation works locally; upload will work after setup.");
      return;
    }

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      setUploadMessage("Log in before uploading a pet.");
      return;
    }

    const session = (await supabase.auth.getSession()).data.session;
    if (!session?.access_token) {
      setUploadMessage("Log in before uploading a pet.");
      return;
    }

    setUploadBusy(true);
    setUploadMessage("Uploading pet and generating battle moves...");
    setUploadSuccess(null);
    try {
      const formData = new FormData();
      formData.append("manifest", manifestFile);
      formData.append("spritesheet", spritesheetFile);
      const response = await fetch("/api/pets/create", {
        method: "POST",
        headers: { authorization: `Bearer ${session.access_token}` },
        body: formData
      });
      const payload = (await response.json()) as { error?: string; pet?: { name: string; moves?: Array<{ display_name: string }> } };

      if (response.ok && payload.pet) {
        setUploadSuccess({
          name: payload.pet.name,
          moves: (payload.pet.moves ?? []).map((move) => move.display_name)
        });
        resetPetForm();
      } else {
        setUploadMessage(payload.error ?? "Pet upload failed.");
      }
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Pet upload failed.");
    } finally {
      setUploadBusy(false);
    }
  }

  function resetPetForm() {
    setManifestFile(null);
    setSpritesheetFile(null);
    setResult(null);
    setImportUrl("");
    setImportStatus("");
    setUploadMessage("");
    setFileInputKey((key) => key + 1);
  }

  return (
    <section className="tool-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Pet Upload</p>
          <h2>Import a hatched Codex pet</h2>
        </div>
        <Upload size={22} />
      </div>
      <div className="auth-upload-note">
        {authState === "signed-in" ? (
          <span>Logged in. Valid pets will be saved to your arena roster.</span>
        ) : authState === "missing-config" ? (
          <span>Supabase is not configured yet. You can validate files locally, but saving requires auth and storage env vars.</span>
        ) : (
          <span>
            Login is required to save a pet. <Link href="/auth">Go to login</Link>
          </span>
        )}
      </div>
      <ol className="instruction-list">
        <li>Create a pet with the <code>hatch-pet</code> skill.</li>
        <li>Open <code>~/.codex/pets/&lt;pet-id&gt;/</code>.</li>
        <li>Upload <code>pet.json</code> and <code>spritesheet.webp</code> together.</li>
      </ol>
      <div className="import-panel">
        <label>
          Import from Codex Pets
          <input
            disabled={uploadBusy}
            onChange={(event) => setImportUrl(event.target.value)}
            placeholder="https://codex-pets.net/#/pets/sable"
            type="url"
            value={importUrl}
          />
        </label>
        <button className="secondary-button compact" disabled={importBusy || !importUrl.trim()} onClick={importFromCodexPets} type="button">
          {importBusy ? <LoaderCircle className="spinner" size={16} /> : null}
          {importBusy ? "Importing..." : "Import link"}
        </button>
        {importStatus ? <p className="muted">{importStatus}</p> : null}
      </div>
      <div className="upload-grid">
        <label>
          pet.json
          <input key={`manifest-${fileInputKey}`} accept="application/json,.json" disabled={uploadBusy} onChange={(event) => {
            setUploadSuccess(null);
            setManifestFile(event.target.files?.[0] ?? null);
          }} type="file" />
        </label>
        <label>
          spritesheet.webp
          <input key={`spritesheet-${fileInputKey}`} accept="image/webp" disabled={uploadBusy} onChange={(event) => {
            setUploadSuccess(null);
            setSpritesheetFile(event.target.files?.[0] ?? null);
          }} type="file" />
        </label>
      </div>
      {previewUrl ? <div className="sheet-preview" style={{ backgroundImage: `url(${previewUrl})` }} /> : null}
      <div className="button-row">
        <button className="secondary-button" onClick={validate} type="button">Validate</button>
        <button className="primary-button" disabled={!result?.ok || authState !== "signed-in" || uploadBusy} onClick={upload} type="button">
          {uploadBusy ? <LoaderCircle className="spinner" size={18} /> : null}
          {uploadBusy ? "Uploading..." : "Upload pet"}
        </button>
      </div>
      {result ? (
        <div className={result.ok ? "validation validation-ok" : "validation validation-bad"}>
          {result.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span>{result.ok ? "Pet atlas looks valid." : result.errors.join(" ")}</span>
        </div>
      ) : null}
      {uploadSuccess ? (
        <div className="upload-success">
          <CheckCircle2 size={20} />
          <div>
            <strong>{uploadSuccess.name} is ready for the arena.</strong>
            {uploadSuccess.moves.length ? <span>Moves: {uploadSuccess.moves.join(" and ")}.</span> : null}
          </div>
          <Link className="primary-button compact" href="/dashboard">Go to dashboard</Link>
        </div>
      ) : null}
      {uploadMessage ? <p className="muted">{uploadMessage}</p> : null}
    </section>
  );
}
