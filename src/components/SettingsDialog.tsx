import {
  motionPreferences,
  uiThemes,
  type MotionPreference,
  type UiTheme,
} from "../constants";
import { Dialog } from "./Modal";

type SettingsDialogProps = {
  theme: UiTheme;
  motion: MotionPreference;
  onThemeChange: (theme: UiTheme) => void;
  onMotionChange: (motion: MotionPreference) => void;
  onClose: () => void;
};

export function SettingsDialog({
  theme,
  motion,
  onThemeChange,
  onMotionChange,
  onClose,
}: SettingsDialogProps) {
  return (
    <Dialog
      eyebrow="SETTINGS"
      title="Appearance"
      titleId="settings-title"
      closeLabel="Close settings"
      className="settings-dialog"
      onClose={onClose}>
      <fieldset className="theme-options">
        <legend>Interface style</legend>
        {uiThemes.map((option) => (
          <label
            className={`theme-option ${theme === option.id ? "active" : ""}`}
            key={option.id}>
            <input
              type="radio"
              name="ui-theme"
              value={option.id}
              checked={theme === option.id}
              onChange={() => onThemeChange(option.id)}
            />
            <span className={`theme-swatch swatch-${option.id}`} />
            <span className="theme-option-text">
              <strong>{option.name}</strong>
              <span>{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="theme-options motion-options">
        <legend>Animations</legend>
        {motionPreferences.map((option) => (
          <label
            className={`theme-option compact ${motion === option.id ? "active" : ""}`}
            key={option.id}>
            <input
              type="radio"
              name="motion-preference"
              value={option.id}
              checked={motion === option.id}
              onChange={() => onMotionChange(option.id)}
            />
            <span className="theme-option-text">
              <strong>{option.name}</strong>
              <span>{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}
