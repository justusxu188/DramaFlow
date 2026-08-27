"use client";

import {
  subtitleFontTypeLabels,
  subtitleFontTypes,
  subtitlePositionLabels,
  subtitlePositions,
} from "@/lib/production-config";
import {
  SUBTITLE_BURN_DEFAULTS,
  type SubtitleBurnStyle,
} from "@/lib/subtitle-post-production";

export function SubtitleStyleControls({
  value,
  onChange,
  ariaLabelPrefix,
  disabled = false,
}: {
  value: SubtitleBurnStyle;
  onChange: (value: SubtitleBurnStyle) => void;
  ariaLabelPrefix: string;
  disabled?: boolean;
}) {
  const rgbaValid = /^#[0-9A-Fa-f]{8}$/.test(value.fontColor);
  const pickerValue = rgbaValid
    ? value.fontColor.slice(0, 7)
    : SUBTITLE_BURN_DEFAULTS.fontColor.slice(0, 7);

  return (
    <fieldset className="subtitle-style-controls" disabled={disabled}>
      <legend>字幕样式</legend>
      <label>
        <span>字体</span>
        <select
          aria-label={ariaLabelPrefix + "字幕字体"}
          value={value.fontType}
          onChange={(event) =>
            onChange({
              ...value,
              fontType: event.target
                .value as SubtitleBurnStyle["fontType"],
            })
          }
        >
          {subtitleFontTypes.map((fontType) => (
            <option key={fontType} value={fontType}>
              {subtitleFontTypeLabels[fontType]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>字号</span>
        <input
          aria-label={ariaLabelPrefix + "字幕字号"}
          type="number"
          min={12}
          max={160}
          value={value.fontSize}
          onChange={(event) => {
            const fontSize = Number(event.target.value);
            if (!Number.isFinite(fontSize)) return;
            onChange({ ...value, fontSize });
          }}
        />
      </label>
      <label className="subtitle-style-color">
        <span>颜色</span>
        <div className="color-picker-row">
          <input
            aria-label={ariaLabelPrefix + "字幕颜色"}
            type="color"
            value={pickerValue}
            onChange={(event) =>
              onChange({
                ...value,
                fontColor: (event.target.value + (
                  rgbaValid ? value.fontColor.slice(7, 9) : "FF"
                )).toUpperCase(),
              })
            }
          />
          <input
            aria-label={ariaLabelPrefix + "字幕颜色代码"}
            type="text"
            value={value.fontColor}
            maxLength={9}
            placeholder="#FFFFFFFF"
            aria-invalid={!rgbaValid}
            onChange={(event) =>
              onChange({
                ...value,
                fontColor: event.target.value.toUpperCase(),
              })
            }
          />
        </div>
      </label>
      <label>
        <span>位置</span>
        <select
          aria-label={ariaLabelPrefix + "字幕位置"}
          value={value.position}
          onChange={(event) =>
            onChange({
              ...value,
              position: event.target
                .value as SubtitleBurnStyle["position"],
            })
          }
        >
          {subtitlePositions.map((position) => (
            <option key={position} value={position}>
              {subtitlePositionLabels[position]}
            </option>
          ))}
        </select>
      </label>
      {!rgbaValid && (
        <small className="subtitle-style-error">
          颜色需使用 #RRGGBBAA 格式
        </small>
      )}
    </fieldset>
  );
}
