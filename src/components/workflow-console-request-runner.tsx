import type { Dispatch, FormEvent, SetStateAction } from "react";
import styles from "./workflow-console.module.css";
import {
  GuideTone,
  InputFieldDefinition,
  JsonParseResult,
  RequestConsoleDraft,
  RequestDetails,
  RequestSummaryResponse,
  WorkflowConfigDetail,
  WorkflowConfigSummary,
} from "./workflow-console.types";
import { formatDate, sampleValueForField, stringifyJson } from "./workflow-console.utils";

interface ChecklistItem {
  title: string;
  detail: string;
  tone: GuideTone;
}

interface LegendItem {
  title: string;
  detail: string;
}

interface WorkflowChoice {
  name: string;
  activeVersion?: number;
  latestVersion: number;
  versionCount: number;
}

interface WorkflowConsoleRequestRunnerProps {
  canUseGuidedRequestForm: boolean;
  loadingRequest: boolean;
  onChooseRequestWorkflow: (workflowName: string) => void;
  onChooseRequestWorkflowVersion: (workflowVersion?: number) => void;
  requestChecklist: ChecklistItem[];
  requestDetails: RequestDetails | null;
  requestDraft: RequestConsoleDraft;
  requestFieldEntries: Array<[string, InputFieldDefinition]>;
  requestGuide: LegendItem[];
  requestInputObject: Record<string, unknown>;
  requestInputResult: JsonParseResult<unknown>;
  requestReady: boolean;
  requestSummary: RequestSummaryResponse | null;
  requestWorkflow: WorkflowConfigDetail | null;
  requestWorkflowLoading: boolean;
  requiredRequestFields: Array<[string, InputFieldDefinition]>;
  submittingRequest: boolean;
  workflowCatalog: WorkflowConfigSummary[];
  onFillSampleValues: () => void;
  onGenerateKey: () => void;
  onLookupRequest: (event: FormEvent<HTMLFormElement>) => void;
  onSetRequestDraft: Dispatch<SetStateAction<RequestConsoleDraft>>;
  onSubmitRequest: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateRequestInputField: (
    fieldName: string,
    rawValue: string,
    field: InputFieldDefinition
  ) => void;
}

function getStatusTone(status?: string) {
  switch (status) {
    case "approved":
      return styles.statusApproved;
    case "rejected":
      return styles.statusRejected;
    case "manual_review":
      return styles.statusManualReview;
    case "error":
      return styles.statusError;
    case "processing":
    default:
      return styles.statusProcessing;
  }
}

function getGuideToneClass(tone: GuideTone) {
  switch (tone) {
    case "done":
      return styles.guideDone;
    case "attention":
      return styles.guideAttention;
    case "tip":
    default:
      return styles.guideTip;
  }
}

