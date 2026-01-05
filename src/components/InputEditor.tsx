interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function InputEditor({ value, onChange }: Props) {
  return (
    <textarea
      style={{ width: "100%", height: "220px" }}
      placeholder="Paste subtitle text or SRT here..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
