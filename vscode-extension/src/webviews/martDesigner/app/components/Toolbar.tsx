import React from 'react';

interface ToolbarProps {
  martName: string;
  concept: string;
  dimensionCount: number;
  factCount: number;
  isDirty: boolean;
  validationErrors: number;
  validationWarnings: number;
  onSave: () => void;
  onGenerate: () => void;
  onValidate: () => void;
  onAutoLayout?: () => void;
  onNewDimension: () => void;
  onNewFact: () => void;
}

/**
 * Toolbar component for Mart Designer.
 *
 * Features:
 * - Display mart name and concept
 * - Show dimension/fact counts
 * - Save and Generate buttons
 * - Validation status indicator
 * - Auto-layout button (optional)
 */
export function Toolbar({
  martName,
  concept,
  dimensionCount,
  factCount,
  isDirty,
  validationErrors,
  validationWarnings,
  onSave,
  onGenerate,
  onValidate,
  onAutoLayout,
  onNewDimension,
  onNewFact
}: ToolbarProps) {
  const hasErrors = validationErrors > 0;
  const hasWarnings = validationWarnings > 0;

  return (
    <div className="toolbar">
      {/* Left section: Name and info */}
      <div className="toolbar-left">
        <span className="mart-name">
          {martName || 'New Mart'}
          {isDirty && <span className="dirty-indicator"> ●</span>}
        </span>
        <span className="mart-concept">({concept || 'no concept'})</span>

        {/* New Node Buttons */}
        <div className="toolbar-new-buttons">
          <button
            className="toolbar-btn"
            onClick={onNewDimension}
            title="Create new Dimension"
          >
            + Dimension
          </button>
          <button
            className="toolbar-btn"
            onClick={onNewFact}
            title="Create new Fact"
          >
            + Fact
          </button>
        </div>
      </div>

      {/* Center section: Stats and validation */}
      <div className="toolbar-center">
        <span className="stats">
          {dimensionCount} Dim{dimensionCount !== 1 ? 's' : ''},{' '}
          {factCount} Fact{factCount !== 1 ? 's' : ''}
        </span>

        {/* Validation Status */}
        <button
          className={`validation-btn ${hasErrors ? 'has-errors' : hasWarnings ? 'has-warnings' : 'valid'}`}
          onClick={onValidate}
          title={
            hasErrors
              ? `${validationErrors} error(s)`
              : hasWarnings
              ? `${validationWarnings} warning(s)`
              : 'No issues'
          }
        >
          {hasErrors ? (
            <>
              <span className="icon">⚠</span>
              <span className="count">{validationErrors}</span>
            </>
          ) : hasWarnings ? (
            <>
              <span className="icon">⚡</span>
              <span className="count">{validationWarnings}</span>
            </>
          ) : (
            <span className="icon">✓</span>
          )}
        </button>
      </div>

      {/* Right section: Actions */}
      <div className="toolbar-right">
        {onAutoLayout && (
          <button
            className="toolbar-btn"
            onClick={onAutoLayout}
            title="Auto-arrange nodes"
          >
            Layout
          </button>
        )}

        <button
          className="toolbar-btn"
          onClick={onSave}
          title="Save design (Ctrl+S)"
        >
          Save
        </button>

        <button
          className="toolbar-btn primary"
          onClick={onGenerate}
          disabled={hasErrors}
          title={hasErrors ? 'Fix errors before generating' : 'Generate dbt models'}
        >
          Generate
        </button>
      </div>
    </div>
  );
}

/**
 * Empty state toolbar (when no nodes exist)
 */
export function EmptyToolbar({
  martName,
  concept,
  onSave,
  onGenerate,
  onNewDimension,
  onNewFact
}: Pick<ToolbarProps, 'martName' | 'concept' | 'onSave' | 'onGenerate' | 'onNewDimension' | 'onNewFact'>) {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="mart-name">{martName || 'New Mart'}</span>
        <span className="mart-concept">({concept || 'no concept'})</span>

        {/* New Node Buttons */}
        <div className="toolbar-new-buttons">
          <button
            className="toolbar-btn"
            onClick={onNewDimension}
            title="Create new Dimension"
          >
            + Dimension
          </button>
          <button
            className="toolbar-btn"
            onClick={onNewFact}
            title="Create new Fact"
          >
            + Fact
          </button>
        </div>
      </div>

      <div className="toolbar-center" />

      <div className="toolbar-right">
        <button className="toolbar-btn" onClick={onSave}>
          Save
        </button>
        <button className="toolbar-btn primary" onClick={onGenerate}>
          Generate
        </button>
      </div>
    </div>
  );
}