export function WorkflowConsoleRequestRunner({
  canUseGuidedRequestForm,
  loadingRequest,
  onChooseRequestWorkflow,
  onChooseRequestWorkflowVersion,
  requestChecklist,
  requestDetails,
  requestDraft,
  requestFieldEntries,
  requestGuide,
  requestInputObject,
  requestInputResult,
  requestReady,
  requestSummary,
  requestWorkflow,
  requestWorkflowLoading,
  requiredRequestFields,
  submittingRequest,
  workflowCatalog,
  onFillSampleValues,
  onGenerateKey,
  onLookupRequest,
  onSetRequestDraft,
  onSubmitRequest,
  onUpdateRequestInputField,
}: WorkflowConsoleRequestRunnerProps) {
  const workflowChoices = Array.from(
    workflowCatalog.reduce((choices, item) => {
      const existingChoice = choices.get(item.name);

      if (!existingChoice) {
        choices.set(item.name, {
          name: item.name,
          activeVersion: item.isActive ? item.version : undefined,
          latestVersion: item.version,
          versionCount: 1,
        });
        return choices;
      }

      existingChoice.versionCount += 1;
      existingChoice.latestVersion = Math.max(existingChoice.latestVersion, item.version);

      if (item.isActive) {
        existingChoice.activeVersion = item.version;
      }

      return choices;
    }, new Map<string, WorkflowChoice>()).values()
  ).sort((left, right) => left.name.localeCompare(right.name));

  const requestVersionOptions = workflowCatalog
    .filter((item) => item.name === requestDraft.workflowName.trim())
    .sort((left, right) => right.version - left.version);

  return (
    <section className={`${styles.panel} ${styles.workspacePanel}`}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.panelEyebrow}>Requests</p>
          <h2 className={styles.panelTitle}>Run a workflow request</h2>
        </div>
        <div className={styles.inlineActions}>
          <button type="button" className={styles.ghostButton} onClick={onGenerateKey}>
            Generate key
          </button>
          {requestWorkflow ? (
            <button type="button" className={styles.ghostButton} onClick={onFillSampleValues}>
              Fill sample values
            </button>
          ) : null}
        </div>
      </header>

      <section className={styles.summaryStrip}>
        <article className={styles.summaryChip}>
          <span className={styles.summaryLabel}>Workflow</span>
          <strong className={styles.summaryValue}>
            {requestDraft.workflowName.trim() || "Not set"}
          </strong>
        </article>
        <article className={styles.summaryChip}>
          <span className={styles.summaryLabel}>Version</span>
          <strong className={styles.summaryValue}>
            {requestDraft.workflowVersion ? `v${requestDraft.workflowVersion}` : "Active / latest"}
          </strong>
        </article>
        <article className={styles.summaryChip}>
          <span className={styles.summaryLabel}>Input mode</span>
          <strong className={styles.summaryValue}>
            {requestDraft.inputMode === "guided" ? "Guided form" : "Raw JSON"}
          </strong>
        </article>
        <article className={styles.summaryChip}>
          <span className={styles.summaryLabel}>Ready</span>
          <strong className={styles.summaryValue}>{requestReady ? "Yes" : "Not yet"}</strong>
        </article>
      </section>

      <details className={styles.helpPanel}>
        <summary className={styles.helpSummary}>
          <span>Request guide</span>
          <span className={styles.helpSummaryMeta}>Checklist, modes, and what to inspect</span>
        </summary>
        <div className={styles.helpBody}>
          <div className={styles.checklist}>
            {requestChecklist.map((item) => (
              <div
                key={item.title}
                className={`${styles.checklistItem} ${getGuideToneClass(item.tone)}`}
              >
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>

          <div className={styles.legendGrid}>
            {requestGuide.map((item) => (
              <article key={item.title} className={styles.legendItem}>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </details>

      <form className={styles.form} onSubmit={onSubmitRequest}>
        <div className={styles.builderGrid}>
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="request-workflow-name">
              Saved workflow
            </label>
            <select
              id="request-workflow-name"
              className={styles.select}
              value={requestDraft.workflowName}
              onChange={(event) => onChooseRequestWorkflow(event.target.value)}
            >
              <option value="">Select a stored workflow</option>
              {workflowChoices.map((choice) => (
                <option key={choice.name} value={choice.name}>
                  {choice.name}
                  {choice.activeVersion
                    ? ` - active v${choice.activeVersion}`
                    : ` - latest v${choice.latestVersion}`}
                  {choice.versionCount > 1 ? ` - ${choice.versionCount} versions` : ""}
                </option>
              ))}
            </select>
            <p className={styles.helperText}>
              Choose any stored workflow here instead of typing a hardcoded name.
            </p>
          </div>

          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="request-workflow-version">
              Version
            </label>
            <select
              id="request-workflow-version"
              className={styles.select}
              value={requestDraft.workflowVersion ? String(requestDraft.workflowVersion) : ""}
              onChange={(event) =>
                onChooseRequestWorkflowVersion(
                  event.target.value ? Number(event.target.value) : undefined
                )
              }
              disabled={!requestDraft.workflowName.trim()}
            >
              <option value="">Use active / latest</option>
              {requestVersionOptions.map((item) => (
                <option key={`${item.name}-${item.version}`} value={item.version}>
                  v{item.version}
                  {item.isActive ? " (active)" : ""}
                </option>
              ))}
            </select>
            <p className={styles.helperText}>
              Leave this on active/latest, or pin an exact stored version.
            </p>
          </div>

          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="request-idempotency-key">
              Idempotency key
            </label>
            <input
              id="request-idempotency-key"
              className={styles.input}
              value={requestDraft.idempotencyKey}
              onChange={(event) =>
                onSetRequestDraft((current) => ({
                  ...current,
                  idempotencyKey: event.target.value,
                }))
              }
            />
            <p className={styles.helperText}>
              Reusing the same key returns the earlier request. A fresh key is generated after each successful send.
            </p>
          </div>
        </div>

        <div className={styles.schemaBanner}>
          <div>
            <strong>
              {requestWorkflowLoading
                ? "Loading request schema..."
                : requestWorkflow
                  ? `Using ${requestWorkflow.name} v${requestWorkflow.version}`
                  : "No matching stored workflow selected"}
            </strong>
            <p className={styles.helperText}>
              {requestDraft.workflowVersion
                ? "Requests will run the exact stored version you selected."
                : "Requests resolve the active version, or the latest version if none is active."}
            </p>
            {requestWorkflow ? (
              <p className={styles.helperText}>
                {requiredRequestFields.length} required field(s),{" "}
                {requestWorkflow.inputSchema?.allowUnknown
                  ? "extra fields allowed"
                  : "extra fields blocked"}
                .
              </p>
            ) : null}
          </div>
          <div className={styles.modeSwitch}>
            <button
              type="button"
              className={`${styles.modeButton} ${
                requestDraft.inputMode === "guided" ? styles.modeButtonActive : ""
              }`}
              onClick={() =>
                onSetRequestDraft((current) => ({
                  ...current,
                  inputMode: "guided",
                }))
              }
              disabled={!canUseGuidedRequestForm}
            >
              Guided form
            </button>
            <button
              type="button"
              className={`${styles.modeButton} ${
                requestDraft.inputMode === "json" ? styles.modeButtonActive : ""
              }`}
              onClick={() =>
                onSetRequestDraft((current) => ({
                  ...current,
                  inputMode: "json",
                }))
              }
            >
              Raw JSON
            </button>
          </div>
        </div>

        {requestDraft.inputMode === "guided" && canUseGuidedRequestForm ? (
          <div className={styles.cardList}>
            {requestFieldEntries.map(([fieldName, field]) => {
              const currentValue =
                requestInputObject[fieldName] === undefined
                  ? ""
                  : String(requestInputObject[fieldName]);

              return (
                <article key={fieldName} className={styles.cardItem}>
                  <div className={styles.cardToolbar}>
                    <div>
                      <strong>{fieldName}</strong>
                      <p className={styles.helperText}>
                        {field.description ?? `${field.type} field`}
                      </p>
                    </div>
                    <span className={styles.factPill}>{field.type}</span>
                  </div>

                  <div className={styles.formRow}>
                    <label className={styles.label}>Value</label>
                    {field.enum && field.enum.length > 0 ? (
                      <select
                        className={styles.select}
                        value={currentValue}
                        onChange={(event) =>
                          onUpdateRequestInputField(fieldName, event.target.value, field)
                        }
                      >
                        <option value="">Select</option>
                        {field.enum.map((value) => {
                          const optionValue = String(value);
                          return (
                            <option key={`${fieldName}-${optionValue}`} value={optionValue}>
                              {optionValue}
                            </option>
                          );
                        })}
                      </select>
                    ) : field.type === "boolean" ? (
                      <select
                        className={styles.select}
                        value={currentValue}
                        onChange={(event) =>
                          onUpdateRequestInputField(fieldName, event.target.value, field)
                        }
                      >
                        <option value="">Select</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        className={styles.input}
                        type={field.type === "number" ? "number" : "text"}
                        value={currentValue}
                        onChange={(event) =>
                          onUpdateRequestInputField(fieldName, event.target.value, field)
                        }
                        placeholder={String(sampleValueForField(field))}
                      />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="request-input-data">
              Request input JSON
            </label>
            <textarea
              id="request-input-data"
              className={styles.textareaTall}
              rows={10}
              value={requestDraft.inputDataText}
              onChange={(event) =>
                onSetRequestDraft((current) => ({
                  ...current,
                  inputDataText: event.target.value,
                }))
              }
            />
          </div>
        )}

        <details className={styles.advancedPanel}>
          <summary className={styles.advancedSummary}>
            Request payload preview / raw JSON
          </summary>
          {requestInputResult.error ? (
            <div className={styles.previewError}>{requestInputResult.error}</div>
          ) : null}
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="request-input-preview">
              Payload JSON
            </label>
            <textarea
              id="request-input-preview"
              className={styles.textareaTall}
              rows={10}
              value={requestDraft.inputDataText}
              onChange={(event) =>
                onSetRequestDraft((current) => ({
                  ...current,
                  inputDataText: event.target.value,
                }))
              }
            />
          </div>
        </details>

        <div className={styles.submitRow}>
          <button type="submit" className={styles.primaryButton} disabled={submittingRequest}>
            {submittingRequest ? "Submitting..." : "Send workflow request"}
          </button>
          <span className={styles.helperText}>This posts directly to `POST /api/request`.</span>
        </div>
      </form>

      <form className={styles.lookupForm} onSubmit={onLookupRequest}>
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="request-lookup">
            Inspect request ID
          </label>
          <p className={styles.helperText}>
            Reopen a previous run to see reasoning, rules, and stage history.
          </p>
          <div className={styles.lookupRow}>
            <input
              id="request-lookup"
              className={styles.input}
              value={requestDraft.requestIdLookup}
              onChange={(event) =>
                onSetRequestDraft((current) => ({
                  ...current,
                  requestIdLookup: event.target.value,
                }))
              }
              placeholder="Paste a requestId"
            />
            <button type="submit" className={styles.secondaryButton} disabled={loadingRequest}>
              {loadingRequest ? "Loading..." : "Inspect"}
            </button>
          </div>
        </div>
      </form>

      {requestSummary ? (
        <div className={styles.responseCard}>
          <div className={styles.responseHeader}>
            <div>
              <p className={styles.panelEyebrow}>Latest submission</p>
              <h3 className={styles.detailTitle}>{requestSummary.requestId}</h3>
            </div>
            <span className={`${styles.statusPill} ${getStatusTone(requestSummary.status)}`}>
              {requestSummary.status}
            </span>
          </div>
          <p className={styles.responseCopy}>
            {requestSummary.message ??
              `Current stage: ${requestSummary.currentStage ?? "not returned"}.`}
          </p>
        </div>
      ) : null}

      <div className={styles.previewCard}>
        <div className={styles.previewHeader}>
          <h3 className={styles.detailTitle}>Request details</h3>
          <span className={styles.panelMeta}>
            {requestDetails ? requestDetails.workflowName : "Inspect any request ID"}
          </span>
        </div>

        {requestDetails ? (
          <div className={styles.requestBody}>
            <div className={styles.detailFacts}>
              <span className={`${styles.statusPill} ${getStatusTone(requestDetails.status)}`}>
                {requestDetails.status}
              </span>
              <span className={styles.factPill}>Stage: {requestDetails.currentStage}</span>
              <span className={styles.factPill}>
                v{requestDetails.workflowVersion} from {requestDetails.workflowSource}
              </span>
            </div>

            <div className={styles.infoCard}>
              <h4>Reasoning</h4>
              <p>{requestDetails.reasoning || "No reasoning was recorded for this run."}</p>
            </div>

            <div className={styles.requestGrid}>
              <div className={styles.infoCard}>
                <h4>Input</h4>
                <pre className={styles.codeBlock}>{stringifyJson(requestDetails.input)}</pre>
              </div>

              <div className={styles.infoCard}>
                <h4>Triggered rules</h4>
                {requestDetails.rulesTriggered.length === 0 ? (
                  <p className={styles.emptyHint}>No rules were logged for this request.</p>
                ) : (
                  <div className={styles.timeline}>
                    {requestDetails.rulesTriggered.map((entry) => (
                      <div
                        key={`${entry.ruleId}-${entry.passed}`}
                        className={styles.timelineRow}
                      >
                        <span>{entry.ruleId}</span>
                        <strong>{entry.passed ? "pass" : "fail"}</strong>
                        <em>{entry.details ?? "No details"}</em>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.infoCard}>
                <h4>Decisions</h4>
                {requestDetails.decisions.length === 0 ? (
                  <p className={styles.emptyHint}>No decisions have been recorded yet.</p>
                ) : (
                  <div className={styles.timeline}>
                    {requestDetails.decisions.map((entry, index) => (
                      <div
                        key={`${entry.stage}-${entry.decision}-${index}`}
                        className={styles.timelineRow}
                      >
                        <span>{entry.stage}</span>
                        <strong>{entry.decision}</strong>
                        <em>{entry.reasoning ?? "No reasoning"}</em>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.infoCard}>
                <h4>History</h4>
                {requestDetails.history.length === 0 ? (
                  <p className={styles.emptyHint}>No stage history has been recorded yet.</p>
                ) : (
                  <div className={styles.timeline}>
                    {requestDetails.history.map((entry, index) => (
                      <div
                        key={`${entry.stage}-${entry.action}-${index}`}
                        className={styles.timelineRow}
                      >
                        <span>{entry.stage}</span>
                        <strong>{entry.action}</strong>
                        <em>{formatDate(entry.timestamp)}</em>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p>Submit a request or inspect an existing request ID to see the execution trail.</p>
          </div>
        )}
      </div>
    </section>
  );
}
