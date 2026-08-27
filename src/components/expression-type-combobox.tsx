"use client";

import { MultiSelectField } from "@/components/multi-select-field";
import {
  expressionTypeDescriptions,
  expressionTypeLabels,
  type ProductionConfig,
} from "@/lib/production-config";

type ExpressionType = ProductionConfig["expressionType"];

export function ExpressionTypeCombobox({
  values,
  customValue,
  onChange,
}: {
  values: ExpressionType[];
  customValue: string;
  onChange: (
    values: ExpressionType[],
    customValue: string,
  ) => void;
}) {
  const descriptions = values
    .map((value) => expressionTypeDescriptions[value])
    .filter(Boolean);

  return (
    <MultiSelectField
      label="AI 前贴类型"
      values={values}
      options={Object.entries(expressionTypeLabels).map(
        ([value, label]) => ({
          value: value as ExpressionType,
          label,
        }),
      )}
      description={`${descriptions.join("；")}。单次生成多个脚本时，每条脚本会从已选类型中独立选择一种。`}
      customValue="custom"
      customText={customValue}
      customPlaceholder="输入自定义表达类型"
      onChange={(nextValues) =>
        onChange(nextValues, customValue)}
      onCustomChange={(nextCustomValue) =>
        onChange(values, nextCustomValue)}
    />
  );
}
