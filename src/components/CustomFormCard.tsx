"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import type { FormField, FormTemplateView } from "@/server/workflows/types";

type CustomFormCardProps = {
  template: FormTemplateView;
  today: string;
};

export function CustomFormCard({ template, today }: CustomFormCardProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(template.fields.map((field) => [field.id, defaultValueForField(field, today)])),
  );

  const updateValue = (fieldId: string, value: string) => {
    setValues((current) => ({ ...current, [fieldId]: value }));
  };

  return (
    <form
      action="/api/forms/submissions"
      method="post"
      className="mini-form"
      aria-label={`Submit ${template.title}`}
    >
      <input type="hidden" name="templateId" value={template.id} />
      <div>
        <h3>{template.title}</h3>
        <p className="muted">{template.description}</p>
      </div>
      <div className="field-grid">
        {template.fields
          .filter((field) => isVisible(field, values))
          .map((field) => (
            <FormFieldInput
              key={field.id}
              field={field}
              value={values[field.id] ?? ""}
              onValueChange={updateValue}
            />
          ))}
      </div>
      {template.visibilityRules.length > 0 ? (
        <p className="muted">{template.visibilitySummary}</p>
      ) : null}
      <button className="button primary" type="submit">
        Submit form
      </button>
    </form>
  );
}

function FormFieldInput({
  field,
  value,
  onValueChange,
}: {
  field: FormField;
  value: string;
  onValueChange: (fieldId: string, value: string) => void;
}) {
  const commonProps = {
    name: field.id,
    required: field.required,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onValueChange(field.id, event.currentTarget.value),
  };

  if (field.type === "textarea") {
    return (
      <label>
        {field.label}
        <textarea {...commonProps} rows={3} placeholder={field.label} />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label>
        {field.label}
        <select {...commonProps}>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="check-row">
        <input
          name={field.id}
          type="checkbox"
          value="yes"
          checked={value === "yes"}
          onChange={(event) => onValueChange(field.id, event.currentTarget.checked ? "yes" : "")}
        />
        {field.label}
      </label>
    );
  }

  if (field.type === "file") {
    return (
      <>
        <label>
          {field.label}
          <input
            name={`${field.id}__FileName`}
            placeholder="File name"
            required={field.required}
            onChange={(event) => onValueChange(field.id, event.currentTarget.value ? "Attachment evidence provided" : "")}
          />
        </label>
        <label>
          Storage ref
          <input name={`${field.id}__StorageKey`} placeholder="Optional object key" />
          <input type="hidden" name={`${field.id}__MimeType`} value="application/pdf" />
          <input type="hidden" name={`${field.id}__ScanStatus`} value="pending" />
          <input type="hidden" name={`${field.id}__FileSizeBytes`} value="0" />
          <input type="hidden" name={field.id} value={value} />
        </label>
      </>
    );
  }

  return (
    <label>
      {field.label}
      <input
        {...commonProps}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        placeholder={field.label}
      />
    </label>
  );
}

function isVisible(field: FormField, values: Record<string, string>) {
  if (!field.visibilityRule) {
    return true;
  }

  const actual = values[field.visibilityRule.fieldId] ?? "";
  return actual.trim().toLowerCase() === field.visibilityRule.expectedValue.trim().toLowerCase();
}

function defaultValueForField(field: FormField, today: string) {
  if (field.type === "date") return today;
  if (field.type === "select") return field.options?.[0] ?? "";
  return "";
}
