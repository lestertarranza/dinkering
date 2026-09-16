import { Field, inputClass } from "@/components/ui";

export function InviteSelect({
  name = "invited_by",
  options,
  defaultValue = "",
  required = false,
  allowFounding = false,
  allowUnset = true,
  hint,
}: {
  name?: string;
  options: { id: string; label: string }[];
  defaultValue?: string;
  required?: boolean;
  allowFounding?: boolean;
  allowUnset?: boolean;
  hint?: string;
}) {
  return (
    <Field
      label={allowFounding ? "Who invited them" : "Who invited you"}
      hint={
        hint ??
        (allowFounding
          ? "Founding members joined at the start. Everyone else names the teammate who brought them in."
          : "Pick the teammate who invited you.")
      }
    >
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        className={inputClass}
      >
        {allowUnset ? (
          <option value="">{required ? "Pick who invited them" : "Not set yet"}</option>
        ) : (
          <option value="">Pick who invited you</option>
        )}
        {allowFounding ? (
          <option value="founding">Founding member</option>
        ) : null}
        {options.length > 0 ? (
          <optgroup label="Invited by">
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </Field>
  );
}
