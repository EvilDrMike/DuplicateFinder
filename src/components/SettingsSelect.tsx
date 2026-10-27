import { useEffect, useRef, useState } from "react";
import type { UiTheme } from "../constants";

type SelectOption = {
  value: string;
  label: string;
};

type SettingsSelectProps = {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  theme: UiTheme;
};

export function SettingsSelect({
  id,
  label,
  value,
  options,
  onChange,
  theme,
}: SettingsSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!isOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    window.addEventListener("pointerdown", closeOutside);
    return () => window.removeEventListener("pointerdown", closeOutside);
  }, [isOpen]);

  if (theme !== "retro-future") {
    return (
      <select
        id={id}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!isOpen && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setActiveIndex(selectedIndex);
      setIsOpen(true);
      return;
    }
    if (!isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) =>
        Math.max(0, Math.min(options.length - 1, index + direction)),
      );
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) onChange(option.value);
      setIsOpen(false);
    }
  }

  return (
    <div className="retro-settings-select" ref={rootRef}>
      <button
        id={id}
        className="retro-settings-select-trigger"
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `${id}-listbox` : undefined}
        aria-activedescendant={
          isOpen ? `${id}-option-${activeIndex}` : undefined
        }
        onClick={() => {
          setActiveIndex(selectedIndex);
          setIsOpen((open) => !open);
        }}
        onKeyDown={handleKeyDown}>
        <span>{selectedOption?.label ?? value}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {isOpen && (
        <div
          className="retro-settings-select-menu"
          id={`${id}-listbox`}
          role="listbox"
          aria-label={label}>
          {options.map((option, index) => (
            <div
              className={`retro-settings-select-option ${index === activeIndex ? "active" : ""}`}
              id={`${id}-option-${index}`}
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}>
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
