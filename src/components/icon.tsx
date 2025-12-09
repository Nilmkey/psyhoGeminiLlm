import Box from "@mui/material/Box";
export default function Icon() {
  return (
    <Box
      component="img"
      src="image.png"
      alt="icon"
      sx={{
        height: (theme) => ({ height: theme.typography.h1.fontSize }),
        my: "15px",
        // m: 0,
      }}
    />
  );
}
