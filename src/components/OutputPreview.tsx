interface Props {
  value: string;
}

export default function OutputPreview({ value }: Props) {
  return (
    <textarea
      style={{ width: "100%", height: "220px" }}
      value={value}
      readOnly
    />
  );
}
