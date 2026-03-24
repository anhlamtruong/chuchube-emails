const formats = [
  "2026-03-20T14:19:51.123456Z",
  "2026-03-20T14:19:51.123456+00:00Z",
  "2026-03-20T14:19:51.123456+00:00",
  "2026-03-20T14:19:51Z",
  null,
  "",
];

for (const f of formats) {
  const d = new Date(f);
  const valid = Number.isFinite(d.getTime());
  console.log(
    JSON.stringify(f),
    "=>",
    valid ? d.toISOString() : "Invalid Date",
  );
}
