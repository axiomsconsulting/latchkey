import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PropertyPicker({
  properties,
  value,
  onChange,
  className,
  label,
}: {
  properties: Array<{ id: string; name: string }>;
  value: string | null;
  onChange: (id: string) => void;
  className?: string;
  /** Accessible name, e.g. "Switch property". */
  label?: string;
}) {
  if (properties.length < 2) return null;
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger className={className ?? "h-11 w-full sm:w-56"} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {properties.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
