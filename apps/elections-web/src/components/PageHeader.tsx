import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

// Shared page header: title left, provenance line right. Every page carries
// the same meta so the ordinal-not-probability discipline is always in view.
export function PageHeader({
  title,
  meta,
}: {
  title: string;
  meta?: string;
}) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="baseline"
      flexWrap="wrap"
      useFlexGap
      spacing={1}
      sx={{ mb: 2.5 }}
    >
      <Typography variant="h5" sx={{ fontWeight: 300 }}>
        {title}
      </Typography>
      {meta && (
        <Typography variant="caption" color="text.secondary">
          {meta}
        </Typography>
      )}
    </Stack>
  );
}
