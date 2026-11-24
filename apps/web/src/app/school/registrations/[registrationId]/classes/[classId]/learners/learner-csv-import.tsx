"use client";

import { useState } from "react";
import { apiRequest } from "../../../../../../../lib/api";

interface Preview {
  totalRows: number;
  validRows: number;
  created: number;
  enrolled: number;
  issues: { row: number; learnerNumber?: string; message: string }[];
}

export function LearnerCsvImport({ registrationId, classId, onImported }: {
  registrationId: string;
  classId: string;
  onImported: () => Promise<void>;
}) {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function chooseFile(file?: File) {
    setCsv(""); setFilename(""); setPreview(null); setError(""); setNotice("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Choose a CSV file. Export Excel workbooks as CSV before importing."); return; }
    if (file.size > 1024 * 1024) { setError("The CSV must be 1 MB or smaller and contain no more than 500 learners."); return; }
    setCsv(await file.text());
    setFilename(file.name);
  }

  async function validate() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest("/school/registrations/" + registrationId + "/classes/" + classId + "/learners/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, dryRun: true }),
      });
      const result = await response.json().catch(() => null) as Preview & { message?: string | string[] } | null;
      if (!response.ok) throw new Error(Array.isArray(result?.message) ? result.message.join(" ") : result?.message || "The import could not be validated.");
      setPreview(result!);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The import could not be validated."); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!preview || preview.issues.length || preview.validRows !== preview.totalRows) return;
    if (!window.confirm("Import and enroll " + preview.totalRows + " learners into this class?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest("/school/registrations/" + registrationId + "/classes/" + classId + "/learners/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, dryRun: false }),
      });
      const result = await response.json().catch(() => null) as Preview & { message?: string | string[] } | null;
      if (!response.ok) throw new Error(Array.isArray(result?.message) ? result.message.join(" ") : result?.message || "The import was not completed.");
      setNotice("Imported " + result!.enrolled + " learners; " + result!.created + " new learner identities created.");
      setCsv(""); setFilename(""); setPreview(null);
      await onImported();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The import was not completed."); }
    finally { setBusy(false); }
  }

  return <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5">
    <h2 className="text-base font-semibold text-[#172b4d]">Bulk import learners</h2>
    <p className="mt-1 text-xs leading-5 text-[#7b8ba2]">Import up to 500 learners using CSV. Validate first; nothing is saved until you confirm.</p>
    <a href="data:text/csv;charset=utf-8,learnerNumber%2CgivenName%2CotherNames%2CfamilyName%2CadmissionNumber%0AKCPE-001%2CAmina%2CWanjiku%2COtieno%2CA-001" download="sentinel-learner-import-template.csv" className="mt-3 inline-flex text-[11px] font-semibold text-[#2457c5] hover:underline">Download CSV template ↓</a>
    <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-[#cbd8e8] bg-[#f9fbfe] p-4 text-center">
      <span className="block text-xs font-semibold text-[#263b5b]">{filename || "Choose learner CSV file"}</span>
      <span className="mt-1 block text-[10px] text-[#8a99ad]">CSV · maximum 1 MB · 500 rows</span>
      <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void chooseFile(event.target.files?.[0])} />
    </label>
    {csv ? <div className="mt-2 flex justify-between text-[11px] text-[#64748b]"><span>File ready for validation</span><button type="button" onClick={() => { setCsv(""); setFilename(""); setPreview(null); }} className="font-semibold text-[#a15a38]">Remove</button></div> : null}
    <button type="button" disabled={!csv || busy} onClick={() => void validate()} className="mt-3 w-full rounded-xl border border-[#dbe3ee] px-4 py-2.5 text-xs font-semibold text-[#2457c5] disabled:opacity-50">{busy ? "Working…" : "Validate import"}</button>
    {error ? <p role="alert" className="mt-3 text-xs text-[#a33b3b]">{error}</p> : null}
    {notice ? <p role="status" className="mt-3 text-xs text-[#27825f]">{notice}</p> : null}
    {preview ? <div className="mt-4 rounded-xl border border-[#e5eaf1] p-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="text-lg font-semibold text-[#172b4d]">{preview.totalRows}</p><p className="text-[10px] text-[#8a99ad]">Rows</p></div>
        <div><p className="text-lg font-semibold text-[#27825f]">{preview.validRows}</p><p className="text-[10px] text-[#8a99ad]">Valid</p></div>
        <div><p className="text-lg font-semibold text-[#a15a38]">{preview.issues.length}</p><p className="text-[10px] text-[#8a99ad]">Issues</p></div>
      </div>
      {preview.issues.length ? <div className="mt-3 max-h-40 space-y-2 overflow-y-auto border-t border-[#edf0f5] pt-3">{preview.issues.map((issue, index) => <p key={issue.row + "-" + index} className="text-[11px] leading-5 text-[#a15a38]">Row {issue.row}: {issue.message}</p>)}</div> : <>
        <p className="mt-3 border-t border-[#edf0f5] pt-3 text-[11px] leading-5 text-[#27825f]">Validation passed. {preview.created} new identities will be created; {preview.enrolled - preview.created} existing identities will be reused.</p>
        <button type="button" disabled={busy} onClick={() => void commit()} className="mt-3 w-full rounded-xl bg-[#2457c5] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Importing…" : "Import " + preview.totalRows + " learners"}</button>
      </>}
    </div> : null}
    <p className="mt-3 text-[10px] leading-5 text-[#8a99ad]">Required columns: learnerNumber, givenName, familyName. Optional: otherNames, admissionNumber. Existing IDs are reused only when names match and no active enrollment exists. Learner numbers are identifiers, not login credentials.</p>
  </section>;
}
