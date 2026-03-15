import { useEffect, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import styles from "./workflow-console.module.css";
import {
  ComposerSections,
  GuideTone,
  InputFieldDefinition,
  InputFieldType,
  TransitionCondition,
  WorkflowComposerDraft,
  WorkflowConfigDetail,
  WorkflowRule,
  WorkflowStageActionEditor,
  WorkflowTransition,
} from "./workflow-console.types";
import { countNestedRules, formatEnumValues } from "./workflow-console.utils";

interface ChecklistItem {
  title: string;
  detail: string;
  tone: GuideTone;
}

interface LegendItem {
  title: string;
  detail: string;
}

interface WorkflowConsoleBuilderProps {
  builderChecklist: ChecklistItem[];
  builderFieldNames: string[];
  builderRuleCount: number;
  composerDraft: WorkflowComposerDraft;
  composerPreview: string;
  composerPreviewError: string | null;
  composerSections: ComposerSections;
  flattenedActions: WorkflowStageActionEditor[];
  renderRuleEditor: (stageName: string, rule: WorkflowRule, path: number[]) => ReactNode;
  ruleFieldOptions: string[];
  ruleGuide: LegendItem[];
  savingWorkflow: boolean;
  selectedWorkflow: WorkflowConfigDetail | null;
  onAddInputField: () => void;
  onAddRule: (stageName: string) => void;
  onAddStage: () => void;
  onAddStageAction: () => void;
  onAddTransition: () => void;
  onAutofillTransitions: () => void;
  onCreateBlankWorkflow: () => void;
  onCreateStarterWorkflow: () => void;
  onForkSelectedWorkflow: () => void;
  onMoveStage: (index: number, direction: -1 | 1) => void;
  onNormalizeFieldForType: (
    field: InputFieldDefinition,
    nextType: InputFieldType
  ) => InputFieldDefinition;
  onParseEnumValues: (
    rawValue: string,
    fieldType: InputFieldType
  ) => Array<string | number | boolean> | undefined;
  onParseOptionalNumber: (rawValue: string) => number | undefined;
  onRemoveInputField: (fieldName: string) => void;
  onRemoveStage: (index: number) => void;
  onRemoveStageAction: (index: number) => void;
  onRemoveTransition: (index: number) => void;
  onRenameInputField: (previousFieldName: string, nextFieldName: string) => void;
  onSaveWorkflow: (event: FormEvent<HTMLFormElement>) => void;
  onSetComposerDraft: Dispatch<SetStateAction<WorkflowComposerDraft>>;
  onUpdateInputField: (
    fieldName: string,
    updater: (field: InputFieldDefinition) => InputFieldDefinition
  ) => void;
  onUpdateStageActions: (
    updater: (actions: WorkflowStageActionEditor[]) => WorkflowStageActionEditor[]
  ) => void;
  onUpdateStageName: (index: number, nextName: string) => void;
  onUpdateTransition: (
    index: number,
    updater: (transition: WorkflowTransition) => WorkflowTransition
  ) => void;
}

interface DeferredNameInputProps {
  value: string;
  placeholder: string;
  onCommit: (nextFieldName: string) => void;
}

function DeferredNameInput({
  value,
  placeholder,
  onCommit,
}: DeferredNameInputProps) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  function commitValue() {
    const normalizedValue = draftValue.trim();

    if (!normalizedValue) {
      setDraftValue(value);
      return;
    }

    if (normalizedValue === value) {
      if (draftValue !== value) {
        setDraftValue(value);
      }

      return;
    }

    onCommit(normalizedValue);
  }

  return (
    <input
      className={styles.input}
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={commitValue}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitValue();
          event.currentTarget.blur();
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setDraftValue(value);
          event.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
    />
  );
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

export function WorkflowConsoleBuilder({
  builderChecklist,
  builderFieldNames,
  builderRuleCount,
  composerDraft,
  composerPreview,
  composerPreviewError,
  composerSections,
  flattenedActions,
  renderRuleEditor,
  ruleFieldOptions,
  ruleGuide,
  savingWorkflow,
  selectedWorkflow,
  onAddInputField,
  onAddRule,
  onAddStage,
  onAddStageAction,
  onAddTransition,
  onAutofillTransitions,
  onCreateBlankWorkflow,
  onCreateStarterWorkflow,
  onForkSelectedWorkflow,
  onMoveStage,
  onNormalizeFieldForType,
  onParseEnumValues,
  onParseOptionalNumber,
  onRemoveInputField,
  onRemoveStage,
  onRemoveStageAction,
  onRemoveTransition,
  onRenameInputField,
  onSaveWorkflow,
  onSetComposerDraft,
  onUpdateInputField,
  onUpdateStageActions,
  onUpdateStageName,
  onUpdateTransition,
}: WorkflowConsoleBuilderProps) {
  return (
    <section className={`${styles.panel} ${styles.workspacePanel}`}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.panelEyebrow}>Builder</p>
          <h2 className={styles.panelTitle}>Create the next workflow version</h2>
        </div>
        <div className={styles.inlineActions}>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={onCreateStarterWorkflow}
          >
            Starter flow
          </button>
          <button type="button" className={styles.ghostButton} onClick={onCreateBlankWorkflow}>
            Blank workflow
          </button>
          {selectedWorkflow ? (
            <button type="button" className={styles.ghostButton} onClick={onForkSelectedWorkflow}>
              Fork selected
            </button>
          ) : null}
        </div>
      </header>

      <section className={styles.summaryStrip}>
        <article className={styles.summaryChip}>
          <span className={styles.summaryLabel}>Stages</span>
          <strong className={styles.summaryValue}>{composerSections.stages.length}</strong>
        </article>
        <article className={styles.summaryChip}>
          <span className={styles.summaryLabel}>Fields</span>
          <strong className={styles.summaryValue}>{builderFieldNames.length}</strong>
        </article>
        <article className={styles.summaryChip}>
          <span className={styles.summaryLabel}>Rules</span>
          <strong className={styles.summaryValue}>{builderRuleCount}</strong>
        </article>
        <article className={styles.summaryChip}>
          <span className={styles.summaryLabel}>Actions</span>
          <strong className={styles.summaryValue}>{flattenedActions.length}</strong>
        </article>
      </section>

      <details className={styles.helpPanel}>
        <summary className={styles.helpSummary}>
          <span>Builder guide</span>
          <span className={styles.helpSummaryMeta}>Progress checklist and save readiness</span>
        </summary>
        <div className={styles.helpBody}>
          <div className={styles.checklist}>
            {builderChecklist.map((item) => (
              <div
                key={item.title}
                className={`${styles.checklistItem} ${getGuideToneClass(item.tone)}`}
              >
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </details>

      <datalist id="builder-field-options">
        {ruleFieldOptions.map((fieldName) => (
          <option key={fieldName} value={fieldName} />
        ))}
      </datalist>

      <form className={styles.form} onSubmit={onSaveWorkflow}>
        <section className={styles.sectionCard}>
          <div className={`${styles.sectionHeader} ${styles.sectionPrimaryHeader}`}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionMarker}>Config 1</span>
              <div>
                <h3 className={styles.sectionTitle}>Basics</h3>
                <p className={styles.sectionIntro}>
                  Name the workflow and choose payload strictness. Keep the name stable so each
                  save becomes a new version.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.sectionBody}>
            <div className={styles.builderGrid}>
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="workflow-name">
                  Workflow name
                </label>
                <input
                  id="workflow-name"
                  className={styles.input}
                  value={composerDraft.name}
                  onChange={(event) =>
                    onSetComposerDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="loan_application"
                />
              </div>
            </div>

            <div className={styles.checkboxRow}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={composerDraft.activate}
                  onChange={(event) =>
                    onSetComposerDraft((current) => ({
                      ...current,
                      activate: event.target.checked,
                    }))
                  }
                />
                Activate this version after saving
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={composerDraft.allowUnknown}
                  onChange={(event) =>
                    onSetComposerDraft((current) => ({
                      ...current,
                      allowUnknown: event.target.checked,
                    }))
                  }
                />
                Allow extra request fields
              </label>
            </div>
          </div>
        </section>

        <section className={styles.sectionCard}>
          <div className={`${styles.sectionHeader} ${styles.sectionPrimaryHeader}`}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionMarker}>Config 2</span>
              <div>
                <h3 className={styles.sectionTitle}>Stages and flow</h3>
                <p className={styles.sectionIntro}>
                  Define the stage order and normal transitions. Rules can still branch somewhere
                  else.
                </p>
              </div>
            </div>
            <div className={styles.inlineActions}>
              <button type="button" className={styles.ghostButton} onClick={onAddStage}>
                Add stage
              </button>
              <button type="button" className={styles.ghostButton} onClick={onAutofillTransitions}>
                Auto-connect stages
              </button>
            </div>
          </div>

          <div className={styles.sectionBody}>
            <div className={styles.cardList}>
              {composerSections.stages.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>Add a first stage to start building the workflow.</p>
                </div>
              ) : (
                composerSections.stages.map((stage, index) => (
                  <article key={`stage-${index}`} className={styles.cardItem}>
                    <div className={styles.cardToolbar}>
                      <span className={styles.stageIndex}>Stage {index + 1}</span>
                      <div className={styles.inlineActions}>
                        <button
                          type="button"
                          className={styles.ghostButton}
                          onClick={() => onMoveStage(index, -1)}
                          disabled={index === 0}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className={styles.ghostButton}
                          onClick={() => onMoveStage(index, 1)}
                          disabled={index === composerSections.stages.length - 1}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => onRemoveStage(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className={styles.builderGrid}>
                        <div className={styles.formRow}>
                          <label className={styles.label}>Stage name</label>
                          <DeferredNameInput
                            value={stage}
                            placeholder="decision"
                            onCommit={(nextStageName) => onUpdateStageName(index, nextStageName)}
                          />
                        </div>
                      </div>
                    </article>
                ))
              )}
            </div>

            <div className={`${styles.sectionHeader} ${styles.sectionSubHeader}`}>
              <div className={styles.sectionHeadingCompact}>
                <span className={styles.sectionSubMarker}>Flow detail</span>
                <div>
                  <h4 className={styles.sectionTitle}>Transitions</h4>
                  <p className={styles.sectionIntro}>
                    Transitions handle the normal stage-to-stage path when a rule does not branch
                    elsewhere.
                  </p>
                </div>
              </div>
              <button type="button" className={styles.ghostButton} onClick={onAddTransition}>
                Add transition
              </button>
            </div>

            <div className={styles.cardList}>
              {composerSections.transitions.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No transitions yet.</p>
                  <p className={styles.emptyHint}>
                    Use Auto-connect stages or add one manually.
                  </p>
                </div>
              ) : (
                composerSections.transitions.map((transition, transitionIndex) => (
                  <article key={`transition-${transitionIndex}`} className={styles.cardItem}>
                    <div className={styles.cardToolbar}>
                      <span className={styles.stageIndex}>Transition {transitionIndex + 1}</span>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => onRemoveTransition(transitionIndex)}
                      >
                        Remove
                      </button>
                    </div>

                    <div className={styles.builderGrid}>
                      <div className={styles.formRow}>
                        <label className={styles.label}>From</label>
                        <select
                          className={styles.select}
                          value={transition.from}
                          onChange={(event) =>
                            onUpdateTransition(transitionIndex, (currentTransition) => ({
                              ...currentTransition,
                              from: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select</option>
                          {composerSections.stages.map((stage) => (
                            <option key={`from-${transitionIndex}-${stage}`} value={stage}>
                              {stage}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.formRow}>
                        <label className={styles.label}>To</label>
                        <select
                          className={styles.select}
                          value={transition.to}
                          onChange={(event) =>
                            onUpdateTransition(transitionIndex, (currentTransition) => ({
                              ...currentTransition,
                              to: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select</option>
                          {composerSections.stages.map((stage) => (
                            <option key={`to-${transitionIndex}-${stage}`} value={stage}>
                              {stage}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.formRow}>
                        <label className={styles.label}>When</label>
                        <select
                          className={styles.select}
                          value={transition.condition ?? "always"}
                          onChange={(event) =>
                            onUpdateTransition(transitionIndex, (currentTransition) => ({
                              ...currentTransition,
                              condition: event.target.value as TransitionCondition,
                            }))
                          }
                        >
                          <option value="always">Always</option>
                          <option value="on_success">On success</option>
                          <option value="on_failure">On failure</option>
                        </select>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>

        <section className={styles.sectionCard}>
          <div className={`${styles.sectionHeader} ${styles.sectionPrimaryHeader}`}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionMarker}>Config 3</span>
              <div>
                <h3 className={styles.sectionTitle}>Request inputs</h3>
                <p className={styles.sectionIntro}>
                  Add fields to generate the request form and validation schema automatically.
                </p>
              </div>
            </div>
            <button type="button" className={styles.ghostButton} onClick={onAddInputField}>
              Add field
            </button>
          </div>

          <div className={styles.sectionBody}>
            <div className={styles.cardList}>
              {builderFieldNames.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No input fields yet.</p>
                  <p className={styles.emptyHint}>
                    If you add them here, the request playground will generate a matching form.
                  </p>
                </div>
              ) : (
                Object.entries(composerSections.inputFields).map(
                  ([fieldName, fieldConfig], fieldIndex) => (
                    <article key={`field-${fieldIndex}`} className={styles.cardItem}>
                      <div className={styles.cardToolbar}>
                        <span className={styles.stageIndex}>Field {fieldIndex + 1}</span>
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => onRemoveInputField(fieldName)}
                        >
                          Remove
                        </button>
                      </div>

                      <div className={styles.builderGrid}>
                        <div className={styles.formRow}>
                          <label className={styles.label}>Field name</label>
                          <DeferredNameInput
                            value={fieldName}
                            placeholder="amount"
                            onCommit={(nextFieldName) =>
                              onRenameInputField(fieldName, nextFieldName)
                            }
                          />
                        </div>

                        <div className={styles.formRow}>
                          <label className={styles.label}>Type</label>
                          <select
                            className={styles.select}
                            value={fieldConfig.type}
                            onChange={(event) =>
                              onUpdateInputField(fieldName, (currentField) =>
                                onNormalizeFieldForType(
                                  currentField,
                                  event.target.value as InputFieldType
                                )
                              )
                            }
                          >
                            <option value="string">String</option>
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                          </select>
                        </div>
                      </div>

                      <div className={styles.builderGrid}>
                        <div className={styles.formRow}>
                          <label className={styles.label}>Description</label>
                          <input
                            className={styles.input}
                            value={fieldConfig.description ?? ""}
                            onChange={(event) =>
                              onUpdateInputField(fieldName, (currentField) => ({
                                ...currentField,
                                description: event.target.value,
                              }))
                            }
                            placeholder="Requested loan amount"
                          />
                        </div>

                        <div className={styles.formRow}>
                          <label className={styles.label}>Allowed values</label>
                          <input
                            className={styles.input}
                            value={formatEnumValues(fieldConfig.enum)}
                            onChange={(event) =>
                              onUpdateInputField(fieldName, (currentField) => ({
                                ...currentField,
                                enum: onParseEnumValues(event.target.value, currentField.type),
                              }))
                            }
                            placeholder="passed, failed, pending"
                          />
                          <p className={styles.helperText}>Comma-separated or one per line.</p>
                        </div>
                      </div>

                      <div className={styles.checkboxRow}>
                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={fieldConfig.required ?? true}
                            onChange={(event) =>
                              onUpdateInputField(fieldName, (currentField) => ({
                                ...currentField,
                                required: event.target.checked,
                              }))
                            }
                          />
                          Required
                        </label>
                        {fieldConfig.type === "number" ? (
                          <label className={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={fieldConfig.integer ?? false}
                              onChange={(event) =>
                                onUpdateInputField(fieldName, (currentField) => ({
                                  ...currentField,
                                  integer: event.target.checked,
                                }))
                              }
                            />
                            Whole number only
                          </label>
                        ) : null}
                      </div>

                      {fieldConfig.type === "number" ? (
                        <div className={styles.builderGrid}>
                          <div className={styles.formRow}>
                            <label className={styles.label}>Minimum</label>
                            <input
                              className={styles.input}
                              type="number"
                              value={fieldConfig.min ?? ""}
                              onChange={(event) =>
                                onUpdateInputField(fieldName, (currentField) => ({
                                  ...currentField,
                                  min: onParseOptionalNumber(event.target.value),
                                }))
                              }
                            />
                          </div>
                          <div className={styles.formRow}>
                            <label className={styles.label}>Maximum</label>
                            <input
                              className={styles.input}
                              type="number"
                              value={fieldConfig.max ?? ""}
                              onChange={(event) =>
                                onUpdateInputField(fieldName, (currentField) => ({
                                  ...currentField,
                                  max: onParseOptionalNumber(event.target.value),
                                }))
                              }
                            />
                          </div>
                        </div>
                      ) : null}

                      {fieldConfig.type === "string" ? (
                        <div className={styles.builderGrid}>
                          <div className={styles.formRow}>
                            <label className={styles.label}>Minimum length</label>
                            <input
                              className={styles.input}
                              type="number"
                              value={fieldConfig.minLength ?? ""}
                              onChange={(event) =>
                                onUpdateInputField(fieldName, (currentField) => ({
                                  ...currentField,
                                  minLength: onParseOptionalNumber(event.target.value),
                                }))
                              }
                            />
                          </div>
                          <div className={styles.formRow}>
                            <label className={styles.label}>Maximum length</label>
                            <input
                              className={styles.input}
                              type="number"
                              value={fieldConfig.maxLength ?? ""}
                              onChange={(event) =>
                                onUpdateInputField(fieldName, (currentField) => ({
                                  ...currentField,
                                  maxLength: onParseOptionalNumber(event.target.value),
                                }))
                              }
                            />
                          </div>
                          <div className={styles.formRow}>
                            <label className={styles.label}>Pattern</label>
                            <input
                              className={styles.input}
                              value={fieldConfig.pattern ?? ""}
                              onChange={(event) =>
                                onUpdateInputField(fieldName, (currentField) => ({
                                  ...currentField,
                                  pattern: event.target.value,
                                }))
                              }
                              placeholder="^[a-z]+$"
                            />
                          </div>
                        </div>
                      ) : null}
                    </article>
                  )
                )
              )}
            </div>
          </div>
        </section>

        <section className={styles.sectionCard}>
          <div className={`${styles.sectionHeader} ${styles.sectionPrimaryHeader}`}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionMarker}>Config 4</span>
              <div>
                <h3 className={styles.sectionTitle}>Stage actions</h3>
                <p className={styles.sectionIntro}>
                  Add only if a stage needs side effects such as external scoring.
                </p>
              </div>
            </div>
            <button type="button" className={styles.ghostButton} onClick={onAddStageAction}>
              Add action
            </button>
          </div>

          <div className={styles.sectionBody}>
            <div className={styles.cardList}>
              {flattenedActions.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No stage actions yet.</p>
                  <p className={styles.emptyHint}>
                    You can skip this section unless a stage needs side effects.
                  </p>
                </div>
              ) : (
                flattenedActions.map((action, actionIndex) => (
                  <article key={`action-${actionIndex}`} className={styles.cardItem}>
                    <div className={styles.cardToolbar}>
                      <span className={styles.stageIndex}>Action {actionIndex + 1}</span>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => onRemoveStageAction(actionIndex)}
                      >
                        Remove
                      </button>
                    </div>

                    <div className={styles.builderGrid}>
                      <div className={styles.formRow}>
                        <label className={styles.label}>Stage</label>
                        <select
                          className={styles.select}
                          value={action.stage}
                          onChange={(event) =>
                            onUpdateStageActions((actions) =>
                              actions.map((currentAction, index) =>
                                index === actionIndex
                                  ? {
                                      ...currentAction,
                                      stage: event.target.value,
                                    }
                                  : currentAction
                              )
                            )
                          }
                        >
                          <option value="">Select</option>
                          {composerSections.stages.map((stage) => (
                            <option key={`${action.id}-${stage}`} value={stage}>
                              {stage}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.formRow}>
                        <label className={styles.label}>Action ID</label>
                        <input
                          className={styles.input}
                          value={action.id}
                          onChange={(event) =>
                            onUpdateStageActions((actions) =>
                              actions.map((currentAction, index) =>
                                index === actionIndex
                                  ? {
                                      ...currentAction,
                                      id: event.target.value,
                                    }
                                  : currentAction
                              )
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className={styles.builderGrid}>
                      <div className={styles.formRow}>
                        <label className={styles.label}>Target field</label>
                        <input
                          className={styles.input}
                          value={action.targetField}
                          onChange={(event) =>
                            onUpdateStageActions((actions) =>
                              actions.map((currentAction, index) =>
                                index === actionIndex
                                  ? {
                                      ...currentAction,
                                      targetField: event.target.value,
                                    }
                                  : currentAction
                              )
                            )
                          }
                          placeholder="external_score"
                        />
                      </div>

                      <div className={styles.formRow}>
                        <label className={styles.label}>Processed flag field</label>
                        <input
                          className={styles.input}
                          value={action.processedFlagField ?? ""}
                          onChange={(event) =>
                            onUpdateStageActions((actions) =>
                              actions.map((currentAction, index) =>
                                index === actionIndex
                                  ? {
                                      ...currentAction,
                                      processedFlagField: event.target.value,
                                    }
                                  : currentAction
                              )
                            )
                          }
                          placeholder="external_score_processed"
                        />
                      </div>
                    </div>

                    <div className={styles.formRow}>
                      <label className={styles.label}>History message</label>
                      <input
                        className={styles.input}
                        value={action.historyMessage ?? ""}
                        onChange={(event) =>
                          onUpdateStageActions((actions) =>
                            actions.map((currentAction, index) =>
                              index === actionIndex
                                ? {
                                    ...currentAction,
                                    historyMessage: event.target.value,
                                  }
                                : currentAction
                            )
                          )
                        }
                        placeholder="Fetched external score"
                      />
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>

        <section className={styles.sectionCard}>
          <div className={`${styles.sectionHeader} ${styles.sectionPrimaryHeader}`}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionMarker}>Config 5</span>
              <div>
                <h3 className={styles.sectionTitle}>Rules per stage</h3>
                <p className={styles.sectionIntro}>
                  Add validation and branching in the order they should run.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.sectionBody}>
            <details className={styles.helpPanel}>
              <summary className={styles.helpSummary}>
                <span>Rule types</span>
                <span className={styles.helpSummaryMeta}>
                  Required, equals, thresholds, branching
                </span>
              </summary>
              <div className={styles.helpBody}>
                <div className={styles.legendGrid}>
                  {ruleGuide.map((item) => (
                    <article key={item.title} className={styles.legendItem}>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </div>
              </div>
            </details>

            <div className={styles.cardList}>
              {composerSections.stages.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>Create a stage first so the builder knows where to place the rules.</p>
                </div>
              ) : (
                composerSections.stages.map((stage) => (
                  <article key={stage} className={styles.cardItem}>
                    <div className={styles.cardToolbar}>
                      <div>
                        <strong>{stage}</strong>
                        <p className={styles.helperText}>
                          {countNestedRules(composerSections.rules[stage] ?? [])} configured rule(s)
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => onAddRule(stage)}
                      >
                        Add rule
                      </button>
                    </div>

                    <div className={styles.ruleStack}>
                      {(composerSections.rules[stage] ?? []).length === 0 ? (
                        <div className={styles.emptyState}>
                          <p>No rules yet for {stage}.</p>
                          <p className={styles.emptyHint}>
                            Add a required, equals, greater-than, or conditional rule.
                          </p>
                        </div>
                      ) : (
                        (composerSections.rules[stage] ?? []).map((rule, ruleIndex) =>
                          renderRuleEditor(stage, rule, [ruleIndex])
                        )
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>

        <section className={styles.sectionCard}>
          <div className={`${styles.sectionHeader} ${styles.sectionPrimaryHeader}`}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionMarker}>Config 6</span>
              <div>
                <h3 className={styles.sectionTitle}>Advanced JSON</h3>
                <p className={styles.sectionIntro}>
                  You can still drop into raw JSON for edge cases, but the guided builder stays in
                  sync.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.sectionBody}>
            {(composerSections.errors.inputFields ||
              composerSections.errors.stageActions ||
              composerSections.errors.rules ||
              composerSections.errors.transitions) ? (
              <div className={styles.previewError}>
                {composerSections.errors.inputFields ??
                  composerSections.errors.stageActions ??
                  composerSections.errors.rules ??
                  composerSections.errors.transitions}
              </div>
            ) : null}

            <details className={styles.advancedPanel}>
              <summary className={styles.advancedSummary}>Open raw JSON editors</summary>
              <div className={styles.advancedGrid}>
                <div className={styles.formRow}>
                  <label className={styles.label}>Input fields JSON</label>
                  <textarea
                    className={styles.textareaTall}
                    rows={12}
                    value={composerDraft.inputFieldsText}
                    onChange={(event) =>
                      onSetComposerDraft((current) => ({
                        ...current,
                        inputFieldsText: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className={styles.formRow}>
                  <label className={styles.label}>Stage actions JSON</label>
                  <textarea
                    className={styles.textareaTall}
                    rows={12}
                    value={composerDraft.stageActionsText}
                    onChange={(event) =>
                      onSetComposerDraft((current) => ({
                        ...current,
                        stageActionsText: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className={styles.formRow}>
                  <label className={styles.label}>Rules JSON</label>
                  <textarea
                    className={styles.textareaTall}
                    rows={14}
                    value={composerDraft.rulesText}
                    onChange={(event) =>
                      onSetComposerDraft((current) => ({
                        ...current,
                        rulesText: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className={styles.formRow}>
                  <label className={styles.label}>Transitions JSON</label>
                  <textarea
                    className={styles.textareaTall}
                    rows={10}
                    value={composerDraft.transitionsText}
                    onChange={(event) =>
                      onSetComposerDraft((current) => ({
                        ...current,
                        transitionsText: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </details>
          </div>
        </section>

        <div className={styles.submitRow}>
          <button type="submit" className={styles.primaryButton} disabled={savingWorkflow}>
            {savingWorkflow ? "Saving..." : "Create workflow version"}
          </button>
          <span className={styles.helperText}>
            This still saves through `POST /api/workflow-config`.
          </span>
        </div>
      </form>

      <div className={styles.previewCard}>
        <div className={styles.previewHeader}>
          <h3 className={styles.detailTitle}>Compiled API payload</h3>
          <span className={styles.panelMeta}>Generated from the guided builder</span>
        </div>
        {composerPreviewError ? (
          <div className={styles.previewError}>{composerPreviewError}</div>
        ) : (
          <pre className={styles.codeBlock}>{composerPreview}</pre>
        )}
      </div>
    </section>
  );
}
