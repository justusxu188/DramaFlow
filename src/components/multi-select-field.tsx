"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export function MultiSelectField<T extends string>({
  label,
  ariaLabel,
  values,
  options,
  description,
  customValue,
  customText,
  customPlaceholder,
  onChange,
  onCustomChange,
}: {
  label: string;
  ariaLabel?: string;
  values: T[];
  options: Array<{ value: T; label: string }>;
  description?: string;
  customValue?: T;
  customText?: string;
  customPlaceholder?: string;
  onChange: (values: T[]) => void;
  onCustomChange?: (value: string) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const customSelected = Boolean(
    customValue &&
    values.includes(customValue) &&
    onCustomChange,
  );
  const wasCustomSelectedRef = useRef(customSelected);
  const selectedLabels = options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      window.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (customSelected && !wasCustomSelectedRef.current) {
      customInputRef.current?.focus();
    }
    wasCustomSelectedRef.current = customSelected;
  }, [customSelected]);

  function toggle(value: T) {
    if (values.includes(value)) {
      if (values.length === 1) return;
      onChange(values.filter((item) => item !== value));
      return;
    }
    onChange([...values, value]);
    if (value === customValue) {
      setOpen(false);
    }
  }

  return (
    <div className="multi-select-field" ref={rootRef}>
      <label>{label}</label>
      {customSelected ? (
        <div className="multi-select-custom-trigger">
          <input
            ref={customInputRef}
            className="multi-select-custom-input"
            role="combobox"
            value={customText ?? ""}
            placeholder={customPlaceholder}
            aria-label={`${ariaLabel ?? label}自定义内容`}
            aria-controls={listId}
            aria-expanded={open}
            aria-haspopup="listbox"
            onChange={(event) =>
              onCustomChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          <button
            type="button"
            aria-label={`打开${ariaLabel ?? label}选项`}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronDown size={17} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="multi-select-trigger"
          role="combobox"
          aria-label={ariaLabel ?? label}
          aria-controls={listId}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((current) => !current)}
        >
          <span>
            {selectedLabels.length
              ? selectedLabels.join("、")
              : "请选择"}
          </span>
          <ChevronDown size={17} />
        </button>
      )}
      {open && (
        <div
          className="multi-select-menu"
          id={listId}
          role="listbox"
          aria-label={`${label}选项`}
          aria-multiselectable="true"
        >
          {options.map((option) => {
            const selected = values.includes(option.value);
            return (
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={selected ? "selected" : ""}
                key={option.value}
                onClick={() => toggle(option.value)}
              >
                <i>{selected && <Check size={14} />}</i>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {description && <small>{description}</small>}
    </div>
  );
}
