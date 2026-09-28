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
}: {
  properties: Array<{ id: string; name: string }>;
  value: string | null;
  onChange: (id: string) => void;
}) {
  if (properties.length < 2) return null;
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className="h-11 w-full sm:w-56">
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
